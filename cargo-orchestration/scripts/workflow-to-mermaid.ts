// workflow-to-mermaid.ts — turn a Cargo node graph into a Mermaid flowchart so
// a user can see what a workflow does before approving, deploying, or debugging it.
//
// Hand-transcribing a graph is where diagrams go wrong: node slugs are NOT
// unique within a release (six nodes called `variables` is a real, shipped
// workflow), `childrenUuids` order carries the branch semantics, and
// `fallbackChildUuid` edges are invisible in the node list. This script reads
// the graph by uuid and emits the same diagram every time.
//
// Usage:
//   cargo-ai orchestration release get-deployed --workflow-uuid <uuid> \
//     | node <skill-dir>/scripts/workflow-to-mermaid.ts
//   node workflow-to-mermaid.ts --file release.json --title "Find LinkedIn URL"
//   node workflow-to-mermaid.ts --file draft.json --paid companyEnrich,apolloio
//   node workflow-to-mermaid.ts --file release.json --highlight waterfall_enrich
//   node workflow-to-mermaid.ts --fixtures
//
// Flags:
//   --file <path>        read from a file instead of stdin
//   --title <text>       diagram title (rendered as a Mermaid frontmatter title)
//   --direction <TD|LR>  flow direction (default TD)
//   --paid <a,b>         slugs/uuids of credits-billing nodes — marked 💳
//   --highlight <a,b>    slugs/uuids to mark red (the failing node in a trace)
//   --fixtures           run the built-in fixture suite and exit non-zero on drift
//
// Runtime contract: Node >= 22.18 runs this file directly (native
// type-stripping) — erasable TypeScript only, node:* builtins only.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CargoNode = {
  uuid: string;
  slug?: string;
  name?: string;
  kind?: string;
  actionSlug?: string;
  integrationSlug?: string;
  toolUuid?: string;
  agentUuid?: string;
  childrenUuids?: (string | null)[];
  fallbackChildUuid?: string | null;
  config?: Record<string, unknown>;
};

export type DiagramOptions = {
  title?: string;
  direction?: string;
  paid?: string[];
  highlight?: string[];
};

type Shape = [open: string, close: string];

// ---------------------------------------------------------------------------
// Shapes and labels
// ---------------------------------------------------------------------------

const ROUTING = new Set(["branch", "filter", "switch", "split"]);
const CODE = new Set(["python", "script"]);

function shapeFor(node: CargoNode): Shape {
  const action = node.actionSlug ?? "";
  if (node.kind === "native") {
    if (action === "start" || action === "end") return ["([", "])"];
    if (ROUTING.has(action)) return ["{", "}"];
    if (CODE.has(action)) return ["[/", "/]"];
    if (action === "agent") return ["{{", "}}"];
    if (action === "group") return ["[", "]"];
    return ["(", ")"];
  }
  if (node.kind === "tool") return ["[[", "]]"];
  if (node.kind === "agent") return ["{{", "}}"];
  return ["[", "]"]; // connector, and anything unrecognised
}

// Labels are emitted quoted, so brackets and parens inside them are safe; a
// raw quote, angle bracket, or newline is not — those end the label early or
// inject markup into Mermaid's HTML labels.
function escapeLabel(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .trim();
}

function truncate(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** What the node *is*, in the words a user recognises. */
export function labelFor(node: CargoNode): string {
  const lines: string[] = [];
  const headline = node.name?.trim() || node.slug || node.kind || "node";
  lines.push(truncate(headline));

  const detail = detailFor(node);
  if (detail && detail !== lines[0]) lines.push(truncate(detail));
  return lines.map(escapeLabel).join("<br/>");
}

function detailFor(node: CargoNode): string | undefined {
  const cfg = (node.config ?? {}) as Record<string, string | undefined>;
  if (node.kind === "connector") {
    return `${node.integrationSlug ?? "?"}.${node.actionSlug ?? "?"}`;
  }
  if (node.kind === "tool") {
    const uuid = node.toolUuid ?? cfg.toolUuid;
    return `tool ${uuid ? uuid.slice(0, 8) : cfg.templateSlug ?? "?"}`;
  }
  if (node.kind === "agent") {
    const uuid = node.agentUuid ?? cfg.agentUuid;
    return `agent ${uuid ? uuid.slice(0, 8) : cfg.templateSlug ?? "?"}`;
  }
  if (node.kind === "native") {
    const action = node.actionSlug ?? "";
    if (action === "start" || action === "end") return undefined;
    if (action === "delay") {
      const minutes = (node.config as { minutes?: number } | undefined)?.minutes;
      return minutes === undefined ? "delay" : `delay ${minutes}m`;
    }
    return action || undefined;
  }
  return node.kind;
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

type Edge = { from: string; to: string; label?: string; dashed?: boolean };

/**
 * `childrenUuids` order carries the routing semantics — index 0 of a `branch`
 * is the matched path, index 1 the unmatched one. Getting this backwards
 * inverts the diagram's meaning, so it is table-driven rather than inferred.
 */
function edgeLabels(node: CargoNode, count: number): (string | undefined)[] {
  const action = node.kind === "native" ? node.actionSlug : undefined;
  if (action === "branch") return ["yes", "no"];
  if (action === "filter") return ["if true"];
  if (action === "split") {
    const pct = (node.config as { percentage?: number } | undefined)?.percentage;
    return pct === undefined ? ["A", "B"] : [`A ${pct}%`, `B ${100 - pct}%`];
  }
  if (action === "switch") {
    const routes = (node.config as { routes?: { name?: string }[] } | undefined)?.routes ?? [];
    return Array.from({ length: count }, (_, i) => routes[i]?.name ?? `route ${i + 1}`);
  }
  return Array.from({ length: count }, () => undefined);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

type Rendered = { id: string; node: CargoNode };

function matches(node: CargoNode, needles: string[]): boolean {
  return needles.some((n) => n === node.uuid || n === node.slug);
}

export function toMermaid(nodes: CargoNode[], options: DiagramOptions = {}): string {
  const byUuid = new Map<string, CargoNode>();
  for (const node of nodes) if (node?.uuid) byUuid.set(node.uuid, node);

  // Ids come from a breadth-first walk from `start`, so the diagram reads in
  // execution order and is stable across runs. Slugs are never used as ids:
  // they repeat within a single release.
  const order: Rendered[] = [];
  const seen = new Set<string>();
  const ids = new Map<string, string>();
  const queue: string[] = [];

  const start = nodes.find((n) => n.kind === "native" && n.actionSlug === "start") ?? nodes[0];
  if (start?.uuid) queue.push(start.uuid);

  while (queue.length > 0) {
    const uuid = queue.shift() as string;
    if (seen.has(uuid)) continue;
    const node = byUuid.get(uuid);
    if (!node) continue;
    seen.add(uuid);
    const id = `n${order.length}`;
    ids.set(uuid, id);
    order.push({ id, node });
    for (const child of node.childrenUuids ?? []) if (child) queue.push(child);
    if (node.fallbackChildUuid) queue.push(node.fallbackChildUuid);
  }

  const orphans = nodes.filter((n) => n?.uuid && !seen.has(n.uuid));
  for (const node of orphans) {
    const id = `n${order.length}`;
    ids.set(node.uuid, id);
    order.push({ id, node });
  }

  // Edges
  const edges: Edge[] = [];
  const danglingFrom: string[] = [];
  for (const { id, node } of order) {
    const children = node.childrenUuids ?? [];
    const labels = edgeLabels(node, children.length);
    children.forEach((child, index) => {
      const target = child ? ids.get(child) : undefined;
      if (!target) {
        if (child === null || child === undefined) danglingFrom.push(node.slug ?? id);
        return;
      }
      edges.push({ from: id, to: target, label: labels[index] });
    });
    // A fallback pointing at the node's own next step means "a failure here does
    // not stop the run" — the same arrow, not a second one. Drawing it twice
    // clutters the graph, so it becomes a ↷ marker on the label instead.
    const fallback = node.fallbackChildUuid ? ids.get(node.fallbackChildUuid) : undefined;
    if (fallback && !children.includes(node.fallbackChildUuid as string)) {
      edges.push({ from: id, to: fallback, label: "on failure", dashed: true });
    }
  }

  // Emit
  const lines: string[] = [];
  if (options.title) lines.push("---", `title: ${options.title.replace(/\n/g, " ")}`, "---");
  lines.push(`flowchart ${options.direction ?? "TD"}`);

  for (const { id, node } of order) {
    const [open, close] = shapeFor(node);
    const paid = matches(node, options.paid ?? []) ? "💳 " : "";
    const skips =
      node.fallbackChildUuid && (node.childrenUuids ?? []).includes(node.fallbackChildUuid) ? " ↷" : "";
    lines.push(`    ${id}${open}"${paid}${labelFor(node)}${skips}"${close}`);
    const group = (node.config as { _nodes?: CargoNode[] } | undefined)?._nodes;
    if (group?.length) {
      lines.push(`    subgraph ${id}_sub["per item"]`);
      lines.push(`    direction ${options.direction ?? "TD"}`);
      const inner = toMermaid(group, { direction: options.direction })
        .split("\n")
        .slice(1) // drop the nested `flowchart` header
        .filter((line) => line.trim().length > 0 && !line.startsWith("%%"))
        .map((line) => line.replace(/\bn(\d+)\b/g, `${id}s$1`));
      lines.push(...inner.map((line) => `    ${line}`));
      lines.push("    end");
      lines.push(`    ${id} --> ${id}_sub`);
    }
  }

  for (const edge of edges) {
    const arrow = edge.dashed
      ? edge.label
        ? `-. ${edge.label} .->`
        : "-.->"
      : edge.label
        ? `-->|${escapeLabel(edge.label)}|`
        : "-->";
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }

  const highlighted = order.filter(({ node }) => matches(node, options.highlight ?? []));
  if (highlighted.length > 0) {
    lines.push("    classDef failing fill:#fee,stroke:#c00,stroke-width:2px");
    lines.push(`    class ${highlighted.map((h) => h.id).join(",")} failing`);
  }

  if (orphans.length > 0) {
    lines.push(`%% unreachable from start: ${orphans.map((n) => n.slug ?? n.uuid).join(", ")}`);
  }
  if (danglingFrom.length > 0) {
    lines.push(`%% dangling childrenUuids (null or missing) on: ${[...new Set(danglingFrom)].join(", ")}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/** The CLI prints progress lines before its JSON; take the payload only. */
export function extractNodes(text: string): CargoNode[] {
  const start = text.search(/[[{]/);
  if (start === -1) fail("no JSON found in input");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start));
  } catch {
    // The CLI prefixes each progress line; retry with the last line only.
    const last = text.trim().split("\n").at(-1) ?? "";
    try {
      parsed = JSON.parse(last);
    } catch {
      fail("input is not valid JSON — pipe the raw `release get` output, or use --file");
    }
  }
  const nodes = findNodes(parsed);
  if (nodes) return nodes;

  // A run created from a deployed release carries `releaseUuid` and no graph —
  // the nodes live on the release. Say so instead of drawing an empty diagram.
  const run = (parsed as { run?: { releaseUuid?: string } } | null)?.run;
  if (run?.releaseUuid) {
    fail(
      `this run executed a deployed release and carries no graph — fetch it first:\n` +
        `  cargo-ai orchestration release get ${run.releaseUuid} | node <skill-dir>/scripts/workflow-to-mermaid.ts`,
    );
  }
  fail("no node graph found — expected `release get`, `release get-draft`, `template get`, an ad-hoc `run get`, or a raw node array");
}

/** Node-shaped means: a uuid plus the fields a graph is walked by. */
function isNodeArray(value: unknown): value is CargoNode[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (v) =>
        v !== null &&
        typeof v === "object" &&
        typeof (v as CargoNode).uuid === "string" &&
        ("childrenUuids" in (v as object) || "kind" in (v as object)),
    )
  );
}

function findNodes(value: unknown): CargoNode[] | undefined {
  if (isNodeArray(value)) return value;
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  // Known containers: `release get`/`get-draft`, `template get`, ad-hoc `run get`.
  const candidates = [
    record.nodes,
    (record.release as Record<string, unknown> | undefined)?.nodes,
    (record.template as Record<string, unknown> | undefined)?.nodes,
    (record.run as Record<string, unknown> | undefined)?.nodes,
    (record.draftRelease as Record<string, unknown> | undefined)?.nodes,
  ];
  for (const candidate of candidates) if (isNodeArray(candidate)) return candidate;
  return undefined;
}

function fail(message: string): never {
  console.error(`workflow-to-mermaid: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function list(value: string | boolean | undefined): string[] {
  return typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Fixture = { name: string; nodes: CargoNode[]; options?: DiagramOptions; expected: string };

function runFixtures(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixtures = JSON.parse(
    readFileSync(join(here, "fixtures_workflow_mermaid.json"), "utf8"),
  ) as Fixture[];

  let failures = 0;
  for (const fixture of fixtures) {
    const actual = toMermaid(fixture.nodes, fixture.options ?? {});
    if (actual === fixture.expected) {
      console.log(`ok   ${fixture.name}`);
      continue;
    }
    failures += 1;
    console.log(`FAIL ${fixture.name}`);
    console.log("--- expected ---");
    console.log(fixture.expected);
    console.log("--- actual ---");
    console.log(actual);
  }
  console.log(`${fixtures.length - failures}/${fixtures.length} fixtures passed`);
  if (failures > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) fail("no input — pipe `release get` output or pass --file <path>");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.fixtures) {
    runFixtures();
    return;
  }
  const raw = typeof args.file === "string" ? readFileSync(args.file, "utf8") : await readStdin();
  const nodes = extractNodes(raw);
  const direction = typeof args.direction === "string" ? args.direction.toUpperCase() : "TD";
  console.log("```mermaid");
  console.log(
    toMermaid(nodes, {
      title: typeof args.title === "string" ? args.title : undefined,
      direction,
      paid: list(args.paid),
      highlight: list(args.highlight),
    }),
  );
  console.log("```");
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  await main();
}
