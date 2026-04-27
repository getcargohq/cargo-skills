---
provider: peopleDataLabs
category: enrichment (heavyweight backfill + structured search)
last-reviewed: 2026-04-27
---

# peopleDataLabs (People Data Labs)

Heavyweight people / company database with ES-style structured queries. **Six credits-based actions, all flat 3 credits each.** Use as **backfill** when cheaper sources miss, or as the **primary** source when you need structured query power that salesNavigator's filters can't express.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `searchPeople` | 3 | `filter, limit, pretty, titlecase` | Search people with simple filters (role, company, location, …). |
| `searchCompanies` | 3 | `filter, limit, pretty, titlecase` | Search companies with simple filters. |
| `queryPeople` | 3 | `query, limit, pretty, titlecase` | Search people with **ES-style structured query** (`bool.must`, `bool.should`, `range`, `term`, …). |
| `queryCompanies` | 3 | `query, limit, pretty, titlecase` | Search companies with ES-style structured query. **Best for investor / funding / complex-filter sourcing.** |
| `enrichPerson` | 3 | `parameters, options` | Fill missing person fields. Default backfill when cargo + waterfall miss. |
| `enrichCompany` | 3 | `parameters, options` | Fill missing company fields. Default backfill when cargo + waterfall miss. |

## When to use peopleDataLabs (vs the alternatives)

- ✅ **Investor / funding / VC-portfolio sourcing**: `queryCompanies` with `funding_rounds.investors.name` filter — salesNavigator can't express this.
- ✅ **Complex multi-axis filters** that salesNavigator's UI-style filters can't combine: e.g., "fintech in EMEA AND Series B+ AND > 100 engineers AND has at least one Snowflake user".
- ✅ **Heavyweight backfill**: after `cargo.enrichPerson/Company` and `waterfall.enrich*` both return empty, peopleDataLabs is the deepest source in the catalog.
- ❌ **Cheap at-scale sourcing**: 3 cred is 60–150× more expensive than salesNavigator (0.02–0.05). Don't default here for volume work.

## Patterns

### Pattern A — Investor portfolio sourcing (queryCompanies)

```bash
# "Find every company backed by Sequoia, USA, 50-500 employees"
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"queryCompanies","config":{}}' \
  --data '{
    "query": {
      "bool": {
        "must": [
          {"term": {"funding_rounds.investors.name": "Sequoia Capital"}},
          {"range": {"employee_count": {"gte": 50, "lte": 500}}},
          {"term": {"location_country": "united states"}}
        ]
      }
    },
    "limit": 200
  }' \
  --wait-until-finished
```

The ES-style query language is documented at PDL — common fields: `industry`, `employee_count`, `founded`, `funding_total`, `funding_rounds.investors.name`, `location_country`, `location_locality`, `tags`.

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

### Pattern C — Structured people search

```bash
# "Find Heads of Engineering at Series A-B fintechs in NYC"
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"queryPeople","config":{}}' \
  --data '{
    "query": {
      "bool": {
        "must": [
          {"match": {"job_title": "head of engineering"}},
          {"term": {"job_company_industry": "financial services"}},
          {"term": {"location_locality": "new york"}},
          {"range": {"job_company_size": {"gte": 50, "lte": 500}}}
        ]
      }
    },
    "limit": 100
  }' \
  --wait-until-finished
```

## Common pitfalls

- **3 credits adds up fast.** 1,000 enriches = 3,000 credits. Always run cargo + waterfall first; only escalate the ~20-30% of rows that those miss.
- **`searchPeople` vs `queryPeople`** — `searchPeople` uses simple `filter` syntax (key/value), `queryPeople` uses ES-style. They cost the same. Use `queryPeople` when you need range / boolean / nested filters.
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
