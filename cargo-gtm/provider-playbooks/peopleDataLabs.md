---
provider: peopleDataLabs
category: enrichment (heavyweight backfill + structured search)
last-reviewed: 2026-04-27
---

# peopleDataLabs (People Data Labs)

Heavyweight people / company database. **Six credits-based actions, all flat 3 credits each.** Use as **backfill** when cheaper sources miss, or as the **primary** source when you need query power salesNavigator's filters can't express.

Two filter shapes — pick the right one:

- **`searchPeople` / `searchCompanies`** use cargo's standard segment-filter shape: `{filter: {conjonction, groups: [{conjonction, conditions: [{propertyName, operator, value}, ...]}]}}`. Operators: `is`, `isNot`, `contains`, `notContains`, `lowerThan`, `lowerThanOrEquals`, `greaterThan`, `greaterThanOrEquals`. Use when criteria are simple key/operator/value AND/OR combinations.
- **`queryPeople` / `queryCompanies`** take a **SQL string** — PDL's SQL API. Use when you need joins, OR-of-AND combinations beyond what the cargo filter shape supports cleanly, or when you already have a SQL query from PDL's documentation. **NOT Elasticsearch — it's PDL SQL.**

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `searchPeople` | 3 | `filter, limit, pretty, titlecase` | People search with cargo's `{conjonction, groups, conditions}` filter shape. |
| `searchCompanies` | 3 | `filter, limit, pretty, titlecase` | Company search with the same cargo filter shape. |
| `queryPeople` | 3 | `query: <SQL string>, limit, pretty, titlecase` | People search via PDL **SQL** query. Required for joins / complex bool combinations. |
| `queryCompanies` | 3 | `query: <SQL string>, limit, pretty, titlecase` | Company search via PDL **SQL** query. Best for investor / funding / complex-filter sourcing. |
| `enrichPerson` | 3 | `parameters, options` | Fill missing person fields. Default backfill when cargo + waterfall miss. |
| `enrichCompany` | 3 | `parameters, options` | Fill missing company fields. Default backfill when cargo + waterfall miss. |

## When to use peopleDataLabs (vs the alternatives)

- ✅ **Investor / funding / VC-portfolio sourcing**: `queryCompanies` SQL with a `WHERE` clause on PDL's investor / funding fields — salesNavigator can't express this.
- ✅ **Complex multi-axis filters** that salesNavigator's UI-style filters can't combine: e.g., "fintech in EMEA AND Series B+ AND > 100 engineers AND running Snowflake".
- ✅ **Heavyweight backfill**: after `cargo.enrichPerson/Company` and `waterfall.enrich*` both return empty, peopleDataLabs is the deepest source in the catalog.
- ❌ **Cheap at-scale sourcing**: 3 cred is 60–150× more expensive than salesNavigator (0.02–0.05). Don't default here for volume work.

## Patterns

### Pattern A — Investor portfolio sourcing (queryCompanies, SQL)

`queryCompanies` accepts a SQL string (PDL's SQL API). Use it when criteria don't fit cargo's `{conjonction, groups, conditions}` shape — typically anything involving array containment (e.g., "investors includes X") or complex OR-of-AND combinations.

```bash
# "Find every company backed by Sequoia Capital, USA, 50-500 employees"
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"queryCompanies","config":{}}' \
  --data '{
    "query": "SELECT * FROM company WHERE summary.investors LIKE %Sequoia Capital% AND employee_count >= 50 AND employee_count <= 500 AND location.country = '\''united states'\''",
    "limit": 200
  }' \
  --wait-until-finished
```

Common PDL SQL fields: `industry`, `employee_count`, `founded`, `total_funding_raised`, `summary.investors`, `location.country`, `location.locality`, `tags`. See PDL's SQL reference for the full schema; cargo passes the SQL through verbatim.

### Pattern B — Backfill missing person details

After cargo + waterfall both return empty for a row:

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"enrichPerson","config":{}}' \
  --records '[
    {"parameters":{"email":"alice@acme.com"}},
    {"parameters":{"linkedin":"linkedin.com/in/alicesmith"}},
    {"parameters":{"first_name":"Alice","last_name":"Smith","company":"Acme"}}
  ]' \
  --wait-until-finished
```

`parameters` accepts any combination — `email`, `linkedin`, `phone`, `first_name + last_name + company`, `first_name + last_name + location`, etc. More identifiers = higher hit rate.

### Pattern C — Structured people search via cargo's filter shape

For criteria that fit cargo's standard filter shape (key/operator/value AND/OR), prefer `searchPeople` over `queryPeople`:

```bash
# "Find Heads of Engineering at fintechs in NYC, 50-500 employees"
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"searchPeople","config":{}}' \
  --data '{
    "filter": {
      "conjonction": "and",
      "groups": [{
        "conjonction": "and",
        "conditions": [
          {"propertyName": "job_title", "operator": "contains", "value": "head of engineering"},
          {"propertyName": "job_company_industry", "operator": "is", "value": "financial services"},
          {"propertyName": "location_locality", "operator": "is", "value": "new york"},
          {"propertyName": "job_company_size", "operator": "greaterThanOrEquals", "value": 50},
          {"propertyName": "job_company_size", "operator": "lowerThanOrEquals", "value": 500}
        ]
      }]
    },
    "limit": 100
  }' \
  --wait-until-finished
```

**Note the spelling**: `conjonction` (with two `o`s, no `u`) — same intentional cargo-platform-wide convention. Typo here fails silently with empty results.

If cargo's filter shape can't express the criteria (e.g., array-membership filters like `summary.investors LIKE %X%`), drop down to `queryPeople` SQL.

## Common pitfalls

- **3 credits adds up fast.** 1,000 enriches = 3,000 credits. Always run cargo + waterfall first; only escalate the ~20-30% of rows that those miss.
- **`searchPeople` vs `queryPeople`** — both cost 3 credits; pick by filter shape. `searchPeople` accepts cargo's `{conjonction, groups, conditions}` (good for simple AND/OR criteria). `queryPeople` accepts a PDL **SQL string** (good for array-membership, joins, complex bool). Default to `searchPeople`; drop down to `queryPeople` only when SQL is required.
- **`titlecase: true`** normalizes name capitalization in the response. Default is true; rarely worth disabling.
- **`pretty: true`** formats JSON for readability. Disable in production calls — adds bytes without value.
- **Multi-axis matches dilute precision.** Adding a 5th filter can reduce result quality (PDL's matching is forgiving when it has to be). Sample 10 results before fanning out.

## Action shape

`{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**

## Where peopleDataLabs sits in the spine

- Step 1 (SOURCE): only when salesNavigator's filters miss your criteria (e.g., funding-round filter).
- Steps 3–4 (ENRICH / SIGNAL): fallback after cargo + waterfall return empty.
- Step 7 (BACKFILL): canonical last-resort for missing emails / details.

Never the first stop unless the filter shape demands it.
