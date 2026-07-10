// Contact accuracy audit — the capstone QA pass for a prospecting run.
//
// After source → enrich → verifyEmail, stamp every output row with a verdict
// (SEND / VERIFY / REVIEW / REMOVE) plus the flags behind it, so nothing
// unverified or misattributed reaches a sequencer or CRM. It is a report, not
// a gate: the exit code is 0 regardless of verdicts (except --fixtures mode).
//
// Verdict rules (first match sets the action; ALL applicable flags are kept):
//   1. no email at all                              → REMOVE  no-email
//   2. risk invalid/disposable or verification bad  → REMOVE  invalid-email /
//                                                      disposable-email /
//                                                      failed-verification
//   3. is_duplicate true (later occurrence)         → REMOVE  duplicate-row
//   4. name_match false (wrong person)              → REMOVE  name-mismatch
//   5. catch-all with < 2 corroborating providers   → VERIFY  catchall-single-source
//   6. verification unknown or missing              → VERIFY  unverified-email
//   7. role confidence low (likely job changer)     → REVIEW  stale-or-ambiguous-role
//   8. role-based address (info@, sales@, …)        → REVIEW  role-account
//   9. otherwise                                    → SEND    (catchall-corroborated /
//                                                      free-provider / partial-signals
//                                                      kept for transparency)
//
// Usage:
//   node contact-accuracy-audit.ts --input rows.csv [--output audited.csv]
//   node contact-accuracy-audit.ts --workflow-uuid <uuid> [--batch-uuid <uuid>]
//       [--output-node-slug <slug>] [--workspace-uuid <uuid>]
//   node contact-accuracy-audit.ts --input rows.csv --summary-json
//   node contact-accuracy-audit.ts --fixtures
//
// Columns are auto-detected (see COLUMN_CANDIDATES); override with
// --email-column, --status-column, --corroboration-column,
// --name-match-column, --role-confidence-column, --email-risk-column.
//
// Runtime: Node >= 22.18 (`node contact-accuracy-audit.ts`, native
// type-stripping) — erasable TypeScript only, zero npm dependencies.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseArgs,
  readRows,
  readJson,
  toCsv,
  reportFixtureRun,
  fail,
  type Args,
  type Row,
} from "./lib/common.ts";

type Action = "SEND" | "VERIFY" | "REVIEW" | "REMOVE";
type Verification = "valid" | "catch_all" | "invalid" | "unknown" | "missing";

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

type ColumnKey =
  | "email"
  | "status"
  | "corroboration"
  | "nameMatch"
  | "roleConfidence"
  | "emailRisk"
  | "isDuplicate";

// Candidate header names, normalized (lowercase, separators stripped) and in
// priority order. Status names follow what waterfall verifyEmail pipelines
// emit; nameMatch / roleConfidence / emailRisk are the columns produced by
// validate-linkedin-names.ts, select-current-role.ts, and validate-emails.ts.
const COLUMN_CANDIDATES: Record<ColumnKey, string[]> = {
  email: ["email", "workemail", "emailaddress"],
  status: [
    // email_status (waterfall.verifyEmail output) normalizes to emailstatus;
    // recipes merge that field onto rows as emailStatus before audit.
    "emailstatus",
    "verificationstatus",
    "verification",
    "emailverificationstatus",
    // Bare "status" last — generic enough that any more specific header must win.
    "status",
  ],
  corroboration: [
    "providercount",
    "sourcescount",
    "corroborations",
    "corroborationcount",
  ],
  nameMatch: ["namematch"],
  roleConfidence: ["roleconfidence"],
  emailRisk: ["emailrisk"],
  isDuplicate: ["isduplicate"],
};

const OVERRIDE_FLAGS: Record<ColumnKey, string> = {
  email: "email-column",
  status: "status-column",
  corroboration: "corroboration-column",
  nameMatch: "name-match-column",
  roleConfidence: "role-confidence-column",
  emailRisk: "email-risk-column",
  isDuplicate: "is-duplicate-column",
};

function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type Columns = Partial<Record<ColumnKey, string>>;

function detectColumns(headers: string[], args: Args): Columns {
  const columns: Columns = {};
  for (const key of Object.keys(COLUMN_CANDIDATES) as ColumnKey[]) {
    const override = args.values.get(OVERRIDE_FLAGS[key]);
    if (override) {
      if (!headers.includes(override)) {
        fail(`--${OVERRIDE_FLAGS[key]} "${override}" not found in input columns`);
      }
      columns[key] = override;
      continue;
    }
    for (const candidate of COLUMN_CANDIDATES[key]) {
      const found = headers.find((h) => normalizeKey(h) === candidate);
      if (found) {
        columns[key] = found;
        break;
      }
    }
  }
  return columns;
}

// ---------------------------------------------------------------------------
// Signal extraction
// ---------------------------------------------------------------------------

type Signals = {
  hasEmail: boolean;
  verification: Verification;
  corroborations: number;
  nameMatch: string; // "true" | "false" | "" (not checked)
  roleConfidence: string; // "high" | "medium" | "low" | ""
  emailRisk: string; // "ok" | "free" | "role" | "disposable" | "invalid" | ""
  /** is_duplicate from validate-emails.ts: a later occurrence of an address
   *  already in this list — the first occurrence carries the send. */
  isDuplicate: boolean;
  /** BOTH name_match and role_confidence columns exist (both upstream identity
   *  scripts ran) — one alone is still a partial identity check. */
  identityColumnsPresent: boolean;
};

function normalizeVerification(raw: string): Verification {
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "") return "missing";
  if (["valid", "deliverable", "ok", "safe"].includes(value)) return "valid";
  if (["catch_all", "catchall", "accept_all", "acceptall", "risky"].includes(value)) {
    return "catch_all";
  }
  if (["invalid", "undeliverable", "bad"].includes(value)) return "invalid";
  return "unknown";
}

function extractSignals(row: Row, columns: Columns): Signals {
  const value = (key: ColumnKey): string => {
    const column = columns[key];
    return column ? (row[column] ?? "").trim() : "";
  };
  const hasEmail = value("email") !== "";
  const parsedCorroborations = Number.parseInt(value("corroboration"), 10);
  return {
    hasEmail,
    verification: normalizeVerification(value("status")),
    // Missing corroboration count → 1 when an email is present (the finder
    // that produced it counts as one source).
    corroborations: Number.isNaN(parsedCorroborations)
      ? hasEmail
        ? 1
        : 0
      : parsedCorroborations,
    nameMatch: value("nameMatch").toLowerCase(),
    roleConfidence: value("roleConfidence").toLowerCase(),
    emailRisk: value("emailRisk").toLowerCase(),
    isDuplicate: value("isDuplicate").trim().toLowerCase() === "true",
    identityColumnsPresent:
      columns.nameMatch !== undefined && columns.roleConfidence !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const FLAG_REASONS: Record<string, string> = {
  "no-email": "No email address on this row — nothing to send to.",
  "invalid-email": "Email failed syntax validation and will bounce.",
  "disposable-email": "Email uses a disposable domain — not a durable contact.",
  "failed-verification": "Email verification returned invalid — this address bounces.",
  "name-mismatch":
    "Profile name does not match the contact — likely the wrong person, worse than no send.",
  "catchall-single-source":
    "Catch-all domain with a single source — needs a second independent provider before sending.",
  "unverified-email": "Email was never verified — run verifyEmail before sending.",
  "stale-or-ambiguous-role":
    "Role confidence is low — the contact may have changed jobs.",
  "role-account": "Role-based address (info@, sales@, …) — unlikely to reach a person.",
  "catchall-corroborated":
    "Catch-all domain corroborated by 2+ independent providers — safe to send.",
  "free-provider": "Free email provider — fine for SMB outreach.",
  "partial-signals":
    "Audited with incomplete identity signals — run both validate-linkedin-names.ts and select-current-role.ts for full coverage.",
  "duplicate-row":
    "Same address appears earlier in this list — the first occurrence carries the send.",
};

type Verdict = { action: Action; flags: string[]; flagReason: string };

export function auditRow(signals: Signals): Verdict {
  const s = signals;
  const flags: string[] = [];
  if (!s.hasEmail) flags.push("no-email");
  if (s.hasEmail && s.emailRisk === "invalid") flags.push("invalid-email");
  if (s.hasEmail && s.emailRisk === "disposable") flags.push("disposable-email");
  if (s.hasEmail && s.verification === "invalid") flags.push("failed-verification");
  if (s.isDuplicate) flags.push("duplicate-row");
  if (s.nameMatch === "false") flags.push("name-mismatch");
  const singleSourceCatchAll =
    s.hasEmail && s.verification === "catch_all" && s.corroborations < 2;
  if (singleSourceCatchAll) flags.push("catchall-single-source");
  const unverified = s.verification === "unknown" || s.verification === "missing";
  if (s.hasEmail && unverified) flags.push("unverified-email");
  if (s.roleConfidence === "low") flags.push("stale-or-ambiguous-role");
  if (s.hasEmail && s.emailRisk === "role") flags.push("role-account");
  if (s.hasEmail && s.verification === "catch_all" && s.corroborations >= 2) {
    flags.push("catchall-corroborated");
  }
  if (s.hasEmail && s.emailRisk === "free") flags.push("free-provider");

  let action: Action;
  let primary: string;
  if (!s.hasEmail) {
    action = "REMOVE";
    primary = "no-email";
  } else if (
    s.emailRisk === "invalid" ||
    s.emailRisk === "disposable" ||
    s.verification === "invalid"
  ) {
    action = "REMOVE";
    primary =
      s.emailRisk === "invalid"
        ? "invalid-email"
        : s.emailRisk === "disposable"
          ? "disposable-email"
          : "failed-verification";
  } else if (s.isDuplicate) {
    action = "REMOVE";
    primary = "duplicate-row";
  } else if (s.nameMatch === "false") {
    action = "REMOVE";
    primary = "name-mismatch";
  } else if (singleSourceCatchAll) {
    action = "VERIFY";
    primary = "catchall-single-source";
  } else if (unverified) {
    action = "VERIFY";
    primary = "unverified-email";
  } else if (s.roleConfidence === "low") {
    action = "REVIEW";
    primary = "stale-or-ambiguous-role";
  } else if (s.emailRisk === "role") {
    action = "REVIEW";
    primary = "role-account";
  } else {
    action = "SEND";
    if (!s.identityColumnsPresent) flags.push("partial-signals");
    primary = flags[0] ?? "";
  }
  return { action, flags, flagReason: primary === "" ? "" : FLAG_REASONS[primary] };
}

// ---------------------------------------------------------------------------
// Fixture mode
// ---------------------------------------------------------------------------

type FixtureCase = {
  row: Row;
  expected: { action: Action; flags: string[] };
  note: string;
};

function runFixtures(): void {
  const path = join(import.meta.dirname, "fixtures_contact_accuracy_audit.json");
  const { cases } = readJson<{ cases: FixtureCase[] }>(path);
  const noArgs: Args = { values: new Map(), flags: new Set() };
  const failures: string[] = [];
  cases.forEach((fixture, index) => {
    const columns = detectColumns(Object.keys(fixture.row), noArgs);
    const verdict = auditRow(extractSignals(fixture.row, columns));
    const got = [...verdict.flags].sort().join(";");
    const want = [...fixture.expected.flags].sort().join(";");
    if (verdict.action !== fixture.expected.action || got !== want) {
      failures.push(
        `case ${index + 1} (${fixture.note}): expected ${fixture.expected.action} ` +
          `[${want}], got ${verdict.action} [${got}]`,
      );
    }
  });
  reportFixtureRun("contact-accuracy-audit", { total: cases.length, failures });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), {
    value: [
      "input",
      "workflow-uuid",
      "batch-uuid",
      "output-node-slug",
      "workspace-uuid",
      "output",
      ...Object.values(OVERRIDE_FLAGS),
    ],
    boolean: ["fixtures", "summary-json", "json"],
  });
  if (args.flags.has("fixtures")) return runFixtures();

  const rows = await readRows(args);
  if (rows.length === 0) fail("no input rows to audit");
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const columns = detectColumns(headers, args);
  if (!columns.email) {
    fail(
      `could not detect an email column in [${headers.join(", ")}] — pass --email-column`,
    );
  }

  const actionCounts: Record<Action, number> = {
    SEND: 0,
    VERIFY: 0,
    REVIEW: 0,
    REMOVE: 0,
  };
  const flagCounts = new Map<string, number>();
  const audited: Row[] = rows.map((row) => {
    const verdict = auditRow(extractSignals(row, columns));
    actionCounts[verdict.action] += 1;
    for (const flag of verdict.flags) {
      flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
    }
    return {
      ...row,
      audit_action: verdict.action,
      audit_flags: verdict.flags.join(";"),
      audit_flag_reason: verdict.flagReason,
    };
  });

  // Summary table (always stderr, so stdout stays machine-readable).
  const topFlags = [...flagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const summaryLines = [`contact-accuracy-audit: ${rows.length} rows audited`];
  for (const action of ["SEND", "VERIFY", "REVIEW", "REMOVE"] as Action[]) {
    summaryLines.push(`  ${action.padEnd(8)}${actionCounts[action]}`);
  }
  if (topFlags.length > 0) {
    summaryLines.push("top flags:");
    for (const [flag, count] of topFlags) {
      summaryLines.push(`  ${flag.padEnd(26)}${count}`);
    }
  }
  process.stderr.write(summaryLines.join("\n") + "\n");

  const outputPath = args.values.get("output");
  // --json renders the audited rows as a JSON array instead of CSV — the shape
  // jq chains want (e.g. select(.audit_action == "SEND") before handoff).
  const rendered = args.flags.has("json")
    ? JSON.stringify(audited, null, 2) + "\n"
    : toCsv(audited, [...headers, "audit_action", "audit_flags", "audit_flag_reason"]);
  if (outputPath) {
    writeFileSync(outputPath, rendered);
    process.stderr.write(`wrote ${audited.length} audited rows to ${outputPath}\n`);
  }
  if (args.flags.has("summary-json")) {
    const summary = {
      send: actionCounts.SEND,
      verify: actionCounts.VERIFY,
      review: actionCounts.REVIEW,
      remove: actionCounts.REMOVE,
      flags: Object.fromEntries(flagCounts),
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else if (!outputPath) {
    process.stdout.write(rendered);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
