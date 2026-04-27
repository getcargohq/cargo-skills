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
| Industry / size / geo | `salesNavigator.searchAccounts` | 0.05 | LinkedIn-anchored. Default at-scale. |
| Funding stage / investor / round size | `peopleDataLabs.queryCompanies` | 3 | PDL **SQL** string. Required for array-membership filters like `summary.investors LIKE %X%`. |
| Tech stack | `theirStack.searchCompanies` (with techFields) | 0.5 | Tech-stack-driven sourcing. |
| Hiring for role X | `theirStack.searchJobs` | 0.5 | Hiring-intent signal. |
| Local SMBs / storefronts | `serper.searchPlaces` | 1 | Google Maps-style. |
| Already have a domain list | (skip sourcing) | — | Go straight to step 2 (dedup + enrich). |

For combined filters (e.g. fintech in US AND running Snowflake AND hiring data engineers), do parallel queries and intersect client-side.

## Volume / cost guidance

| Target volume | Recommended sourcing path | Estimated credits (sourcing only) |
|---|---|---|
| 100 companies | salesNavigator.searchAccounts | ~5 |
| 500 companies | salesNavigator.searchAccounts | ~25 |
| 1,000 companies | salesNavigator.searchAccounts | ~50 |
| 5,000 companies | salesNavigator.searchAccounts (paginate) | ~250 |
| 10,000 companies | peopleDataLabs.queryCompanies (high-quality, structured) | ~30,000 (3/company) |

For 5,000+ companies, **always sample 50 first** to validate the data quality before paying for the full volume.

## Inputs you need

- ICP criteria (industry, headcount range, geo, revenue band, funding stage, tech-stack signals — one or more).
- Target volume (10? 500? 5000? — drives provider choice).
- Whether contacts are required, and if so, role filter.
- Where the result lives (write to a Companies model? Export to CSV? Push to a CRM?).

If anything is missing, ask the user **once** before sourcing.

## Recipe

### Step 1 — Source companies

Cheapest at scale (≥ 100 companies): `salesNavigator.searchAccounts` (0.05 cred/company).

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchAccounts","config":{}}' \
  --data '{
    "filters": {
      "industries": ["Financial Services"],
      "countries": ["US"],
      "headcountMin": 50,
      "headcountMax": 500
    },
    "limit": 500
  }' \
  --wait-until-finished > /tmp/companies.json
```

Filter mismatch? Fall back to peopleDataLabs. Pick the right action by filter shape:

- **`searchCompanies`** (cargo's `{conjonction, groups, conditions}` filter shape) for simple AND/OR criteria:

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"searchCompanies","config":{}}' \
  --data '{
    "filter": {
      "conjonction": "and",
      "groups": [{
        "conjonction": "and",
        "conditions": [
          {"propertyName": "industry", "operator": "is", "value": "financial services"},
          {"propertyName": "employee_count", "operator": "greaterThanOrEquals", "value": 50},
          {"propertyName": "employee_count", "operator": "lowerThanOrEquals", "value": 500},
          {"propertyName": "location.country", "operator": "is", "value": "united states"}
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
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"queryCompanies","config":{}}' \
  --data '{
    "query": "SELECT * FROM company WHERE industry = '\''financial services'\'' AND employee_count >= 50 AND employee_count <= 500 AND location.country = '\''united states'\''",
    "limit": 500
  }' \
  --wait-until-finished > /tmp/companies.json
```

### Step 2 — Match against cargo's catalog (dedup + warm)

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchBusiness","config":{}}' \
  --records "$(jq -c '[.companies[] | {domain: .website}]' /tmp/companies.json)" \
  --wait-until-finished > /tmp/matched.json
```

Matched rows now have a stable cargo `businessUuid` for downstream enrichment.

### Step 3 — Enrich firmographics + signals

```bash
# Firmographics (cheap, comprehensive)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichBusinessFirmographics","config":{}}' \
  --records "$(jq -c '[.results[] | {businessUuid: .businessUuid}]' /tmp/matched.json)" \
  --wait-until-finished > /tmp/firmo.json

# Funding signals (only worth running if funding is part of ICP)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichBusinessFundingAndAcquisitions","config":{}}' \
  --records "$(jq -c '[.results[] | {businessUuid: .businessUuid}]' /tmp/matched.json)" \
  --wait-until-finished > /tmp/funding.json

# Tech-stack (only worth running if technographics are part of ICP)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichBusinessTechnographics","config":{}}' \
  --records "$(jq -c '[.results[] | {businessUuid: .businessUuid}]' /tmp/matched.json)" \
  --wait-until-finished > /tmp/tech.json
```

If a company didn't match in step 2, fall back to `waterfall.enrichCompany` (1 cred):

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"enrichCompany","config":{}}' \
  --records '<unmatched rows>' \
  --wait-until-finished > /tmp/firmo-fallback.json
```

### Step 4 — (Optional) Find contacts at each company

Only run if the user asked for contacts. Cap at 3-5 per company.

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads","config":{}}' \
  --records "$(jq -c '[.results[] | {filters:{accountId: .linkedinId, titles:[\"CTO\",\"VP Engineering\"]}, limit: 5}]' /tmp/matched.json)" \
  --wait-until-finished > /tmp/contacts.json
```

### Step 5 — (Optional) Find emails for the contacts

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findEmail","config":{}}' \
  --records "$(jq -c '[.contacts[] | {firstName:.firstName, lastName:.lastName, companyDomain:.companyDomain}]' /tmp/contacts.json)" \
  --wait-until-finished > /tmp/emails.json
```

### Step 6 — Verify emails

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"verifyEmail","config":{}}' \
  --records "$(jq -c '[.results[] | {email: .email}]' /tmp/emails.json)" \
  --wait-until-finished > /tmp/verified.json
```

### Step 7 — Write to model / export / push to CRM

If a Companies model exists in the workspace, write back via `cargo-ai storage column create` patterns (see [`../../cargo-storage/SKILL.md`](../../cargo-storage/SKILL.md)).

For a CSV export, point the user at `cargo-ai segmentation segment download` (see [`../../cargo-analytics/references/examples/exports.md`](../../cargo-analytics/references/examples/exports.md)).

For CRM push, compose ad hoc with `hubspot.upsertRecords` / `salesforce.upsert` — discover the action via `cargo-ai connection integration get hubspot` (or `salesforce`) and run via `orchestration action execute-batch`.

## Credit budget (rough)

For a 500-company TAM with contacts:

| Step | Per record | Records | Subtotal |
|---|---|---|---|
| 1. Source (salesNavigator.searchAccounts) | 0.05 | 500 | 25 |
| 2. matchBusiness | 0.5 | 500 | 250 |
| 3. enrichBusinessFirmographics | 0.5 | 500 | 250 |
| 3. enrichBusinessFundingAndAcquisitions (optional) | 0.5 | 500 | 250 |
| 3. enrichBusinessTechnographics (optional) | 1 | 500 | 500 |
| 4. searchLeads (3 contacts each) | 0.02 × 3 | 500 | 30 |
| 5. FullEnrich.findEmail | 1 | 1500 | 1500 |
| 6. waterfall.verifyEmail | 0.1 | 1500 | 150 |

**Total: ~2,955 credits for 500 companies + 1,500 contacts** (~6 credits per fully-enriched contact).

Cut steps the user doesn't need (skip step 3 funding/tech if not part of ICP, skip steps 4-6 if no contacts needed) to bring the cost down.

## When to deviate

- User wants local SMBs / storefronts → use `serper.searchPlaces` for sourcing instead of salesNavigator.
- User wants "everyone hiring for X role" → use `theirStack.searchJobs` then dedup to companies.
- User wants investor-backed companies → start with `peopleDataLabs.queryCompanies` (PDL SQL) filtering on `summary.investors LIKE %X%`. See [`portfolio-prospecting.md`](portfolio-prospecting.md) for the full pattern.

For these patterns, see [`tech-intent.md`](tech-intent.md) and [`portfolio-prospecting.md`](portfolio-prospecting.md).
