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
| `searchLeads` | 0.2 | `keywords, company, role, personal, recentUpdates, identityIds, limit` (`company`, `role`, `personal`, `recentUpdates` are objects) | At-scale lead search by company / title / keywords. **Default LinkedIn-native people sourcing.** |
| `searchAccounts` | 0.2 | `companyHeadcounts, headquarterLocationIds, industryCodes, numOfFollowers, …` | At-scale account search by industry / size / geo. **Default LinkedIn-native company sourcing.** |
| `extractLeadSearch` | 0.2 | `url, identityIds, limit` | Extract leads from a saved Sales Navigator search URL. |
| `extractAccountSearch` | 0.2 | `url, identityIds, limit` | Extract accounts from a saved Sales Navigator search URL. |
| `findCompanyInsights` | 0.25 | `companyId` | Pull insights about a known LinkedIn company. |
| `findCompanyMetrics` | 0.25 | `companyId, parameters` | Pull metrics about a known LinkedIn company. |
| `findEmployeesCount` | 0.25 | `companyId` | Get employee count snapshot. |
| `findEmployeesDistribution` | 0.25 | `companyId` | Get employee role/department distribution. |
| `searchCompanyMetrics` | 0.25 | `url, identityIds` | Total result count (`total_results`) for a Sales Navigator company search URL, exact above the 1,000-per-search extraction cap. Count before you extract. |
| `searchPersonMetrics` | 0.25 | `url, identityIds` | Total result count (`total_leads`) for a Sales Navigator people search URL, exact above the 2,500-per-search extraction cap. Count before you extract. |
| `searchLeadsLegacy` | **6** | (deprecated) | **Avoid.** 30× more expensive than `searchLeads`. Only use if `searchLeads` is missing a filter you need (rarely). |

## What it's for

- **Default sourcing path** for anything LinkedIn-shaped (industry, headcount, role, geo, posted updates).
- **Volume**: a 5,000-company TAM costs ~1,000 credits (`aiArk.searchCompanies` does it for ~50 when its filters fit).
- **LinkedIn IDs**: returned account/lead IDs slot directly into other LinkedIn-aware actions (`linkedin.enrichCompany`, `theSwarm.searchWarmIntros…`, downstream LinkedIn-anchored find/enrich).

## Common pitfalls

- **Don't use `searchLeadsLegacy`** unless `searchLeads` literally cannot express your filter. The cost difference is enormous.
- **`identityIds` is not a filter.** It picks which connected LinkedIn seat(s) run the search. To find leads at company X, use `company.currentCompanyIds` (or `pastCompanyIds`) with LinkedIn company IDs as strings.
- **`recentUpdates` is an object**: `{"postedOnLinkedin": true}` narrows to leads who posted recently (also `changedJobs`, `mentionedInNews`), useful for warm-outreach signal but reduces volume.
- **Pagination is internal.** The action pages through results itself until it reaches `limit` (default 25; max 10,000 for `searchLeads`, 5,000 for `searchAccounts`). There is no cursor to iterate.

## Anti-patterns

- **Names where LinkedIn codes are required.** `industryCodes`, `headquarterLocationIds`, `companyHeadcounts`, and `role.functions`/`role.seniorityLevels` take LinkedIn's **internal codes, as strings**: `industryCodes: ["43"]` (Financial Services), `headquarterLocationIds: ["103644278"]` (United States), `companyHeadcounts: ["D","E"]` (51-200, 201-500; `B` is 1-10, `C` 11-50), `role.seniorityLevels: ["310"]` (CXO). Names like `"fintech"` or `"50-200"` silently match nothing, and bare numbers fail validation. Resolve a name to its code with `cargo-ai connection connector autocomplete --connector-uuid <uuid> --slug listIndustries --params '{}' --value fintech` (`listGeoCodes` for locations).
- **Pulling the full volume to "see what's there."** Search is billed per **returned** record, and the search response carries the records only, not a total match count. To size the market first, run `searchCompanyMetrics` or `searchPersonMetrics` on the search URL (0.25 credits, exact total). Then pull a small `limit` first, check the rows fit, decide the filter, then pull exactly the approved scope — see [`../references/cost-discipline.md`](../references/cost-discipline.md).
- **`searchLeadsLegacy` as a shortcut** — 30× the cost of `searchLeads` for marginal filter gains.

## Position in the waterfall

**First rung for LinkedIn-shaped sourcing** at 0.2/record. When the filter fits `aiArk` (lookalike seeds, education, skills, tenure, past company), start there instead: 0.01/company and 0.05/person. Demote for a batch only when the pilot shows its LinkedIn-shaped coverage misses your segment (local SMBs → `serper.searchPlaces`; tech-stack-first, funding or investor filters → `theirStack.searchCompanies`).

## Sample payloads

### Account search — 100 financial services companies in US, 51–500 headcount

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
  "companyHeadcounts": ["D", "E"],
  "industryCodes": ["43"],
  "headquarterLocationIds": ["103644278"],
  "limit": 100
}
```

(Headcount enums and industry/location IDs are LinkedIn's internal codes, passed as strings. Resolve them with the `listIndustries` / `listGeoCodes` autocompletes above.)

### Lead search — CTOs at a known account

```json
{
  "company": {"currentCompanyIds": ["<linkedin company id>"]},
  "role": {"functions": ["8", "13"], "seniorityLevels": ["310"]},
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

If `salesNavigator.searchAccounts` doesn't have your filter (e.g., you need to filter by investor or funding round → not in salesNavigator), escalate to `theirStack.searchCompanies` (`company_investors_partial_match_or`, `funding_stage_or`, `min_funding_usd`; 0.5 per company). PDL has no investor field. Never escalate to `searchLeadsLegacy`.

For people search niches salesNavigator misses:
- **Local SMBs**: `serper.searchPlaces` (Google Maps).
- **Tech-stack-driven**: `theirStack.searchCompanies`.
- **Very specific role + industry combos with low LinkedIn coverage**: `peopleDataLabs.searchPeople`.

## Recurring use

- **Scheduled pull:** the weekly saved persona search is the canonical recurring source — re-run `searchLeads` / `extractLeadSearch` (same saved URL) on the weekly persona-search default; new matches accumulate slowly, so tighter cadences mostly return rows you already have. Cadence table: [`../recipes/save-as-play.md`](../recipes/save-as-play.md).
- **Dedup gate:** search bills per **returned** record with no memory of prior pulls — dedup returned lead/account IDs against the model so only net-new rows flow to paid downstream nodes (find-email, enrich, verify).
- **Stable snapshots:** `findEmployeesCount` / `findCompanyInsights` (0.25) drift over quarters, not weeks — refresh them on tracked accounts rarely and deliberately, never inside the weekly search play.
