// validate-emails.ts — free deterministic email pre-filter for cargo-gtm.
//
// Paid verification (waterfall verifyEmail) costs credits per address. This
// script culls obvious junk first — malformed addresses, placeholders,
// disposable domains — and flags role accounts and consumer free-mail so the
// paid step only runs on addresses worth verifying.
//
// Usage:
//   node validate-emails.ts --input <rows.csv|rows.json> [--email-column email]
//     [--output <file.csv>]
//   node validate-emails.ts --workflow-uuid <uuid> [--batch-uuid <uuid>]
//     [--output-node-slug <slug>] [--workspace-uuid <uuid>]
//   node validate-emails.ts --fixtures
//
// Output: input rows + `valid`, `risk`, `reason`, `recommendation`,
// `is_duplicate` columns as CSV (stdout or --output). A one-line summary goes
// to stderr, including how many paid verifications were saved
// (invalid + disposable rows).
//
// Runtime contract: Node >= 22.18, run directly (`node validate-emails.ts`,
// native type-stripping). Erasable TypeScript only; zero npm dependencies.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseArgs,
  readRows,
  toCsv,
  readJson,
  reportFixtureRun,
  fail,
  type Row,
} from "./lib/common.ts";

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type Risk = "ok" | "free" | "role" | "disposable" | "invalid";

export type Classification = {
  valid: boolean;
  risk: Risk;
  reason: string;
};

// Throwaway inbox providers. Addresses here bounce or rot within minutes —
// never worth a paid verification credit.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "sharklasers.com",
  "throwawaymail.com",
  "getnada.com",
  "maildrop.cc",
  "dispostable.com",
  "fakeinbox.com",
  "trashmail.com",
  "mytemp.email",
  "mohmal.com",
  "emailondeck.com",
  "spamgourmet.com",
  "mailnesia.com",
  "tempinbox.com",
  "mintemail.com",
  "mailcatch.com",
  "inboxkitten.com",
  "33mail.com",
  "burnermail.io",
  "anonaddy.me",
  "spam4.me",
  "grr.la",
  "pokemail.net",
  "tmpmail.org",
  "moakt.com",
]);

// Role accounts (exact local-part match) — shared inboxes, poor outreach
// targets; verify only after human review.
const ROLE_LOCALS = new Set([
  "info",
  "sales",
  "support",
  "admin",
  "contact",
  "hello",
  "team",
  "office",
  "hr",
  "jobs",
  "careers",
  "marketing",
  "billing",
  "finance",
  "legal",
  "help",
  "service",
  "enquiries",
  "inquiries",
  "press",
  "media",
  "webmaster",
  "postmaster",
  "abuse",
  "noc",
  "security",
  "no-reply",
  "noreply",
  "newsletter",
]);

// Consumer free-mail providers. Fine for SMB outreach, but flagged — for B2B a
// contact at the company domain is preferred.
const FREE_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.es",
  "yahoo.it",
  "yahoo.ca",
  "yahoo.co.jp",
  "yahoo.co.in",
  "yahoo.com.au",
  "yahoo.com.br",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "live.com",
  "msn.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.de",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "web.de",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "t-online.de",
  "comcast.net",
  "verizon.net",
  "att.net",
  "qq.com",
  "163.com",
  "126.com",
]);

// Placeholder detection. Literal junk values first, then substring patterns
// CRMs commonly hold instead of a real address. Note the ordering consequence:
// "no-reply@…" is caught here as a placeholder (before the role check ever
// runs), while "noreply@…" (no hyphen) passes syntax and classifies as a role
// account. Domain placeholders are matched on the EXACT domains example.com /
// example.org / example.net — invented business domains under the reserved
// .example and .test TLDs (e.g. acme-widgets.example) stay valid.
const PLACEHOLDER_LITERALS = new Set(["n/a", "null", "none"]);
const PLACEHOLDER_SUBSTRINGS = ["test@test", "noemail", "no-reply@", "unknown@"];
const PLACEHOLDER_DOMAINS = new Set(["example.com", "example.org", "example.net"]);

const LOCAL_CHARSET = /^[a-z0-9._%+-]+$/;
const DOMAIN_LABEL = /^[a-z0-9-]+$/;
const TLD = /^[a-z]{2,}$/;

function invalid(reason: string): Classification {
  return { valid: false, risk: "invalid", reason };
}

/** Normalize (trim + lowercase) an email for comparison and dedupe. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Pure, deterministic email classification — no network, no credits.
 * `valid` means syntactically plausible (risk !== "invalid"); `risk` grades
 * how worthwhile a paid verification would be.
 */
export function classifyEmail(email: string): Classification {
  const normalized = normalizeEmail(email);
  if (normalized === "") return invalid("empty value");
  if (PLACEHOLDER_LITERALS.has(normalized)) {
    return invalid(`placeholder value "${normalized}"`);
  }
  for (const pattern of PLACEHOLDER_SUBSTRINGS) {
    if (normalized.includes(pattern)) {
      return invalid(`placeholder pattern "${pattern}"`);
    }
  }
  if (/[\s,]/.test(normalized)) return invalid("contains spaces or commas");
  if (normalized.length > 254) return invalid("longer than 254 characters");

  const atCount = normalized.split("@").length - 1;
  if (atCount === 0) return invalid("missing @");
  if (atCount > 1) return invalid("more than one @");
  const [local, domain] = normalized.split("@");

  if (local.length === 0) return invalid("empty local part");
  if (local.length > 64) return invalid("local part longer than 64 characters");
  if (!LOCAL_CHARSET.test(local)) {
    return invalid("local part has characters outside [a-z0-9._%+-]");
  }
  if (local.startsWith(".") || local.endsWith(".")) {
    return invalid("local part starts or ends with a dot");
  }
  if (local.includes("..")) return invalid("local part has consecutive dots");

  if (domain.length === 0) return invalid("empty domain");
  if (domain.length > 253) return invalid("domain longer than 253 characters");
  const labels = domain.split(".");
  if (labels.length < 2) return invalid("domain needs at least two labels");
  for (const label of labels) {
    if (label.length === 0) return invalid("domain has an empty label");
    if (label.length > 63) return invalid("domain label longer than 63 characters");
    if (!DOMAIN_LABEL.test(label)) {
      return invalid("domain label has characters outside [a-z0-9-]");
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      return invalid("domain label starts or ends with a hyphen");
    }
  }
  if (!TLD.test(labels[labels.length - 1])) {
    return invalid("TLD must be at least 2 alphabetic characters");
  }
  if (PLACEHOLDER_DOMAINS.has(domain)) {
    return invalid(`placeholder domain "${domain}"`);
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      valid: true,
      risk: "disposable",
      reason: `disposable provider "${domain}"`,
    };
  }
  if (ROLE_LOCALS.has(local)) {
    return { valid: true, risk: "role", reason: `role account "${local}@"` };
  }
  if (FREE_DOMAINS.has(domain)) {
    return {
      valid: true,
      risk: "free",
      reason: `consumer free-mail "${domain}" — company domain preferred for B2B`,
    };
  }
  return { valid: true, risk: "ok", reason: "syntax OK, business domain" };
}

const RECOMMENDATION: Record<Risk, string> = {
  invalid: "skip",
  disposable: "skip",
  role: "review",
  free: "verify",
  ok: "verify",
};

// ---------------------------------------------------------------------------
// Fixture mode
// ---------------------------------------------------------------------------

type FixtureCase = {
  email: string;
  expected: { valid: boolean; risk: Risk };
  note: string;
};

function runFixtures(): void {
  const path = join(import.meta.dirname, "fixtures_email_validation.json");
  const { cases } = readJson<{ cases: FixtureCase[] }>(path);
  const failures: string[] = [];
  for (const c of cases) {
    const got = classifyEmail(c.email);
    if (got.valid !== c.expected.valid || got.risk !== c.expected.risk) {
      failures.push(
        `${JSON.stringify(c.email)} (${c.note}): expected ` +
          `valid=${c.expected.valid} risk=${c.expected.risk}, got ` +
          `valid=${got.valid} risk=${got.risk} (${got.reason})`,
      );
    }
  }
  reportFixtureRun("validate-emails", { total: cases.length, failures });
}

// ---------------------------------------------------------------------------
// Row mode
// ---------------------------------------------------------------------------

const EMAIL_COLUMN_CANDIDATES = ["email", "workEmail", "emailAddress", "contactEmail"];

function resolveEmailColumn(rows: Row[], override: string | undefined): string {
  const columns = Object.keys(rows[0] ?? {});
  if (override) {
    if (!columns.includes(override)) {
      fail(
        `--email-column "${override}" not found — available columns: ` +
          columns.join(", "),
      );
    }
    return override;
  }
  for (const candidate of EMAIL_COLUMN_CANDIDATES) {
    const match = columns.find((c) => c.toLowerCase() === candidate.toLowerCase());
    if (match) return match;
  }
  return fail(
    `no email column found (tried ${EMAIL_COLUMN_CANDIDATES.join(", ")}) — ` +
      `pass --email-column; available columns: ${columns.join(", ")}`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), {
    value: [
      "input",
      "workflow-uuid",
      "batch-uuid",
      "output-node-slug",
      "workspace-uuid",
      "email-column",
      "output",
    ],
    boolean: ["fixtures", "json"],
  });

  if (args.flags.has("fixtures")) {
    runFixtures();
    return;
  }

  const rows = await readRows(args);
  if (rows.length === 0) fail("no input rows");
  const emailColumn = resolveEmailColumn(rows, args.values.get("email-column"));

  const counts: Record<Risk, number> = {
    ok: 0,
    free: 0,
    role: 0,
    disposable: 0,
    invalid: 0,
  };
  const seen = new Set<string>();
  let duplicates = 0;

  const output = rows.map((row) => {
    const email = row[emailColumn] ?? "";
    const result = classifyEmail(email);
    counts[result.risk]++;

    const normalized = normalizeEmail(email);
    const isDuplicate = normalized !== "" && seen.has(normalized);
    if (isDuplicate) duplicates++;
    if (normalized !== "") seen.add(normalized);

    // Prefixed column names: they survive merges with provider outputs and
    // are what contact-accuracy-audit.ts auto-detects downstream.
    return {
      ...row,
      email_syntax_valid: String(result.valid),
      email_risk: result.risk,
      email_risk_reason: result.reason,
      // Duplicates skip regardless of risk — verifying the same address twice
      // is pure credit waste; the first occurrence carries the verdict.
      recommendation: isDuplicate ? "skip" : RECOMMENDATION[result.risk],
      is_duplicate: String(isDuplicate),
    };
  });

  // --json renders rows as a JSON array — the shape jq chains want (e.g.
  // select(.recommendation != "skip") to build the paid-verify batch).
  const rendered = args.flags.has("json")
    ? JSON.stringify(output, null, 2) + "\n"
    : toCsv(output);
  const outputPath = args.values.get("output");
  if (outputPath) {
    writeFileSync(outputPath, rendered);
  } else {
    process.stdout.write(rendered);
  }

  const saved = counts.invalid + counts.disposable + duplicates;
  process.stderr.write(
    `validate-emails: ${rows.length} rows — ok=${counts.ok} free=${counts.free} ` +
      `role=${counts.role} disposable=${counts.disposable} invalid=${counts.invalid}; ` +
      `duplicates=${duplicates}; paid verifications saved=${saved}\n`,
  );
}

await main();
