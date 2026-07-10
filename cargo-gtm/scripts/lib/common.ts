// Shared helpers for the cargo-gtm QA scripts.
//
// Runtime contract: Node >= 22.18 runs these files directly (`node <script>.ts`,
// native type-stripping). Use erasable TypeScript syntax only — no enums,
// namespaces, or parameter properties. Core helpers are dependency-free;
// `@cargo-ai/api` is loaded lazily and only for API mode.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

export type Row = Record<string, string>;

export function fail(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------

export type ArgSpec = {
  /** Flags that take a value, e.g. ["input", "output", "workflow-uuid"]. */
  value?: string[];
  /** Boolean flags, e.g. ["fixtures", "json"]. */
  boolean?: string[];
};

export type Args = { values: Map<string, string>; flags: Set<string> };

export function parseArgs(argv: string[], spec: ArgSpec): Args {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) fail(`unexpected argument: ${raw}`);
    const name = raw.slice(2);
    if (spec.boolean?.includes(name)) {
      flags.add(name);
    } else if (spec.value?.includes(name)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) {
        fail(`flag --${name} requires a value`);
      }
      values.set(name, value);
    } else {
      fail(`unknown flag: --${name}`);
    }
  }
  return { values, flags };
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180: quoted fields, embedded commas/quotes/newlines, CRLF)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    // Skip blank lines (a record that is a single empty field).
    if (record.length > 1 || record[0] !== "") rows.push(record);
    record = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushField();
      pushRecord();
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    pushField();
    pushRecord();
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const row: Row = {};
    header.forEach((name, i) => {
      row[name] = cells[i] ?? "";
    });
    return row;
  });
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(rows: Row[], headers?: string[]): string {
  const cols = headers ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [cols.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => csvEscape(row[c] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Input loading: --input file (.csv / .json) or Cargo API mode
// ---------------------------------------------------------------------------

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function rowsFromJson(data: unknown): Row[] {
  // Accept `orchestration action execute-batch` output directly: rows live
  // under a top-level "results" (or "records") key rather than at the root.
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    const wrapped = data as { results?: unknown; records?: unknown };
    if (Array.isArray(wrapped.results)) data = wrapped.results;
    else if (Array.isArray(wrapped.records)) data = wrapped.records;
  }
  if (!Array.isArray(data)) fail("expected a JSON array of objects (or {\"results\": [...]} batch output)");
  return data.map((item) => {
    const row: Row = {};
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      row[key] =
        value === null || value === undefined
          ? ""
          : typeof value === "string"
            ? value
            : JSON.stringify(value);
    }
    return row;
  });
}

export function readInputFile(path: string): Row[] {
  if (!existsSync(path)) fail(`input file not found: ${path}`);
  const text = readFileSync(path, "utf8");
  return path.endsWith(".json") ? rowsFromJson(JSON.parse(text)) : parseCsv(text);
}

function resolveAccessToken(): string {
  const fromEnv = process.env.CARGO_API_TOKEN;
  if (fromEnv) return fromEnv;
  const credentialsPath = join(homedir(), ".config", "cargo-ai", "credentials.json");
  if (existsSync(credentialsPath)) {
    const credentials = readJson<{ accessToken?: string }>(credentialsPath);
    if (credentials.accessToken) return credentials.accessToken;
  }
  return fail(
    "no Cargo credentials found — set CARGO_API_TOKEN or run `cargo-ai login`",
  );
}

async function loadCargoApi(): Promise<{ buildApi: (deps: object) => any }> {
  try {
    return (await import("@cargo-ai/api")) as any;
  } catch {
    // Not resolvable from here — try the global npm root (the CLI itself is
    // installed globally, so this is the common case for a global install).
    try {
      const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
      const requireFromGlobal = createRequire(join(globalRoot, "noop.js"));
      const entry = requireFromGlobal.resolve("@cargo-ai/api");
      return (await import(entry)) as any;
    } catch {
      return fail(
        "API mode needs the @cargo-ai/api package — `npm install -g @cargo-ai/api`, " +
          "or pass --input <file.csv|file.json> instead",
      );
    }
  }
}

export type ApiModeOptions = {
  workflowUuid: string;
  batchUuid?: string;
  outputNodeSlug?: string;
  workspaceUuid?: string;
};

/**
 * Fetch a workflow's output rows via the Cargo API — the programmatic
 * equivalent of `cargo-ai orchestration run download-outputs`.
 */
export async function fetchRunOutputRows(options: ApiModeOptions): Promise<Row[]> {
  const { buildApi } = await loadCargoApi();
  const api = buildApi({
    accessToken: resolveAccessToken(),
    workspaceUuid: options.workspaceUuid ?? process.env.CARGO_WORKSPACE_UUID,
  });
  const { url } = await api.orchestration.run.downloadOutputs({
    workflowUuid: options.workflowUuid,
    batchUuid: options.batchUuid,
    outputNodeSlug: options.outputNodeSlug,
    format: "json",
  });
  const response = await fetch(url);
  if (!response.ok) fail(`failed to download outputs (${response.status})`);
  return rowsFromJson(await response.json());
}

/**
 * Standard input resolution shared by every QA script:
 *   --input <file>          CSV or JSON rows
 *   --workflow-uuid <uuid>  API mode (+ optional --batch-uuid,
 *                           --output-node-slug, --workspace-uuid)
 */
export async function readRows(args: Args): Promise<Row[]> {
  const input = args.values.get("input");
  if (input) return readInputFile(input);
  const workflowUuid = args.values.get("workflow-uuid");
  if (workflowUuid) {
    return fetchRunOutputRows({
      workflowUuid,
      batchUuid: args.values.get("batch-uuid"),
      outputNodeSlug: args.values.get("output-node-slug"),
      workspaceUuid: args.values.get("workspace-uuid"),
    });
  }
  return fail("pass --input <file.csv|file.json> or --workflow-uuid <uuid>");
}

// ---------------------------------------------------------------------------
// Fixture metrics
// ---------------------------------------------------------------------------

export type Metrics = { precision: number; recall: number; f1: number };

export function metrics(tp: number, fp: number, fn: number): Metrics {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

export type Thresholds = { precision?: number; recall?: number };

/**
 * Print fixture metrics and exit non-zero when below thresholds. Call at the
 * end of every script's --fixtures mode: CI relies on the exit code.
 */
export function reportFixtureRun(
  scriptName: string,
  results: { total: number; failures: string[] },
  measured?: { metrics: Metrics; thresholds: Thresholds },
): void {
  const lines = [`${scriptName}: ${results.total} fixture cases`];
  if (measured) {
    const { precision, recall, f1 } = measured.metrics;
    lines.push(
      `precision=${precision.toFixed(3)} recall=${recall.toFixed(3)} f1=${f1.toFixed(3)}`,
    );
  }
  for (const failure of results.failures) lines.push(`  FAIL ${failure}`);
  process.stdout.write(lines.join("\n") + "\n");

  let ok = results.failures.length === 0;
  if (measured) {
    const { precision = 0, recall = 0 } = measured.thresholds;
    if (measured.metrics.precision < precision) {
      process.stdout.write(`FAIL precision ${measured.metrics.precision.toFixed(3)} < required ${precision}\n`);
      ok = false;
    }
    if (measured.metrics.recall < recall) {
      process.stdout.write(`FAIL recall ${measured.metrics.recall.toFixed(3)} < required ${recall}\n`);
      ok = false;
    }
  }
  process.stdout.write(ok ? "PASS\n" : "FAIL\n");
  process.exit(ok ? 0 : 1);
}
