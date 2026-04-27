---
provider: salesNavigator
category: enrichment (sourcing-leaning)
last-reviewed: 2026-04-27
---

# salesNavigator (Sales Navigator)

LinkedIn-anchored search for accounts and leads. **Cheapest sourcing in the cargo catalog** — `searchLeads` at 0.02 credits/record and `searchAccounts` at 0.05 credits/record. Default for any at-scale list-building.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `searchLeads` | 0.02 | `keywords, company, role, personal, recentUpdates, identityIds, limit` | At-scale lead search by company / title / keywords. **Cheapest at-scale people sourcing in catalog.** |
| `searchAccounts` | 0.05 | `companyHeadcounts, headquarterLocationIds, industryCodes, numOfFollowers, …` | At-scale account search by industry / size / geo. **Cheapest at-scale company sourcing in catalog.** |
| `extractLeadSearch` | 0.02 | `url, identityIds, limit` | Extract leads from a saved Sales Navigator search URL. |
| `extractAccountSearch` | 0.05 | `url, identityIds, limit` | Extract accounts from a saved Sales Navigator search URL. |
| `findCompanyInsights` | 0.25 | `companyId` | Pull insights about a known LinkedIn company. |
| `findCompanyMetrics` | 0.25 | `companyId, parameters` | Pull metrics about a known LinkedIn company. |
| `findEmployeesCount` | 0.25 | `companyId` | Get employee count snapshot. |
| `findEmployeesDistribution` | 0.25 | `companyId` | Get employee role/department distribution. |
| `searchLeadsLegacy` | **6** | (deprecated) | **Avoid.** 300× more expensive than `searchLeads`. Only use if `searchLeads` is missing a filter you need (rarely). |

## What it's for

- **Default sourcing path** for anything LinkedIn-shaped (industry, headcount, role, geo, posted updates).
- **Cheap volume**: build a 5,000-company TAM for ~250 credits.
- **LinkedIn IDs**: returned account/lead IDs slot directly into other LinkedIn-aware actions (cargo `enrichBusinessLinkedinPosts`, `theSwarm.searchWarmIntros…`, downstream LinkedIn-anchored find/enrich).

## Common pitfalls

- **Don't use `searchLeadsLegacy`** unless `searchLeads` literally cannot express your filter. The cost difference is enormous.
- **`identityIds` filter** scopes the search to specific LinkedIn member identities. Useful for "find leads currently or recently at company X" — combine with `company` filter.
- **`recentUpdates: true`** narrows to leads who posted recently, useful for warm-outreach signal but reduces volume.
- **Pagination**: results are paginated. `limit` caps a single call; for large pulls, iterate with the cursor returned in the response.

## Sample payloads

### Account search — 100 fintech companies in US, 50–500 headcount

```json
{
  "kind": "connector",
  "integrationSlug": "salesNavigator",
  "actionSlug": "searchAccounts",
  "config": {}
}
```

Per-record `--data`:

```json
{
  "companyHeadcounts": ["B", "C", "D"],
  "industryCodes": [43],
  "headquarterLocationIds": [103644278],
  "limit": 100
}
```

(Headcount enums and industry/location IDs are LinkedIn's internal codes — use `connection integration get salesNavigator` to inspect the autocomplete schema.)

### Lead search — CTOs at a known account

```json
{
  "company": ["acme-inc"],
  "role": {"function": [13], "seniority": [5, 7]},
  "limit": 5
}
```

### Extract from a saved search URL

```json
{
  "url": "https://www.linkedin.com/sales/search/people?savedSearchId=…",
  "limit": 1000
}
```

## Fallback chain

If `salesNavigator.searchAccounts` doesn't have your filter (e.g., you need to filter by investor or funding round → not in salesNavigator), escalate to `peopleDataLabs.queryCompanies` (3 credits, PDL **SQL** query). Never escalate to `searchLeadsLegacy`.

For people search niches salesNavigator misses:
- **Local SMBs**: `serper.searchPlaces` (Google Maps).
- **Tech-stack-driven**: `theirStack.searchCompanies`.
- **Very specific role + industry combos with low LinkedIn coverage**: `peopleDataLabs.searchPeople`.
