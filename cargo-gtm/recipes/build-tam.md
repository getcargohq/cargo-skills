# Recipe — Build a TAM list

**Use when**: the user wants a Total Addressable Market list of companies (and optionally contacts at those companies) matching ICP criteria.

**Trigger phrases**:
- *"Build me a TAM of fintech companies in the US, 50–500 employees."*
- *"Source 1,000 SaaS companies hiring data engineers."*
- *"Find every Series A-B startup running Snowflake."*
- *"Give me all the e-commerce brands in the EU under 100 people."*

## Sourcing decision tree

The right step-1 provider depends on which filter is primary:

| Primary filter | Provider | Cost (credits) | Notes |
|---|---|---|---|
| Industry / size / geo, free | `FullEnrich.searchCompanies` | 0 | **Free.** Plain-string filters (industry, headcount range, HQ, technologies, keywords), up to 2,000 per action run; `FullEnrich.fetchCompanies` pulls up to 10,000 straight into a model. Pilot this first. |
| Industry / size / geo | `salesNavigator.searchAccounts` | 0.2 | LinkedIn-anchored. Default for LinkedIn-native filters. |
| Industry / size / geo, budget-first | `aiArk.searchCompanies` | 0.01 | Cheapest *paid* search (20× under salesNavigator). Billed per *returned* row, `limit` up to 2,000 per action run (it pages internally, 100 per call). |
| "Companies like these customers" | `aiArk.searchCompanies` (with `lookalikeDomains`) | 0.01 | Up to 5 seed domains / LinkedIn URLs. Cheaper than `oceanio` / `companyEnrich` lookalikes. |
| Funding stage / round size | `peopleDataLabs.queryCompanies` | 3 | PDL **SQL** string, `WHERE` on `latest_funding_stage`, `total_funding_raised`, `last_funding_date`. PDL has no investor field. |
| Investor | `theirStack.searchCompanies` (with `fields.company_investors_partial_match_or`) | 0.5 | Investor / VC-portfolio sourcing. |
| Tech stack | `theirStack.searchCompanies` (with `fields.company_technology_slug_or`) | 0.5 | Tech-stack-driven sourcing. |
| Hiring for role X | `theirStack.searchJobs` | 0.5 | Hiring-intent signal. |
| Local SMBs / storefronts | `serper.searchPlaces` | 0.05 | Google Maps-style. |
| Already have a domain list | (skip sourcing) | — | Go straight to step 2 (dedupe + enrich). |

For combined filters (e.g. fintech in US AND running Snowflake AND hiring data engineers), do parallel queries and intersect client-side.

## Volume / cost guidance

| Target volume | Recommended sourcing path | Estimated credits (sourcing only) |
|---|---|---|
| Any volume up to 10,000, free | FullEnrich.searchCompanies / fetchCompanies | 0 |
| 100 companies | salesNavigator.searchAccounts | ~20 |
| 500 companies | salesNavigator.searchAccounts | ~100 |
| 1,000 companies | salesNavigator.searchAccounts | ~200 |
| 5,000 companies | salesNavigator.searchAccounts (`limit` max 5,000) | ~1,000 |
| 5,000 companies, budget-first | aiArk.searchCompanies (`limit` max 2,000 per run) | ~50 |
| 10,000 companies | peopleDataLabs.queryCompanies (high-quality, structured) | ~30,000 (3/company) |

The [sample → approval → full-run gate](../references/cost-discipline.md) applies at every volume: **10–20 rows first** (1–3 only proves the filter is syntactically right, not that the list is any good), receipt, then approval stating how many companies the full pull enrolls and what they cost, reconciled against the balance. For 5,000+ companies, widen the sample to **50 rows** — data-quality problems invisible at 3 rows show up at 50, and the 50-row cost is still noise next to the full pull. Size the pool cheaply first: search actions bill on *returned* rows, so a `limit: 1` probe costs one row. Search responses carry the rows only, not a total match count; `aiArk.countCompanies` returns the count for an aiArk filter at 0 credits.

## Inputs you need

- ICP criteria (industry, headcount range, geo, revenue band, funding stage, tech-stack signals — one or more).
- Target volume (10? 500? 5000? — drives provider choice).
- Whether contacts are required, and if so, role filter.
- Where the result lives (write to a Companies model? Export to CSV? Push to a CRM?).

If anything is missing, ask the user **once** before sourcing.

## Recipe

### Step 1 — Source companies

Free at any scale: `FullEnrich.searchCompanies` (0 cred, plain-string filters — pilot it first and keep it when the sample fits the ICP). Cheapest paid: `aiArk.searchCompanies` (0.01 cred/company, `limit` up to 2,000 per run) when price leads, or `salesNavigator.searchAccounts` (0.2 cred/company, `limit` up to 5,000) when you want LinkedIn-native filters. Both bill per *returned* row — probe with `limit: 1` first. The salesNavigator form (LinkedIn codes, as strings: `"43"` Financial Services, `"103644278"` United States, `D`/`E` = 51-200 / 201-500 employees):

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchAccounts"}' \
  --data '{
    "industryCodes": ["43"],
    "headquarterLocationIds": ["103644278"],
    "companyHeadcounts": ["D", "E"],
    "limit": 500
  }' \
  --wait-until-finished > /tmp/companies.json
```

`action execute --wait-until-finished` prints the run; the rows are under `runContext.action` (a direct action runs as one node with slug `action`). salesNavigator rows carry `company_name` and `sales_navigator_company_id` but **no domain**; `aiArk` and `FullEnrich` search rows carry `domain`.

Filter mismatch? Fall back to peopleDataLabs. Pick the right action by filter shape:

- **`searchCompanies`** (cargo's `{conjonction, groups, conditions}` filter shape) for simple AND/OR criteria:

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"searchCompanies"}' \
  --data '{
    "filter": {
      "conjonction": "and",
      "groups": [{
        "conjonction": "and",
        "conditions": [
          {"propertyName": "industry", "operator": "is", "values": ["financial services"]},
          {"propertyName": "employee_count", "operator": "greaterThanOrEquals", "value": 50},
          {"propertyName": "employee_count", "operator": "lowerThanOrEquals", "value": 500},
          {"propertyName": "location.country", "operator": "is", "values": ["united states"]}
        ]
      }]
    },
    "limit": 500
  }' \
  --wait-until-finished > /tmp/companies.json
```

- **`queryCompanies`** (PDL **SQL string**) when criteria require array-membership, joins, or complex bool combinations:

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"queryCompanies"}' \
  --data '{
    "query": "SELECT * FROM company WHERE industry = '\''financial services'\'' AND employee_count >= 50 AND employee_count <= 500 AND location.country = '\''united states'\''",
    "limit": 500
  }' \
  --wait-until-finished > /tmp/companies.json
```

### Step 2 — Dedupe against the workspace (free)

Sourcing returns companies you may already hold. Filter them out **before** any
paid enrichment — this is a storage read, not a paid action:

```bash
cargo-ai storage query execute "SELECT domain FROM default.companies" > /tmp/known.json

# keep only the domains the workspace doesn't already have
jq -c --slurpfile known /tmp/known.json \
  '[.runContext.action[]
    | {domain: (.domain // .website), linkedinId: .sales_navigator_company_id}
    | select(.domain as $d | ($known[0].rows // [] | map(.domain)) | index($d) | not)]' \
  /tmp/companies.json > /tmp/new-companies.json
```

`domain` is the join key for every enrichment below — no provider-side id is
needed for those. A salesNavigator pull has no domain to dedupe or enrich on, so
a domain-keyed pipeline sources with `aiArk` or `FullEnrich`. `linkedinId` is carried through
only because the optional contact step needs a LinkedIn company ID
(`company.currentCompanyIds`); it comes from `salesNavigator.searchAccounts`
(`sales_navigator_company_id`) at step 1, or from a domain via
`linkedin.enrichCompanyFromDomain` (0.5, returns `company_id`). Sourcing
that had no LinkedIn anchor (the `peopleDataLabs` path) has no `linkedinId` to
carry, so step 4 falls back to a per-domain title search.

### Step 3 — Enrich firmographics + signals

```bash
# Firmographics — cheapest company enrich in the catalog
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichCompany"}' \
  --records "$(jq -c '[.[] | {domain}]' /tmp/new-companies.json)" \
  --wait-until-finished > /tmp/firmo.json

# Funding signals (only worth running if funding is part of ICP)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"getFunding"}' \
  --records "$(jq -c '[.[] | {domain}]' /tmp/new-companies.json)" \
  --wait-until-finished > /tmp/funding.json

# Tech-stack (only worth running if technographics are part of ICP)
# getDomainSummary is FREE — run it across the whole list first
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"builtwith","actionSlug":"getDomainSummary"}' \
  --records "$(jq -c '[.[] | {domain}]' /tmp/new-companies.json)" \
  --wait-until-finished > /tmp/tech.json
```

Each of those files holds the **batch object**, not rows. The rows are a CSV behind `batch download` (input columns plus each top-level output key as `cargo_<key>`; a search action's array output lands in one `cargo` column as JSON). The steps below read them through this helper:

```bash
rows() {  # rows <file written by execute-batch> → JSON array of CSV rows
  curl -fsSL "$(cargo-ai orchestration batch download --uuid "$(jq -r .batch.uuid "$1")" | jq -r .url)" \
    | python3 -c 'import csv,json,sys; json.dump(list(csv.DictReader(sys.stdin)), sys.stdout)'
}
```

Rows where `aiArk.enrichCompany` came back thin escalate one rung at a time —
`companyEnrich.enrichByDomain` (0.25), then `waterfall.enrichCompany` (1):

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"companyEnrich","actionSlug":"enrichByDomain"}' \
  --records "$(rows /tmp/firmo.json | jq -c '[.[] | select(.cargo_name == "") | {domain}]')" \
  --wait-until-finished > /tmp/firmo-fallback.json
```

### Step 4 — (Optional) Find contacts at each company

Only run if the user asked for contacts. Cap at 3-5 per company.

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads"}' \
  --records "$(jq -c '[.[] | select(.linkedinId) | {domain, company:{currentCompanyIds:[.linkedinId]}, role:{titleKeywords:["CTO","VP Engineering"]}, limit: 5}]' /tmp/new-companies.json)" \
  --wait-until-finished > /tmp/contacts.json
```

`domain` is not a searchLeads input; it rides along so each CSV row still carries it for step 5 (the lead rows have `company_name` but no domain).

### Step 5 — (Optional) Find emails for the contacts

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findEmail"}' \
  --records "$(rows /tmp/contacts.json | jq -c '[.[] | select(.cargo != "") | .domain as $d | (.cargo | fromjson)[] | {firstName: .first_name, lastName: .last_name, domainName: $d}]')" \
  --wait-until-finished > /tmp/emails.json
```

### Step 6 — Verify emails

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"verifyEmail"}' \
  --records "$(rows /tmp/emails.json | jq -c '[.[] | select(.cargo_most_probable_email != "") | {email: .cargo_most_probable_email}]')" \
  --wait-until-finished > /tmp/verified.json
```

### Step 7 — Write to model / export / push to CRM

If a Companies model exists in the workspace, write back via `cargo-ai storage column create` patterns (see [`../../cargo-storage/SKILL.md`](../../cargo-storage/SKILL.md)).

For a CSV export, point the user at `cargo-ai segmentation segment download` (see [`../../cargo-analytics/references/examples/exports.md`](../../cargo-analytics/references/examples/exports.md)).

For CRM push, compose ad hoc with `hubspot.upsertRecords` / `salesforce.upsertRecords` — discover the action via `cargo-ai orchestration action list upsert --integration-slug hubspot`, then read its input schema with `cargo-ai connection integration get hubspot` (or `salesforce`) and run via `orchestration action execute-batch`.

## Credit budget (rough)

For a 500-company TAM with contacts:

| Step | Per record | Records | Subtotal |
|---|---|---|---|
| 1. Source (salesNavigator.searchAccounts) | 0.2 | 500 | 100 |
| 2. Dedupe against the Companies model | 0 | 500 | 0 |
| 3. aiArk.enrichCompany | 0.01 | 500 | 5 |
| 3. enrichCrm.getFunding (optional) | 1 | 500 | 500 |
| 3. builtwith.getDomainSummary (optional) | 0 | 500 | 0 |
| 4. searchLeads (3 contacts each) | 0.2 × 3 | 500 | 300 |
| 5. FullEnrich.findEmail | 1 | 1500 | 1500 |
| 6. waterfall.verifyEmail | 0.1 | 1500 | 150 |

**Total: ~2,555 credits for 500 companies + 1,500 contacts** (~1.7 credits per fully-enriched contact).

Cut steps the user doesn't need (skip step 3 funding/tech if not part of ICP, skip steps 4-6 if no contacts needed) to bring the cost down.

## When to deviate

- User wants local SMBs / storefronts → use `serper.searchPlaces` for sourcing instead of salesNavigator.
- User wants "everyone hiring for X role" → use `theirStack.searchJobs` then dedup to companies.
- User wants investor-backed companies → start with `theirStack.searchCompanies` filtering on `fields.company_investors_partial_match_or` (0.5 per company returned; PDL has no investor field). See [`portfolio-prospecting.md`](portfolio-prospecting.md) for the full pattern.

For these patterns, see [`tech-intent.md`](tech-intent.md) and [`portfolio-prospecting.md`](portfolio-prospecting.md).
