---
provider: salesNavigator
category: enrichment (sourcing-leaning)
last-reviewed: 2026-09-22
---

# salesNavigator (Sales Navigator)

LinkedIn-anchored search for accounts and leads — `searchLeads` and `searchAccounts` both at 0.2 credits/record. Default when the list is defined by LinkedIn-native filters (title, function, seniority, headcount, industry, geo). Not the cheapest search in the catalog: `FullEnrich.searchPeople` / `searchCompanies` are free, and `aiArk.searchCompanies` (0.01) and `aiArk.searchPeople` (0.05) undercut it too, when their filters fit.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `searchLeads` | 0.2 | `keywords, company, role, personal, recentUpdates, identityIds, limit` | At-scale lead search by company / title / keywords. **Default LinkedIn-native people sourcing.** |
| `searchAccounts` | 0.2 | `companyHeadcounts, headquarterLocationIds, industryCodes, numOfFollowers, …` | At-scale account search by industry / size / geo. **Default LinkedIn-native company sourcing.** |
| `extractLeadSearch` | 0.2 | `url, identityIds, limit` | Extract leads from a saved Sales Navigator search URL. |
| `extractAccountSearch` | 0.2 | `url, identityIds, limit` | Extract accounts from a saved Sales Navigator search URL. |
| `findCompanyInsights` | 0.25 | `companyId` | Pull insights about a known LinkedIn company. |
| `findCompanyMetrics` | 0.25 | `companyId, parameters` | Pull metrics about a known LinkedIn company. |
| `findEmployeesCount` | 0.25 | `companyId` | Get employee count snapshot. |
| `findEmployeesDistribution` | 0.25 | `companyId` | Get employee role/department distribution. |
| `searchLeadsLegacy` | **6** | (deprecated) | **Avoid.** 30× more expensive than `searchLeads`. Only use if `searchLeads` is missing a filter you need (rarely). |

## What it's for

- **Default sourcing path** for anything LinkedIn-shaped (industry, headcount, role, geo, posted updates).
- **Volume**: a 5,000-company TAM costs ~1,000 credits (`aiArk.searchCompanies` does it for ~50 when its filters fit).
- **LinkedIn IDs**: returned account/lead IDs slot directly into other LinkedIn-aware actions (`linkedin.enrichCompany`, `theSwarm.searchWarmIntros…`, downstream LinkedIn-anchored find/enrich).

## Common pitfalls

- **Don't use `searchLeadsLegacy`** unless `searchLeads` literally cannot express your filter. The cost difference is enormous.
- **`identityIds` filter** scopes the search to specific LinkedIn member identities. Useful for "find leads currently or recently at company X" — combine with `company` filter.
- **`recentUpdates: true`** narrows to leads who posted recently, useful for warm-outreach signal but reduces volume.
- **Pagination**: results are paginated. `limit` caps a single call; for large pulls, iterate with the cursor returned in the response.

## Anti-patterns

- **String filter values where LinkedIn codes are required.** `industryCodes`, `headquarterLocationIds`, `companyHeadcounts`, and `role.function`/`role.seniority` take LinkedIn's **internal enums/IDs** (`[43]`, `["B","C","D"]`, `[103644278]`), not names like `"fintech"` or `"50-200"`. Passing strings fails or silently mismatches — inspect the autocomplete schema via `connection integration get salesNavigator` first.
- **Pulling the full volume to "see what's there."** Search is billed per **returned** record. Size the pool with `limit: 1` (the response's total match count is free beyond that one row), decide the filter, then pull exactly the approved scope — see [`../references/cost-discipline.md`](../references/cost-discipline.md).
- **`searchLeadsLegacy` as a shortcut** — 30× the cost of `searchLeads` for marginal filter gains.

## Position in the waterfall

**First rung for LinkedIn-shaped sourcing** at 0.2/record. When the filter fits `aiArk` (lookalike seeds, education, skills, tenure, past company), start there instead: 0.01/company and 0.05/person. Demote for a batch only when the pilot shows its LinkedIn-shaped coverage misses your segment (local SMBs → `serper.searchPlaces`; tech-stack-first → `theirStack`; funding/investor filters → `peopleDataLabs.queryCompanies`).

## Sample payloads

### Account search — 100 fintech companies in US, 50–500 headcount

```json
{
  "kind": "connector",
  "integrationSlug": "salesNavigator",
  "actionSlug": "searchAccounts"
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

## Recurring use

- **Scheduled pull:** the weekly saved persona search is the canonical recurring source — re-run `searchLeads` / `extractLeadSearch` (same saved URL) on the weekly persona-search default; new matches accumulate slowly, so tighter cadences mostly return rows you already have. Cadence table: [`../recipes/save-as-play.md`](../recipes/save-as-play.md).
- **Dedup gate:** search bills per **returned** record with no memory of prior pulls — dedup returned lead/account IDs against the model so only net-new rows flow to paid downstream nodes (find-email, enrich, verify).
- **Stable snapshots:** `findEmployeesCount` / `findCompanyInsights` (0.25) drift over quarters, not weeks — refresh them on tracked accounts rarely and deliberately, never inside the weekly search play.
