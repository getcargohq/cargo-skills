---
provider: proxycurl
category: enrichment
last-reviewed: 2026-07-09
---

# proxycurl

Generalist LinkedIn-data enrichment and search behind a single **`objectType` discriminator** — person, company, job, or role — everything at 1 credit. Not in the priority stack: reach for it when `salesNavigator` can't express your filter (education, past roles, funding ranges, follower counts) and the criteria don't yet justify `peopleDataLabs` (3). Skip it when a LinkedIn URL is already in hand — `linkedin.enrichProfile` / `linkedin.enrichCompany` (0.25) cover that for a quarter of the price.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrich` | 1 | `objectType` + `filters` (name/value pairs); `objectType: "job"` takes `url` | Resolve one person / company / role-holder / job from identifying filters. |
| `search` | 1 **per returned record** | `objectType` + `filters` + `limit` | Filter-rich person / company / job search. |

Both actions share one shape: `objectType` picks the entity, `filters` is an **array of `{name, value}` objects** (not a flat key/value map).

## What it's for

- ✅ **Filter-rich people search** — `search` (person) filters include education (`education_school_name`, `education_degree_name`), past roles (`past_role_title`, `past_company_name`), tenure windows (`current_role_before` / `current_role_after`), `skills`, `languages`, `headline`, and current-company firmographics (employee/follower counts, `current_company_funding_amount_min/max`, `current_company_funded_after/before`-style ranges).
- ✅ **Company search with funding filters** — founded-year, employee-count, follower-count, and funding-amount/date ranges at 1/record vs `peopleDataLabs.queryCompanies` (3).
- ✅ **Role-based resolution** — `enrich` with `objectType: "role"` takes `role` + `company_name` filters: "find the Head of Sales at Acme" in one call.
- ❌ **At-scale generic sourcing** — `salesNavigator.searchLeads` (0.02) / `searchAccounts` (0.05) are 20–50× cheaper for industry/size/geo filters.
- ❌ **URL-in-hand enrichment** — `linkedin.enrichProfile` (0.25) beats `enrich` when you already have the LinkedIn URL.

## Patterns

### Pattern A — Resolve a role-holder at a known company

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"proxycurl","actionSlug":"enrich","config":{}}' \
  --records '[{"objectType":"role","filters":[{"name":"role","value":"Head of Sales"},{"name":"company_name","value":"Acme"}]}]' \
  --wait-until-finished
```

Per `objectType`, `enrich` accepts different filter names — person: `company_domain, first_name, last_name, location, title`; company: `company_domain, company_name` (+ `company_location` via `autocompleteValue`); role: `role, company_name`; job: a `url` field instead of filters.

### Pattern B — Person search on filters salesNavigator can't express

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"proxycurl","actionSlug":"search","config":{}}' \
  --data '{
    "objectType": "person",
    "filters": [
      {"name": "current_role_title", "value": "CTO"},
      {"name": "past_company_name", "value": "Acme"},
      {"name": "current_company_employee_count_max", "value": "200"},
      {"name": "country", "autocompleteValue": "US"}
    ],
    "limit": 50
  }' \
  --wait-until-finished
```

Billed per returned record — **always set `limit`**. Exclusion lists use `values`: `{"name":"public_identifier_not_in_list","values":["alice-smith-123", ...]}` (also available as `public_identifier_in_list`) — useful for deduping against contacts you already have.

## Common pitfalls

- **`value` vs `autocompleteValue`.** Enum-backed filters — person: `country, current_company_country, current_company_industry, current_company_type`; company: `country, type, industry`; job: `job_type, experience_level, when, flexibility` — require `autocompleteValue`; free-text filters require `value`. Mixing them up fails the call.
- **`search` bills per item.** `limit` is your budget cap; size the pool first per [`../references/cost-discipline.md`](../references/cost-discipline.md).
- **Filters are an array**, not an object — `"filters": [{"name": ..., "value": ...}]`. A `{title: "CTO"}` map shape silently expresses nothing.
- **Numeric ranges are string values** — `current_company_employee_count_min/max`, `funding_amount_min/max`, `founded_after_year/before_year` all take their number as a string `value`.
- **Rate limit: 300 calls/minute** (spread).

## Position in the waterfall

- **SOURCE — escalation rung** between salesNavigator (0.02–0.05) and peopleDataLabs (3): use when the filter needs education / past-role / funding criteria; see [`../references/stage-action-map.md`](../references/stage-action-map.md).
- **ENRICH — niche rung**: role-based resolution and job-URL enrichment; for plain person/company enrichment prefer `linkedin.*` (0.25) or the priority stack (`cargo` → `waterfall`).
- Found people still flow through CONTACT (`FullEnrich.findEmail`, 1) and VERIFY (`waterfall.verifyEmail`, 0.1).

## Action shape

`{"kind":"connector","integrationSlug":"proxycurl","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
