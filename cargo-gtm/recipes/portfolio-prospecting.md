# Recipe — Investor portfolio → contacts → outbound

Use this recipe when the user wants to **prospect into the portfolio of a specific investor or accelerator**. Common pattern: a partner / accelerator program is a known proxy for ICP fit, so all their portfolio companies are pre-qualified.

**Trigger phrases:**
- *"Find every company backed by Sequoia and reach out to their CTOs."*
- *"Prospect into the YC W26 batch."*
- *"Build a list of CFO contacts at all Insight Partners portfolio companies."*
- *"Show me every founder funded by First Round Capital."*

## Why this is its own skill

Portfolio prospecting has a specific shape that doesn't fit the generic prospecting pipeline:

- The sourcing filter (investor name, fund, batch) isn't expressible in salesNavigator's UI-style filters.
- `theirStack.searchCompanies` is the right tool: it filters on investors (`company_investors_or`, `company_investors_partial_match_or`), YC membership (`only_yc_companies`) and funding fields natively. peopleDataLabs has no investor field.
- Once portfolio companies are sourced, you typically want a tight per-company contact cap (1–3 prospects per portfolio company) — different from generic at-scale lead search.

## Recipe

### Step 1 — Source portfolio companies via investor filter (theirStack)

```bash
# A direct run's output is at .runContext.action (the action runs as a node slugged "action")
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchCompanies"}' \
  --data '{
    "fields": {"company_investors_partial_match_or": ["Sequoia Capital"]},
    "limit": 200
  }' \
  --wait-until-finished | jq '.runContext.action // []' > /tmp/portfolio.json
```

Billed 0.5 per company returned, so `limit: 200` costs up to 100 credits. For YC batches (e.g. W26), set `"only_yc_companies": true` and keep the rows whose returned `yc_batch` matches. Filters useful here, all inside `fields`:

| theirStack field | Use for |
|---|---|
| `company_investors_partial_match_or` | Investor / accelerator name, partial match |
| `company_investors_or` | Investor name, exact match |
| `only_yc_companies` | YC portfolio only (boolean) |
| `funding_stage_or` | Stage filter |
| `min_funding_usd` / `max_funding_usd` | Total funding raised (range) |
| `last_funding_round_date_gte` | Raised since a date |
| `industry_id_or` | Industry, theirStack ids as strings (`"4"` Software Development) |
| `min_employee_count` / `max_employee_count` | Headcount range |
| `company_country_code_or` | Geography (ISO codes, `"US"`) |

Each returned company carries `domain`, `linkedin_id`, `investors` and `yc_batch`.

### Step 2 — Dedupe the portfolio against the workspace (free)

```bash
cargo-ai storage query execute "SELECT domain FROM default.companies" > /tmp/known.json

jq -c --slurpfile known /tmp/known.json \
  '[.[] | {domain, linkedin_id} | select(.domain as $d
      | ($known[0].rows // [] | map(.domain)) | index($d) | not)]' \
  /tmp/portfolio.json > /tmp/new-portfolio.json
```

`execute-batch --wait-until-finished` prints the batch object, not rows. The steps below read rows from `batch download` (a signed CSV: each input record's columns plus every output key as `cargo_<key>`) through this helper:

```bash
batch_rows() {
  curl -fsSL "$(cargo-ai orchestration batch download --uuid "$1" | jq -r .url)" \
    | python3 -c 'import csv,json,sys; json.dump(list(csv.DictReader(sys.stdin)), sys.stdout)'
}
```

### Step 3 — Enrich firmographics on the portfolio

```bash
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichCompany"}' \
  --records "$(jq -c '[.[] | {domain}]' /tmp/new-portfolio.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/firmo.json
```

### Step 4 — Find contacts at each portfolio company

Cap tightly — for portfolio prospecting, 1–3 contacts per company is usually right. Targets are typically founder / CEO / role-of-interest.

```bash
# `domain` rides along in each record so it comes back as a CSV column;
# the action ignores it. A search output is an array, so it lands in one
# `cargo` column as JSON.
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads"}' \
  --records "$(jq -c '[.[] | select(.linkedin_id) | {
    domain,
    keywords: "Founder OR CEO OR CTO",
    company: {currentCompanyIds: [.linkedin_id]},
    limit: 3
  }]' /tmp/new-portfolio.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" \
  | jq '[.[] | .domain as $d | (.cargo // "" | if . == "" then [] else fromjson end)[] | . + {domain: $d}]' \
  > /tmp/contacts.json
```

### Step 5 — Find emails

```bash
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findEmail"}' \
  --records "$(jq -c '[.[] | {firstName: .first_name, lastName: .last_name, domainName: .domain, linkedinUrl: .linkedin_profile_url}]' /tmp/contacts.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/emails.json
```

### Step 6 — Verify emails

```bash
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"verifyEmail"}' \
  --records "$(jq -c '[.[] | select((.cargo_most_probable_email // "") != "") | {email: .cargo_most_probable_email}]' /tmp/emails.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/verified.json   # status in cargo_email_status
```

### Step 7 — Personalize outbound (optional)

Use `linkedin.extractProfilePostActivity` (0.05/item) to pull recent LinkedIn posts, then `anthropic.instruct` for a personalized opener referencing the investor + recent portfolio activity. See [`../guides/writing-outreach.md`](../guides/writing-outreach.md) for prompt patterns.

## Credit budget

For 200 portfolio companies × 3 contacts each = 600 prospects:

| Step | Cost per record | Records | Subtotal |
|---|---|---|---|
| 1. theirStack.searchCompanies (200 returned) | 0.5 | 200 | 100 |
| 2. Dedupe against the Companies model | 0 | 200 | 0 |
| 3. aiArk.enrichCompany | 0.01 | 200 | 2 |
| 4. searchLeads (3 contacts each) | 0.2 | 600 | 120 |
| 5. FullEnrich.findEmail | 1 | 600 | 600 |
| 6. waterfall.verifyEmail | 0.1 | 600 | 60 |
| **Total** | | | **~882 credits for 600 verified contacts at 200 portfolio companies** |

## Discovery sequence

```bash
# Confirm priority connectors
for slug in theirStack salesNavigator FullEnrich waterfall; do
  cargo-ai connection connector list --integration-slug "$slug" \
    | jq -e '.connectors | length > 0' > /dev/null \
    && echo "✓ $slug" || echo "✗ $slug"
done
```

## Action shape

`{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>"}`. **No `connectorUuid` in `config`.**

## Output retrieval

After each batch step, `cargo-ai orchestration batch download --uuid <batch-uuid>` returns `{"url": ...}`, a signed CSV of the input columns plus the output as `cargo_<key>` columns (the `batch_rows` helper above). An ad-hoc `execute-batch` has no workflow, so `run download-outputs --workflow-uuid` does not apply.

## When the investor isn't in theirStack

If `theirStack.searchCompanies` doesn't recognize the investor name (e.g. very small fund, regional accelerator), fall back to:

- `apolloio.enrichOrganization` / `enrichPerson` (1) — the priority stack's niche-coverage rung, and the standing example of it: Apollo's investor coverage is often stronger here than the generalist chain.
- `firecrawl.scrape` on the investor's portfolio page (if public) → LLM extract via `anthropic.instruct`.
- File a `cargo-ai workspaceManagement report create` if neither works — surfaces the gap to the cargo team.

## When stuck — file a workspace report

See [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md) (Reports section).
