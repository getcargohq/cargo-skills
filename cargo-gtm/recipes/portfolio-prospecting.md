# Recipe — Investor portfolio → contacts → outbound

Use this skill when the user wants to **prospect into the portfolio of a specific investor or accelerator**. Common pattern: a partner / accelerator program is a known proxy for ICP fit, so all their portfolio companies are pre-qualified.

**Trigger phrases:**
- *"Find every company backed by Sequoia and reach out to their CTOs."*
- *"Prospect into the YC W26 batch."*
- *"Build a list of CFO contacts at all Insight Partners portfolio companies."*
- *"Show me every founder funded by First Round Capital."*

## Why this is its own skill

Portfolio prospecting has a specific shape that doesn't fit the generic prospecting pipeline:

- The sourcing filter (investor name, fund, batch) isn't expressible in salesNavigator's UI-style filters.
- `peopleDataLabs.queryCompanies` is the right tool — its **SQL** API can filter on investor / funding fields that no other priority-stack provider exposes.
- Once portfolio companies are sourced, you typically want a tight per-company contact cap (1–3 prospects per portfolio company) — different from generic at-scale lead search.

## Recipe

### Step 1 — Source portfolio companies via investor filter (PDL SQL)

`queryCompanies` accepts a SQL string — array-membership filters like investor name require SQL (cargo's `{conjonction, groups, conditions}` filter shape can't express `summary.investors LIKE %X%`).

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"queryCompanies","config":{}}' \
  --data '{
    "query": "SELECT * FROM company WHERE summary.investors LIKE %Sequoia Capital%",
    "limit": 200
  }' \
  --wait-until-finished > /tmp/portfolio.json
```

For accelerator batches (e.g. YC W26), the investor field still works — accelerators are stored in `summary.investors` alongside VCs. Common SQL fields useful here:

| PDL SQL field | Use for |
|---|---|
| `summary.investors` | Investor / accelerator filter (use `LIKE %Name%`) |
| `latest_funding_stage` | Stage filter (e.g. `'series_b'`, `'seed'`) |
| `total_funding_raised` | Total funding raised (range query) |
| `industry` | Industry filter |
| `employee_count` | Headcount range |
| `location.country` / `location.locality` | Geography |
| `tags` | Topic tags |

See PDL's SQL reference for the full schema.

### Step 2 — Match portfolio companies against cargo

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchBusiness","config":{}}' \
  --records "$(jq -c '[.results[] | {domain: .website}]' /tmp/portfolio.json)" \
  --wait-until-finished > /tmp/matched.json
```

### Step 3 — Enrich firmographics on the portfolio

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichBusinessFirmographics","config":{}}' \
  --records "$(jq -c '[.results[] | select(.business_id) | {business_id}]' /tmp/matched.json)" \
  --wait-until-finished > /tmp/firmo.json
```

### Step 4 — Find contacts at each portfolio company

Cap tightly — for portfolio prospecting, 1–3 contacts per company is usually right. Targets are typically founder / CEO / role-of-interest.

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads","config":{}}' \
  --records "$(jq -c '[.results[] | {
    keywords: "Founder OR CEO OR CTO",
    company: {linkedinIds: [.linkedinId]},
    limit: 3
  }]' /tmp/portfolio.json)" \
  --wait-until-finished > /tmp/contacts.json
```

### Step 5 — Find emails

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findEmail","config":{}}' \
  --records "$(jq -c '[.contacts[] | {firstName, lastName, domainName: .companyDomain, linkedinUrl: .linkedinUrl}]' /tmp/contacts.json)" \
  --wait-until-finished > /tmp/emails.json
```

### Step 6 — Verify emails

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"verifyEmail","config":{}}' \
  --records "$(jq -c '[.results[] | select(.email) | {email}]' /tmp/emails.json)" \
  --wait-until-finished > /tmp/verified.json
```

### Step 7 — Personalize outbound (optional)

Use `cargo.enrichProspectDetails` to pull recent LinkedIn posts, then `anthropic.instruct` for a personalized opener referencing the investor + recent portfolio activity. See [`../guides/writing-outreach.md`](../guides/writing-outreach.md) for prompt patterns.

## Credit budget

For 200 portfolio companies × 3 contacts each = 600 prospects:

| Step | Cost per record | Records | Subtotal |
|---|---|---|---|
| 1. queryCompanies (single call returning 200) | — | 1 call | 3 |
| 2. matchBusiness | 0.5 | 200 | 100 |
| 3. enrichBusinessFirmographics | 0.5 | 200 | 100 |
| 4. searchLeads (3 contacts each) | 0.02 | 600 | 12 |
| 5. FullEnrich.findEmail | 1 | 600 | 600 |
| 6. waterfall.verifyEmail | 0.1 | 600 | 60 |
| **Total** | | | **~875 credits for 600 verified contacts at 200 portfolio companies** |

## Discovery sequence

```bash
# Confirm priority connectors
for slug in peopleDataLabs salesNavigator FullEnrich waterfall cargo; do
  cargo-ai connection connector list --integration-slug "$slug" \
    | jq -e '.connectors | length > 0' > /dev/null \
    && echo "✓ $slug" || echo "✗ $slug"
done
```

## Action shape

`{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**

## Output retrieval

After each batch step, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>` for output data.

## When the investor isn't in peopleDataLabs

If `peopleDataLabs.queryCompanies` doesn't recognize the investor name (e.g. very small fund, regional accelerator), fall back to:

- `apolloio` if its investor coverage is stronger for the niche.
- `firecrawl.scrape` on the investor's portfolio page (if public) → LLM extract via `anthropic.instruct`.
- File a `cargo-ai workspaceManagement report create` if neither works — surfaces the gap to the cargo team.

## When stuck — file a workspace report

See [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md) (Reports section).
