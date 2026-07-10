// select-current-role.ts — deterministic current-role selection over the
// experience arrays returned by enrichment providers (LinkedIn scrapes,
// waterfall enrichment, peopleDataLabs).
//
// Picking the CURRENT role wrong is the #1 cause of emailing people who
// already left. This script selects one role per row, repairs titles that
// embed the company name ("VP Sales at Acme Corp"), and emits a confidence
// plus a machine-readable reason so downstream steps know when to re-verify.
//
// Usage:
//   node select-current-role.ts --input rows.csv [--experiences-column experiences] [--output out.csv]
//   node select-current-role.ts --workflow-uuid <uuid> [--batch-uuid <uuid>] [--output-node-slug <slug>]
//   node select-current-role.ts --fixtures
//
// Runtime contract: Node >= 22.18 runs this file directly (native
// type-stripping) — erasable TypeScript only, node:* builtins only.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseArgs,
  readRows,
  readJson,
  toCsv,
  reportFixtureRun,
  fail,
  type Row,
} from "./lib/common.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Confidence = "high" | "medium" | "low";

export type RoleSelection = {
  title: string;
  company: string;
  confidence: Confidence;
  reason: string;
};

type YearMonth = { year: number; month: number };

type ParsedExperience = {
  index: number;
  title: string;
  company: string;
  start: YearMonth | undefined;
  end: YearMonth | undefined;
  /** Tri-state: true / false / not present (or not boolean-ish). */
  currentFlag: boolean | undefined;
};

// ---------------------------------------------------------------------------
// Tolerant field parsing
// ---------------------------------------------------------------------------

const TITLE_KEYS = ["title", "jobTitle", "position"];
const COMPANY_KEYS = ["companyName", "company", "organization"];
const START_KEYS = ["startDate", "start_date", "dateFrom"];
const END_KEYS = ["endDate", "end_date", "dateTo"];
const CURRENT_KEYS = ["current", "isCurrent", "jobStillWorking"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Boolean-ish fields arrive as real booleans OR strings ("false", "False",
 * "0", "", "true", "1", …). Never truthiness-test them — the string "false"
 * is truthy, which is exactly the classic current-role bug.
 */
function parseBoolish(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "" || s === "false" || s === "0" || s === "no") return false;
    if (s === "true" || s === "1" || s === "yes") return true;
  }
  return undefined;
}

/**
 * Dates arrive as "YYYY", "YYYY-MM", "YYYY-MM-DD", ISO timestamps, bare year
 * numbers, or objects {year, month}. Reduce them all to a comparable
 * (year, month) tuple; missing month = January.
 */
function parseYearMonth(value: unknown): YearMonth | undefined {
  if (value === null || value === undefined) return undefined;
  if (isObject(value)) {
    const year = Number(value.year);
    if (!Number.isInteger(year) || year <= 0) return undefined;
    const month = Number(value.month);
    return { year, month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : 1 };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1000 && value <= 9999
      ? { year: value, month: 1 }
      : undefined;
  }
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4})(?:-(\d{1,2}))?/);
    if (!match) return undefined;
    const month = match[2] ? Number(match[2]) : 1;
    return { year: Number(match[1]), month: month >= 1 && month <= 12 ? month : 1 };
  }
  return undefined;
}

function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a.year - b.year || a.month - b.month;
}

/** Compare optional tuples; a missing date sorts before any real date. */
function compareOptional(a: YearMonth | undefined, b: YearMonth | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return -1;
  if (b === undefined) return 1;
  return compareYearMonth(a, b);
}

function extractString(exp: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = exp[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Company fields are strings or objects like {"name": "Acme"}. */
function extractCompany(exp: Record<string, unknown>): string {
  for (const key of COMPANY_KEYS) {
    const value = exp[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (isObject(value) && typeof value.name === "string" && value.name.trim()) {
      return value.name.trim();
    }
  }
  return "";
}

function extractWhen(exp: Record<string, unknown>, keys: string[]): YearMonth | undefined {
  for (const key of keys) {
    const parsed = parseYearMonth(exp[key]);
    if (parsed) return parsed;
  }
  return undefined;
}

function extractCurrentFlag(exp: Record<string, unknown>): boolean | undefined {
  for (const key of CURRENT_KEYS) {
    const parsed = parseBoolish(exp[key]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function parseExperience(exp: Record<string, unknown>, index: number): ParsedExperience {
  return {
    index,
    title: extractString(exp, TITLE_KEYS),
    company: extractCompany(exp),
    start: extractWhen(exp, START_KEYS),
    end: extractWhen(exp, END_KEYS),
    currentFlag: extractCurrentFlag(exp),
  };
}

// ---------------------------------------------------------------------------
// Selection logic
// ---------------------------------------------------------------------------

const NON_OPERATING_TITLE =
  /\b(board member|board of directors|advisor|advisory|investor|angel|venture partner|volunteer|mentor|trustee|non[- ]executive)\b/i;
const NON_OPERATING_COMPANY = /\b(charity|charitable|volunteer(?:s|ing)?)\b/i;

function isNonOperating(exp: ParsedExperience): boolean {
  return NON_OPERATING_TITLE.test(exp.title) || NON_OPERATING_COMPANY.test(exp.company);
}

/**
 * A role is active when its current-flag is true, its end date is missing, or
 * its end date is now-or-later. An explicit false flag with a missing end
 * date means "left, end date unknown" — not active.
 */
function isActive(exp: ParsedExperience, now: YearMonth): boolean {
  if (exp.currentFlag === true) return true;
  if (exp.end === undefined) return exp.currentFlag !== false;
  return compareYearMonth(exp.end, now) >= 0;
}

/** Latest startDate; tie → prefer current-flag true, then the one listed first. */
function pickLatestByStart(candidates: ParsedExperience[]): ParsedExperience {
  let best = candidates[0];
  for (const exp of candidates.slice(1)) {
    const cmp = compareOptional(exp.start, best.start);
    if (cmp > 0) best = exp;
    else if (cmp === 0 && exp.currentFlag === true && best.currentFlag !== true) best = exp;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Title repair — scraped titles often embed the company name
// ---------------------------------------------------------------------------

const TITLE_SEPARATOR = /\s+(?:at|@|-|\|)\s+/gi;
const LEGAL_SUFFIX = /\b(?:inc|llc|ltd|corp|gmbh)$/;

function normalizeCompanyName(name: string): string {
  let s = name
    .toLowerCase()
    .replace(/[.,'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let previous;
  do {
    previous = s;
    s = s.replace(LEGAL_SUFFIX, "").trim();
  } while (s !== previous);
  return s;
}

/**
 * Strip a trailing "at Acme Corp" / "@ Acme" / "- Acme" / "| Acme" segment
 * when it equals the company name (ignoring case and Inc/LLC/Ltd/Corp/GmbH).
 * Titles whose trailing segment does NOT match the company are left alone
 * ("Head of Data at Scale" at Meridian Analytics stays intact).
 */
function repairTitle(title: string, company: string): { title: string; repaired: boolean } {
  const target = normalizeCompanyName(company);
  if (!title || !target) return { title, repaired: false };
  const matches = [...title.matchAll(TITLE_SEPARATOR)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const trailing = title.slice(match.index + match[0].length);
    if (normalizeCompanyName(trailing) === target) {
      const head = title.slice(0, match.index).trim();
      if (head) return { title: head, repaired: true };
    }
  }
  return { title, repaired: false };
}

// ---------------------------------------------------------------------------
// selectCurrentRole — the pure function under fixture test
// ---------------------------------------------------------------------------

export function selectCurrentRole(experiences: unknown): RoleSelection {
  let list = experiences;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = undefined;
    }
  }
  if (!Array.isArray(list)) {
    return { title: "", company: "", confidence: "low", reason: "unparseable-experiences" };
  }
  const parsed = list.filter(isObject).map(parseExperience);
  if (parsed.length === 0) {
    return { title: "", company: "", confidence: "low", reason: "no-experiences" };
  }

  const now = new Date();
  const nowTuple: YearMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const active = parsed.filter((exp) => isActive(exp, nowTuple));
  const operating = active.filter((exp) => !isNonOperating(exp));

  let picked: ParsedExperience;
  let confidence: Confidence;
  let reason: string;

  if (operating.length > 0) {
    picked = pickLatestByStart(operating);
    const clearLatest = operating.every(
      (exp) => exp === picked || compareOptional(exp.start, picked.start) < 0,
    );
    if (operating.length === 1) {
      confidence = "high";
      reason = "single-active-role";
    } else if (clearLatest && picked.currentFlag === true) {
      confidence = "high";
      reason = "latest-active-current-flag";
    } else {
      confidence = "medium";
      reason = "multiple-active-roles";
    }
  } else if (active.length > 0) {
    // Only board/advisory/volunteer roles are active — usable, but weak.
    picked = pickLatestByStart(active);
    confidence = "low";
    reason = "only-non-operating-roles";
  } else {
    // Everything ended: this person likely changed jobs — re-verify downstream.
    picked = parsed[0];
    for (const exp of parsed.slice(1)) {
      if (compareOptional(exp.end ?? exp.start, picked.end ?? picked.start) > 0) picked = exp;
    }
    confidence = "low";
    reason = "no-active-role";
  }

  const { title, repaired } = repairTitle(picked.title, picked.company);
  if (repaired) reason += "; title-repaired";
  return { title, company: picked.company, confidence, reason };
}

// ---------------------------------------------------------------------------
// Fixture mode — every case must match expected exactly
// ---------------------------------------------------------------------------

type FixtureCase = {
  name: string;
  experiences: unknown;
  expected: { title: string; company: string; confidence: Confidence };
  note?: string;
};

function runFixtures(): void {
  const path = join(import.meta.dirname, "fixtures_current_role.json");
  const { cases } = readJson<{ cases: FixtureCase[] }>(path);
  const failures: string[] = [];
  for (const testCase of cases) {
    const got = selectCurrentRole(testCase.experiences);
    const mismatches: string[] = [];
    if (got.title !== testCase.expected.title) {
      mismatches.push(`title "${got.title}" != "${testCase.expected.title}"`);
    }
    if (got.company !== testCase.expected.company) {
      mismatches.push(`company "${got.company}" != "${testCase.expected.company}"`);
    }
    if (got.confidence !== testCase.expected.confidence) {
      mismatches.push(`confidence "${got.confidence}" != "${testCase.expected.confidence}"`);
    }
    if (mismatches.length > 0) {
      failures.push(`${testCase.name}: ${mismatches.join("; ")} (reason=${got.reason})`);
    }
  }
  reportFixtureRun("select-current-role", { total: cases.length, failures });
}

// ---------------------------------------------------------------------------
// Row mode
// ---------------------------------------------------------------------------

const COLUMN_CANDIDATES = ["experiences", "experience", "workExperience", "positions", "jobs"];

function resolveExperiencesColumn(rows: Row[], override: string | undefined): string {
  const keys = Object.keys(rows[0] ?? {});
  if (override) {
    if (keys.includes(override)) return override;
    return fail(
      `--experiences-column "${override}" not found; available columns: ${keys.join(", ")}`,
    );
  }
  const byLowercase = new Map(keys.map((key) => [key.toLowerCase(), key]));
  for (const candidate of COLUMN_CANDIDATES) {
    const match = byLowercase.get(candidate.toLowerCase());
    if (match) return match;
  }
  return fail(
    `no experiences column found (tried ${COLUMN_CANDIDATES.join(", ")}); ` +
      "pass --experiences-column <name>",
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), {
    value: [
      "input",
      "output",
      "experiences-column",
      "workflow-uuid",
      "batch-uuid",
      "output-node-slug",
      "workspace-uuid",
    ],
    boolean: ["fixtures"],
  });

  if (args.flags.has("fixtures")) {
    runFixtures();
    return;
  }

  const rows = await readRows(args);
  if (rows.length === 0) fail("no input rows");
  const column = resolveExperiencesColumn(rows, args.values.get("experiences-column"));

  const enriched = rows.map((row) => {
    const selection = selectCurrentRole(row[column]);
    return {
      ...row,
      current_title: selection.title,
      current_company: selection.company,
      role_confidence: selection.confidence,
      role_reason: selection.reason,
    };
  });

  const csv = toCsv(enriched);
  const output = args.values.get("output");
  if (output) {
    writeFileSync(output, csv);
    process.stderr.write(`wrote ${enriched.length} rows to ${output}\n`);
  } else {
    process.stdout.write(csv);
  }
}

await main();
