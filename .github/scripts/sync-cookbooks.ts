/**
 * Keeps cargo-cdk aware of the cookbook menu.
 *
 * WHY THIS EXISTS
 *
 * `cargo-cdk/SKILL.md` used to tell the agent to "read the cookbook menu (the
 * repo README's table)" — a network fetch to another GitHub repo, mid-task,
 * which an agent may simply not make. When it does not, it authors a common GTM
 * outcome from scratch that was already sitting there written and tested. The
 * menu has to be a local file to be reliably read.
 *
 * Same shape as sync-trigger-slugs.ts: a committed data snapshot, prose
 * generated from it, and `--check` in CI so the two cannot drift. CI never
 * reaches the network, so a cookbook repo change cannot turn this build red on
 * its own — staleness is fixed deliberately, with --refresh.
 *
 *   node .github/scripts/sync-cookbooks.ts            # regenerate the reference
 *   node .github/scripts/sync-cookbooks.ts --check    # CI: fail if stale
 *   node .github/scripts/sync-cookbooks.ts --refresh  # re-pull the snapshot from
 *                                                       ../cargo-cookbooks, or
 *                                                       GitHub if it is absent
 *
 * Requires Node >= 22.18 (run as .ts via native type-stripping).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const snapshotPath = join(repoRoot, ".github/data/cookbooks.json");
const referencePath = join(repoRoot, "cargo-cdk/references/cookbooks.md");
const REPO = "getcargohq/cargo-cookbooks";

interface Variation {
  id: string;
  when: string;
  trade: string;
}
interface Cookbook {
  slug: string;
  kind: "outcome" | "foundation";
  outcome: string;
  state: string;
  chain: number | null;
  requires: string[];
  hasSkill: boolean;
  variations: Variation[];
}

/**
 * Minimal frontmatter reader: only the scalar keys the menu needs. A cookbook's
 * frontmatter is validated as real YAML in its own repo (check-cookbooks.mjs),
 * so by the time it reaches here the shape is known and a full parser would be
 * a dependency for four fields.
 */
function readFrontmatter(text: string): Record<string, string> | undefined {
  if (!text.startsWith("---\n")) return undefined;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return undefined;
  const out: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1).replace(/''/g, "'").replace(/\\"/g, '"');
    }
    out[m[1]] = v;
  }
  return out;
}

/** The variations table under `## What you can change`: id, when, cost. */
function readVariations(body: string): Variation[] {
  const start = body.indexOf("\n## What you can change");
  if (start === -1) return [];
  const rest = body.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  const section = next === -1 ? rest : rest.slice(0, next);
  const rows = section
    .split("\n")
    .filter((l) => l.startsWith("| `"));
  return rows.map((row) => {
    const cells = row
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    return {
      id: cells[0].replace(/`/g, ""),
      when: cells[1] ?? "",
      trade: cells[3] ?? cells[2] ?? "",
    };
  });
}

async function refresh(): Promise<Cookbook[]> {
  const local = resolve(repoRoot, process.env.CARGO_COOKBOOKS_ROOT ?? "../cargo-cookbooks");
  const fromDisk = existsSync(join(local, "cargo.scaffold.json"));

  const read = async (path: string): Promise<string | null> => {
    if (fromDisk) {
      const p = join(local, path);
      return existsSync(p) ? readFileSync(p, "utf8") : null;
    }
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/main/${path}`);
    return res.ok ? await res.text() : null;
  };

  console.log(fromDisk ? `reading ${local}` : `fetching ${REPO}@main`);
  const scaffold = JSON.parse((await read("cargo.scaffold.json"))!);
  const folders: Record<string, { requires: string[]; kind: "outcome" | "foundation" }> =
    scaffold.folders ?? {};

  const out: Cookbook[] = [];
  for (const slug of Object.keys(folders)) {
    const entry = folders[slug];
    if (entry.kind === "foundation") {
      // Foundations carry no skill by design; their one-line role comes from
      // the README's first heading paragraph, which is stable prose.
      const readme = (await read(`${slug}/README.md`)) ?? "";
      const firstPara = readme.split("\n\n").find((p) => p && !p.startsWith("#")) ?? "";
      out.push({
        slug,
        kind: "foundation",
        outcome: firstPara.replace(/\s+/g, " ").trim(),
        state: "n/a",
        chain: null,
        requires: entry.requires ?? [],
        hasSkill: false,
        variations: [],
      });
      continue;
    }
    const skill = await read(`${slug}/SKILL.md`);
    // An outcome with no SKILL.md is not yet in the skill layer. It stays out
    // of the menu rather than appearing as an outcome with nothing behind it.
    if (!skill) continue;
    const fm = readFrontmatter(skill);
    if (!fm) continue;
    const bodyStart = skill.indexOf("\n---", 3) + 4;
    out.push({
      slug,
      kind: "outcome",
      outcome: fm.outcome ?? "",
      state: fm.state ?? "to-be-approved",
      chain: fm.chain === undefined || fm.chain === "null" ? null : Number(fm.chain),
      requires: entry.requires ?? [],
      hasSkill: true,
      variations: readVariations(skill.slice(bodyStart)),
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

function render(books: Cookbook[]): string {
  const outcomes = books.filter((b) => b.kind === "outcome");
  const foundations = books.filter((b) => b.kind === "foundation");
  const L: string[] = [];

  L.push(
    "<!-- Generated by .github/scripts/sync-cookbooks.ts. Do not edit by hand. -->",
  );
  L.push("");
  L.push("# Cookbooks — the menu, before you author from scratch");
  L.push("");
  L.push(
    `Composable folders of pre-written \`define*\` resources in [\`${REPO}\`](https://github.com/${REPO}),`,
  );
  L.push("one per GTM outcome, all built on a shared `base-gtm` foundation.");
  L.push("");
  L.push(
    "**The code in a cookbook is a worked example, not a template to fill in.** Each one",
  );
  L.push(
    "declares, in its `SKILL.md`, what may be reshaped, what must hold or it stops working,",
  );
  L.push(
    "and what has to be answered either way. The agent installing it adapts it and records why.",
  );
  L.push("");
  L.push("```sh");
  L.push("# an agent installs the skill and does the adapting");
  L.push(`npx skills add ${REPO} --all`);
  L.push("");
  L.push("# or by hand: into an empty directory, or into an existing project");
  L.push(`cargo-ai cdk init <dir> --from ${REPO}/<slug>`);
  L.push("cargo-ai manifest add <slug> --dir .");
  L.push("```");
  L.push("");
  L.push("## Outcomes");
  L.push("");
  L.push("| Cookbook | Outcome | Requires | Skill | State |");
  L.push("| --- | --- | --- | --- | --- |");
  for (const b of outcomes) {
    L.push(
      `| \`${b.slug}\` | ${b.outcome} | ${b.requires.map((r) => `\`${r}\``).join(", ") || "—"} | ${b.hasSkill ? "yes" : "—"} | ${b.state} |`,
    );
  }
  L.push("");
  L.push("## Foundations");
  L.push("");
  L.push(
    "Slots the outcomes build on. They define no motion of their own and carry no skill.",
  );
  L.push("");
  L.push("| Cookbook | What it is | Requires |");
  L.push("| --- | --- | --- |");
  for (const b of foundations) {
    L.push(
      `| \`${b.slug}\` | ${b.outcome} | ${b.requires.map((r) => `\`${r}\``).join(", ") || "—"} |`,
    );
  }

  const withVariations = outcomes.filter((b) => b.variations.length);
  if (withVariations.length) {
    L.push("");
    L.push("## When a cookbook does not fit as written");
    L.push("");
    L.push(
      "These are declared adaptations, not forks. Reach for one before concluding that a",
    );
    L.push("cookbook is the wrong starting point.");
    L.push("");
    for (const b of withVariations) {
      L.push(`**\`${b.slug}\`**`);
      L.push("");
      for (const v of b.variations)
        L.push(`- \`${v.id}\` — ${v.when}. Costs: ${v.trade}.`);
      L.push("");
    }
  }

  L.push("## Routing");
  L.push("");
  L.push(
    "**One-off versus standing is the whole test.** A user who wants a list today wants",
  );
  L.push(
    "`cargo-gtm`; a user who wants a pipeline that keeps producing it wants a cookbook.",
  );
  L.push(
    "The same words describe both, so listen for whether the result is meant to keep",
  );
  L.push("arriving.");
  L.push("");
  L.push(
    "A cookbook matches → install its skill, or scaffold and adapt it. No match → author",
  );
  L.push("from the recipes in `../SKILL.md`.");
  L.push("");
  L.push(
    "**Never `cargo-ai cdk init --force` into a directory that is not empty.** It replaces",
  );
  L.push(
    "the project's `package.json` and reverts any adapted cookbook code, while",
  );
  L.push(
    "`cargo.state.json` survives — so the next plan diffs a live workspace against code",
  );
  L.push(
    "nobody wrote. Adding a cookbook to an existing project means scaffolding to a temp",
  );
  L.push(
    "directory and copying across only the folders that are not already there.",
  );
  L.push("");
  return L.join("\n");
}

const books: Cookbook[] = process.argv.includes("--refresh")
  ? await refresh()
  : JSON.parse(readFileSync(snapshotPath, "utf8"));

if (process.argv.includes("--refresh")) {
  writeFileSync(snapshotPath, JSON.stringify(books, null, 2) + "\n");
  console.log(`snapshot: ${books.length} cookbooks -> ${snapshotPath}`);
}

const rendered = render(books);
if (process.argv.includes("--check")) {
  const current = existsSync(referencePath)
    ? readFileSync(referencePath, "utf8")
    : "";
  if (current !== rendered) {
    console.error(
      "cargo-cdk/references/cookbooks.md is stale.\n  Run: node .github/scripts/sync-cookbooks.ts",
    );
    process.exit(1);
  }
  console.log(
    `ok: cookbook menu matches the snapshot (${books.length} cookbooks)`,
  );
} else {
  writeFileSync(referencePath, rendered);
  console.log(`wrote ${referencePath} (${books.length} cookbooks)`);
}
