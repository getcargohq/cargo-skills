# Contact accuracy — deterministic QA scripts

Every list that reaches a sequencer or CRM carries three failure modes that
prose diligence misses: the **wrong person** (same-name decoy behind a LinkedIn
URL), the **stale role** (contact left the company; the #1 source of bounces
and bad first lines), and the **unsafe email** (catch-all domains that accept
anything, single-source guesses, role accounts). This reference wires four
runnable TypeScript scripts into the pipeline so those checks are code, not
judgment.

**The rule: run the script — do not re-derive its logic in-context.** The
scripts are deterministic, fixture-tested in CI, and cheaper than reasoning
through 500 rows. If a script's verdict looks wrong, that's a bug report
(`workspaceManagement report create`), not a reason to hand-check rows.

## Runtime

Scripts live in [`../scripts/`](../scripts/) (this skill's directory — resolve
relative to wherever the skill loaded from). They run directly with Node ≥
22.18 (`node <script>.ts`, native type-stripping; `npx tsx <script>.ts` on
older Nodes). Zero dependencies for file mode. Every script supports:

- `--input <file.csv|file.json>` — rows from a file: a CSV from
  `run download-outputs`, a JSON array, or raw `action execute-batch` output
  (`{"results": [...]}` is unwrapped automatically), **or**
- `--workflow-uuid <uuid>` (+ optional `--batch-uuid`, `--output-node-slug`,
  `--workspace-uuid`) — **API mode**: fetches the output rows directly via the
  `@cargo-ai/api` package (`npm install -g @cargo-ai/api` if missing), reusing
  the CLI's stored login (`~/.config/cargo-ai/credentials.json`) or
  `CARGO_API_TOKEN`. Equivalent to `run download-outputs`, no temp file.
- `--output <file>` — write augmented rows (default: stdout). On
  `validate-emails.ts` and `contact-accuracy-audit.ts`, `--json` switches the
  row output from CSV to a JSON array — use it when the next step is a `jq`
  filter (build the paid-verify batch from `recommendation != "skip"` rows;
  hand off only `audit_action == "SEND"` rows).
- `--fixtures` — self-test against the bundled fixture file; exits non-zero on
  failure (CI runs this on every push).

## The four scripts, in pipeline order

| Stage | Script | Adds columns | Run it… |
|---|---|---|---|
| Before paid verification | `validate-emails.ts` | `email_syntax_valid`, `email_risk` (ok/free/role/disposable/invalid), `recommendation`, `is_duplicate` | on every enriched list, **before** `waterfall.verifyEmail` — culling invalid/disposable/duplicate rows first is free and shrinks the paid verify batch |
| After enrichment | `select-current-role.ts` | `current_title`, `current_company`, `role_confidence` (high/medium/low), `role_reason` | whenever a provider returned an experiences array — never trust the top experience blindly |
| After enrichment | `validate-linkedin-names.ts` | `name_match` (true/false), `name_match_reason` | whenever a LinkedIn URL was looked up from a name (see [`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md)) — catches same-name decoys |
| Last, before handoff | `contact-accuracy-audit.ts` | `audit_action` (**SEND / VERIFY / REVIEW / REMOVE**), `audit_flags`, `audit_flag_reason` | on the final merged output, after verification — the audit consumes the columns the other three produced (it degrades gracefully if some are missing) |

**The audit must see every row.** Merge verification statuses back onto the
full row set before auditing — never pre-filter to `status == "valid"` first,
or the catch-all/unknown/invalid rows silently vanish along with their
VERIFY/REVIEW/REMOVE verdicts and the receipt counts. Filtering happens once,
after the audit: only `audit_action == "SEND"` rows proceed.

Chaining example (each script reads the previous one's output):

```bash
S=<path-to-this-skill>/scripts
node $S/validate-emails.ts        --input outputs.csv        --output step1.csv
# … run waterfall.verifyEmail on the survivors, merge results into step2.csv …
node $S/select-current-role.ts    --input step2.csv          --output step3.csv
node $S/validate-linkedin-names.ts --input step3.csv         --output step4.csv
node $S/contact-accuracy-audit.ts  --input step4.csv         --output final.csv
```

Or audit a finished run in one step, no download:

```bash
node $S/contact-accuracy-audit.ts --workflow-uuid <uuid> --batch-uuid <uuid> --summary-json
```

## What each verdict means

- **SEND** — verified email (or catch-all corroborated by ≥ 2 providers), no
  name mismatch, current role confirmed. Safe for the sequencer.
- **VERIFY** — email unproven (catch-all with a single source, or never
  verified). Route these rows back through `waterfall.verifyEmail` — that
  re-run is paid, so it goes through the pilot gate in
  [`cost-discipline.md`](cost-discipline.md).
- **REVIEW** — human-judgment rows: likely job changer (`role_confidence:
  low`), or a role account (info@/sales@). Present them to the user; don't
  silently send or drop.
- **REMOVE** — wrong person, invalid/disposable email, failed verification, or
  a duplicate row (the first occurrence carries the send).
  Drop from the batch and report the count in the receipt.

Report the audit summary with every deliverable — the stderr table (or
`--summary-json`) gives the counts to cite in the cost receipt, e.g. "412 SEND
/ 41 VERIFY / 22 REVIEW / 25 REMOVE".

## Fixtures & CI

Each script ships a `fixtures_*.json` next to it — synthetic cases only, no
real contact data. `--fixtures` recomputes every case;
`validate-linkedin-names.ts` additionally enforces precision ≥ 0.95 / recall ≥
0.85 on the match class. CI (`skills-lint` workflow) runs all four on every
push, so a green build means the verdicts you rely on are the verdicts that
were tested.
