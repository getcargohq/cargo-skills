// QA script: flag rows where the sourced person's name does not plausibly
// match the LinkedIn profile name — catching same-name decoys, wrong-profile
// matches, and scraper garbage. Complements the identity-validation gate in
// recipes/linkedin-url-lookup.md (case-insensitive, accents normalized,
// reject rather than guess).
//
// Usage:
//   node validate-linkedin-names.ts --input leads.csv [--output out.csv]
//   node validate-linkedin-names.ts --workflow-uuid <uuid> [--batch-uuid <uuid>]
//     [--output-node-slug <slug>] [--workspace-uuid <uuid>]
//   node validate-linkedin-names.ts --fixtures
//
// Columns: --name-column / --profile-name-column override auto-detection
// (source: fullName | full_name | name | firstName+lastName; profile:
// linkedinName | profileName | leadName). Output = input rows plus
// `name_match` ("true"/"false") and `name_match_reason`.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  fail,
  metrics,
  parseArgs,
  readJson,
  readRows,
  reportFixtureRun,
  toCsv,
} from "./lib/common.ts";
import type { Args, Row } from "./lib/common.ts";

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

// Generational/credential tokens dropped from either side.
const SUFFIX_TOKENS = new Set([
  "jr", "sr", "ii", "iii", "iv", "phd", "mba", "md", "dr", "esq", "cpa", "prof",
]);

// CJK, Cyrillic, and Arabic ranges — these scripts get strict handling.
const NON_LATIN =
  /[\u0400-\u04ff\u0600-\u06ff\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

function stripEmoji(text: string): string {
  // Pictographs plus variation selector-16 and zero-width joiner.
  return text.replace(/[\p{Extended_Pictographic}\ufe0f\u200d]/gu, " ");
}

/**
 * Pull quoted / parenthesized nicknames out of a profile name so they can be
 * matched as alternate first names: 'Robert "Bob" Smith' → text "Robert Smith",
 * nicknames ["Bob"].
 */
function extractNicknames(raw: string): { text: string; nicknames: string[] } {
  const nicknames: string[] = [];
  const text = raw.replace(
    /"([^"]*)"|“([^”]*)”|\(([^)]*)\)/g,
    (_match, dquoted, curly, parens) => {
      const inner = (dquoted ?? curly ?? parens ?? "").trim();
      if (inner) nicknames.push(inner);
      return " ";
    },
  );
  return { text, nicknames };
}

/**
 * NFD-decompose and strip combining marks (é→e), lowercase, cut credentials
 * after a comma, treat hyphens as spaces, drop periods/apostrophes, collapse
 * whitespace.
 */
function normalizeName(raw: string): string {
  let s = raw;
  const comma = s.indexOf(",");
  if (comma > 0) s = s.slice(0, comma);
  s = s.normalize("NFD").replace(/\p{M}+/gu, "");
  s = s.toLowerCase();
  s = s.replace(/[-‐‑–—]/g, " ");
  s = s.replace(/['’.,]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

function nameTokens(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t !== "" && !SUFFIX_TOKENS.has(t));
}

// ---------------------------------------------------------------------------
// Nickname table (common English pairs, matched in either direction)
// ---------------------------------------------------------------------------

const NICKNAME_PAIRS: Array<[string, string]> = [
  ["mike", "michael"], ["bob", "robert"], ["rob", "robert"],
  ["bill", "william"], ["will", "william"], ["liz", "elizabeth"],
  ["beth", "elizabeth"], ["dick", "richard"], ["rick", "richard"],
  ["jim", "james"], ["kate", "katherine"], ["katie", "katherine"],
  ["tom", "thomas"], ["tony", "anthony"], ["chris", "christopher"],
  ["chris", "christine"], ["dan", "daniel"], ["dave", "david"],
  ["ed", "edward"], ["ted", "edward"], ["alex", "alexander"],
  ["alex", "alexandra"], ["andy", "andrew"], ["ben", "benjamin"],
  ["charlie", "charles"], ["chuck", "charles"], ["frank", "francis"],
  ["fred", "frederick"], ["greg", "gregory"], ["hank", "henry"],
  ["jack", "john"], ["jen", "jennifer"], ["jenny", "jennifer"],
  ["joe", "joseph"], ["josh", "joshua"], ["ken", "kenneth"],
  ["larry", "lawrence"], ["matt", "matthew"], ["meg", "margaret"],
  ["peggy", "margaret"], ["nick", "nicholas"], ["pat", "patricia"],
  ["pat", "patrick"], ["ron", "ronald"], ["sam", "samuel"],
  ["sam", "samantha"], ["steve", "steven"], ["steve", "stephen"],
  ["sue", "susan"], ["tim", "timothy"], ["zack", "zachary"],
];

const NICKNAMES = new Map<string, Set<string>>();
for (const [a, b] of NICKNAME_PAIRS) {
  if (!NICKNAMES.has(a)) NICKNAMES.set(a, new Set());
  if (!NICKNAMES.has(b)) NICKNAMES.set(b, new Set());
  NICKNAMES.get(a)!.add(b);
  NICKNAMES.get(b)!.add(a);
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

export type NameComparison = { match: boolean; reason: string };

function firstNamesMatch(a: string, b: string): string | null {
  if (a === b) return "exact";
  if (NICKNAMES.get(a)?.has(b) || NICKNAMES.get(b)?.has(a)) return "nickname";
  // Two nicknames of the same formal name (Kate/Katie via Katherine).
  const aFormals = NICKNAMES.get(a);
  const bFormals = NICKNAMES.get(b);
  if (aFormals && bFormals) {
    for (const formal of aFormals) {
      if (bFormals.has(formal)) return "nickname-shared-formal";
    }
  }
  if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) {
    return "initial";
  }
  return null;
}

/** Pure comparison: does `profileName` plausibly belong to `sourceName`? */
export function compareNames(sourceName: string, profileName: string): NameComparison {
  if (!sourceName?.trim()) return { match: false, reason: "missing-source-name" };
  if (!profileName?.trim()) return { match: false, reason: "missing-profile-name" };

  const extracted = extractNicknames(profileName);
  const srcNorm = normalizeName(stripEmoji(sourceName));
  const profNorm = normalizeName(stripEmoji(extracted.text));
  if (!srcNorm) return { match: false, reason: "missing-source-name" };
  if (!profNorm) return { match: false, reason: "missing-profile-name" };

  // Non-Latin scripts: fuzzy rules don't apply — require full normalized
  // equality (whitespace-insensitive). Partial token overlap is flagged but
  // never counted as a match.
  if (NON_LATIN.test(srcNorm) || NON_LATIN.test(profNorm)) {
    if (
      srcNorm === profNorm ||
      srcNorm.replaceAll(" ", "") === profNorm.replaceAll(" ", "")
    ) {
      return { match: true, reason: "non-latin-exact" };
    }
    const srcT = nameTokens(srcNorm);
    const profT = nameTokens(profNorm);
    const shared = srcT.some((t) => profT.includes(t));
    return { match: false, reason: shared ? "non-latin-loose" : "name-mismatch" };
  }

  const srcT = nameTokens(srcNorm);
  const profT = nameTokens(profNorm);
  if (srcT.length === 0) return { match: false, reason: "missing-source-name" };
  if (profT.length === 0) return { match: false, reason: "missing-profile-name" };
  if (srcT.join(" ") === profT.join(" ")) return { match: true, reason: "exact" };
  if (srcT.length < 2 || profT.length < 2) {
    // A lone token can't confirm both first and last name — reject rather
    // than guess.
    return { match: false, reason: "single-token-name" };
  }

  // First name: exact, nickname pair, initial — against the profile's first
  // token or any extracted quoted/parenthesized nickname.
  const srcFirst = srcT[0];
  let firstHow = firstNamesMatch(srcFirst, profT[0]);
  if (!firstHow) {
    for (const alt of extracted.nicknames.flatMap((n) => nameTokens(normalizeName(n)))) {
      if (firstNamesMatch(srcFirst, alt)) {
        firstHow = "nickname";
        break;
      }
    }
  }

  // Last name: exact, or either side's extra surname tokens (maiden/married
  // names, hyphenated surnames — hyphens already split) contain the other's
  // surname. Middle tokens are ignored for the core comparison.
  const srcLast = srcT[srcT.length - 1];
  const profLast = profT[profT.length - 1];
  let lastHow: string | null = null;
  if (srcLast === profLast) lastHow = "exact";
  else if (profT.slice(1).includes(srcLast) || srcT.slice(1).includes(profLast)) {
    lastHow = "surname-variant";
  }

  if (firstHow && lastHow) {
    return { match: true, reason: `first-${firstHow}+last-${lastHow}` };
  }
  if (!firstHow && !lastHow) return { match: false, reason: "name-mismatch" };
  return {
    match: false,
    reason: firstHow ? "last-name-mismatch" : "first-name-mismatch",
  };
}

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

function findKey(keys: string[], candidates: string[]): string | undefined {
  const byLower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  for (const candidate of candidates) {
    const hit = byLower.get(candidate.toLowerCase());
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function resolveSourceName(args: Args, keys: string[]): (row: Row) => string {
  const override = args.values.get("name-column");
  if (override) {
    if (!keys.includes(override)) fail(`--name-column "${override}" not found in input columns`);
    return (row) => row[override] ?? "";
  }
  const single = findKey(keys, ["fullName", "full_name", "name"]);
  if (single) return (row) => row[single] ?? "";
  const first = findKey(keys, ["firstName", "first_name"]);
  const last = findKey(keys, ["lastName", "last_name"]);
  if (first && last) return (row) => `${row[first] ?? ""} ${row[last] ?? ""}`.trim();
  return fail(
    "could not detect the source name column — looked for fullName, name, or " +
      "firstName+lastName; pass --name-column <column>",
  );
}

function resolveProfileName(args: Args, keys: string[]): (row: Row) => string {
  const override = args.values.get("profile-name-column");
  if (override) {
    if (!keys.includes(override)) {
      fail(`--profile-name-column "${override}" not found in input columns`);
    }
    return (row) => row[override] ?? "";
  }
  const detected = findKey(keys, [
    "linkedinName", "linkedin_name",
    "profileName", "profile_name",
    "leadName", "lead_name",
  ]);
  if (detected) return (row) => row[detected] ?? "";
  return fail(
    "could not detect the profile name column — looked for linkedinName, " +
      "profileName, or leadName; pass --profile-name-column <column>",
  );
}

// ---------------------------------------------------------------------------
// Fixtures mode
// ---------------------------------------------------------------------------

type FixtureCase = {
  sourceName: string;
  profileName: string;
  expected: boolean;
  note: string;
};

function runFixtures(): void {
  const path = join(import.meta.dirname, "fixtures_name_validation.json");
  const { cases } = readJson<{ cases: FixtureCase[] }>(path);
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const mismatches: string[] = [];
  for (const c of cases) {
    const got = compareNames(c.sourceName, c.profileName);
    if (got.match && c.expected) tp++;
    else if (got.match && !c.expected) fp++;
    else if (!got.match && c.expected) fn++;
    if (got.match !== c.expected) {
      mismatches.push(
        `"${c.sourceName}" vs "${c.profileName}": expected ${c.expected}, ` +
          `got ${got.match} (${got.reason}) — ${c.note}`,
      );
    }
  }
  // Mismatches are listed for triage; the precision/recall thresholds decide
  // the exit code.
  for (const m of mismatches) process.stdout.write(`  MISMATCH ${m}\n`);
  reportFixtureRun(
    "validate-linkedin-names",
    { total: cases.length, failures: [] },
    { metrics: metrics(tp, fp, fn), thresholds: { precision: 0.95, recall: 0.85 } },
  );
}

// ---------------------------------------------------------------------------
// Row mode
// ---------------------------------------------------------------------------

async function runOnRows(args: Args): Promise<void> {
  const rows = await readRows(args);
  if (rows.length === 0) fail("no input rows");
  const keys = Object.keys(rows[0]);
  const sourceOf = resolveSourceName(args, keys);
  const profileOf = resolveProfileName(args, keys);

  let matched = 0;
  const augmented = rows.map((row) => {
    const result = compareNames(sourceOf(row), profileOf(row));
    if (result.match) matched++;
    return {
      ...row,
      name_match: String(result.match),
      name_match_reason: result.reason,
    };
  });

  const csv = toCsv(augmented);
  const output = args.values.get("output");
  if (output) writeFileSync(output, csv);
  else process.stdout.write(csv);
  process.stderr.write(
    `${matched}/${rows.length} rows matched, ${rows.length - matched} flagged\n`,
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), {
    value: [
      "input", "output", "name-column", "profile-name-column",
      "workflow-uuid", "batch-uuid", "output-node-slug", "workspace-uuid",
    ],
    boolean: ["fixtures"],
  });
  if (args.flags.has("fixtures")) {
    runFixtures();
    return;
  }
  await runOnRows(args);
}

await main();
