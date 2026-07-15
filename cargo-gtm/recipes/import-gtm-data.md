# Recipe — Import existing GTM data into Cargo

Use this recipe when the user arrives with GTM data built elsewhere — spreadsheet exports, CRM dumps, lists from another data tool — and wants it living in Cargo: rows in models, recurring enrichments as plays, prompts in reusable form.

**Trigger phrases:**

- *"I have all my lists in another tool — move them into Cargo."*
- *"Import this CSV of accounts/contacts."*
- *"Recreate my enrichment table here."*
- *"We're consolidating our GTM stack onto Cargo."*

**Principle:** import the *data* first (cheap, lossless), then rebuild the *logic* selectively (each recurring enrichment becomes a play only if it's still worth paying for). Never re-run paid enrichment on rows that already carry the values.

## Step 1 — Export from the source

Every GTM tool exports CSV; prefer it over API scraping. Get one CSV per logical entity (companies, contacts, deals). Ask the user to include **all** columns — enriched values (emails, titles, firmographics) come along free and mean less re-enrichment spend later.

## Step 2 — Map columns to a Cargo model

```bash
cargo-ai storage model list          # existing Companies / Contacts models
cargo-ai storage model get-ddl --model-uuid <uuid>   # column slugs + types
```

Diff the CSV header against the model's columns. Create what's missing (see [`../../cargo-storage/SKILL.md`](../../cargo-storage/SKILL.md) for types):

```bash
cargo-ai storage column create \
  --model-uuid <uuid> \
  --column '{"slug":"source_tool_id","type":"string","label":"Source Tool ID","kind":"custom"}'
```

**Always add a `source_tool_id` column** holding the source's record ID — it makes the import idempotent, dedupable, and diffable against later re-exports. Keep a scratch mapping table (CSV column → model column) in the conversation; you'll cite it in the receipt.

## Step 3 — Load the rows

Upload the CSV and drive a batch from it (full flow: `cargo-orchestration` → [`references/examples/tools.md`](../../cargo-orchestration/references/examples/tools.md)):

```bash
cargo-ai workspaceManagement file upload --file ./contacts-export.csv
# → returns s3-filename; use it as the batch input for the write-back workflow
```

Dedupe before writing: match on `source_tool_id` first, then email, then company domain (`cargo.matchProspect` / `cargo.matchBusiness` at 0.5/record are the paid fallback — only for rows with no natural key; that spend goes through the pilot gate).

## Step 4 — QA what actually landed (free)

Imported ≠ trustworthy: exports carry stale roles and unverified emails. Audit **the stored rows, not the source export** ([`../references/contact-accuracy.md`](../references/contact-accuracy.md)) — dedupe and column mapping in step 3 changed the set, so auditing `contacts-export.csv` grades rows that never landed and misses the transforms. Pull the loaded rows back out first:

```bash
# Export the just-loaded rows from the model (source_tool_id marks this import)
cargo-ai storage query download \
  --query "SELECT * FROM <datasetSlug>.<modelSlug> WHERE source_tool_id IS NOT NULL"
# → returns a signed URL; save the file as ./loaded.csv

node <skill-dir>/scripts/validate-emails.ts --input ./loaded.csv --output ./culled.csv
node <skill-dir>/scripts/contact-accuracy-audit.ts --input ./culled.csv --output ./audited.csv
```

Report the SEND/VERIFY/REVIEW/REMOVE counts — then **write the verdicts back to the stored records** so downstream segments can act on them: create an `audit_action` column (same `--column` shape as step 2) and batch-upsert it from `./audited.csv` keyed on `source_tool_id`. Activation segments filter on `audit_action = "SEND"`; only the VERIFY bucket needs paid re-verification (`waterfall.verifyEmail`, 0.1/record — pilot-gate it); REMOVE rows stay stored but excluded from segments (bulk-delete only after the user reviews them).

## Step 5 — Rebuild recurring logic as plays (selective)

For each recurring enrichment/workflow in the source tool, decide with the user: **retire, keep manual, or rebuild**. For rebuilds:

1. Identify what each source column *did* (find email, enrich firmographics, score, personalize). If the source tool can export its table/workflow **schema as JSON**, use that as the mapping input instead of eyeballing the UI — e.g. for Clay tables, [ClayMate Lite](https://github.com/GTM-Base/claymate-lite) (MIT Chrome extension) exports column structures as portable JSON. *Third-party code: review it before loading — it runs on your logged-in session.*
2. Map it to the cheapest Cargo action for that stage — [`../references/stage-action-map.md`](../references/stage-action-map.md), then the provider's playbook (§11 gate applies).
3. LLM prompt columns: check [`../references/prompt-library/index.md`](../references/prompt-library/index.md) for a proven equivalent before porting the prompt text.
4. Compose the chain per the recipe spine and save it as a play — [`save-as-play.md`](save-as-play.md).

## Step 6 — Parity check (pilot-gated)

Before trusting a rebuilt play, run it on ~10 rows whose source-tool outputs are known and compare: coverage (found vs missing), agreement (same email/domain), and cost per row. Present the comparison table; the user decides whether parity is good enough to switch the play on. Disagreements on emails: the verified value wins, not the source.

## Credit budget

Import itself is ~free (storage writes). Spend concentrates in: dedupe matching for keyless rows (0.5/record), re-verification of the VERIFY bucket (0.1/record), and the parity pilot (~10 × play cost). Everything paid goes through the [`cost-discipline`](../references/cost-discipline.md) gate — state the three numbers before running.

## What this recipe deliberately doesn't do

No per-tool extraction scripts or action-name mappings — source tools change their internals without notice, and CSV export is universal. If a source tool's export is too limited, its API (with the user's own key) via the generic HTTP patterns in `cargo-orchestration` is the fallback.
