---
provider: oceanio
category: sourcing (lookalikes)
last-reviewed: 2026-07-09
---

# oceanio (Ocean.io)

Mid-tier company/people search and enrichment — four actions, all 1 credit. Its edge is **lookalike sourcing** (`searchCompanies` with `lookalikeDomains`: "companies like these three customers") plus technographic / web-traffic / e-commerce filters, and **cross-filtered search** (people filters and company filters combined in one call). Not in the priority stack: `salesNavigator` (0.02–0.05) stays the sourcing default; come here when the filter is lookalike- or technographic-shaped, before escalating to `peopleDataLabs` (3). See [`../references/stage-action-map.md`](../references/stage-action-map.md) (mid-tier rows).

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `searchCompanies` | 1 **per returned record** | `companiesFilters`, `peopleFilters`, `limit` | Company search: lookalikes, technographics, web traffic, revenue, e-commerce flags. |
| `searchPeople` | 1 | `peopleFilters`, `companiesFilters`, `limit` | People search cross-filtered by their company's attributes. |
| `enrichCompany` | 1 | `company` object (`domain, name, linkedin, email, phone, countryCode, city, address, …` + socials) | Company enrichment from weak identifiers. |
| `enrichPerson` | 1 | `person` object (`email, linkedin, firstName, lastName, jobTitle, phone, …`) + `company` object | Person enrichment; company context improves matching. |

## What it's for

- ✅ **Lookalike TAM** — `companiesFilters.lookalikeDomains` seeds a search from best-customer domains; no priority-stack action does this.
- ✅ **Technographic + traffic filters** — `technologies`, `webTrafficVisitsFrom/To`, `ecommerce`, `mobileAppsFrom/To`, `revenues`, `companySizes` in one filter object (vs `theirStack` for job-posting-derived tech intent).
- ✅ **"People at companies like X"** — `searchPeople` accepts both filter objects: `peopleFilters` (`jobTitles`, `seniorities`, `departments`, `emailStatuses`, `keywords`, `countries`, …) AND `companiesFilters` in the same call.
- ✅ **Dedupe-aware sourcing** — `includeDomains` / `excludeDomains` (companies) and `includeIds` / `excludeIds`, `excludeJobTitles` (people) keep already-owned records out of the paid pull.
- ❌ **Plain industry/size/geo sourcing** — `salesNavigator.searchAccounts` (0.05) is 20× cheaper.
- ❌ **First-stop enrichment** — the ENRICH chain leads with `cargo` native and `linkedin` (0.25); oceanio is a same-price peer of `waterfall.enrichCompany` (1), so pick by pilot coverage.

## Patterns

### Pattern A — Lookalike company sourcing

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"oceanio","actionSlug":"searchCompanies","config":{}}' \
  --data '{
    "companiesFilters": {
      "lookalikeDomains": ["acme.com", "globex.com", "initech.com"],
      "countries": ["US"],
      "companySizes": ["11-50", "51-200"],
      "excludeDomains": ["bigco.com"]
    },
    "limit": 100
  }' \
  --wait-until-finished
```

Billed per returned record — set `limit` to the approved scope ([`../references/cost-discipline.md`](../references/cost-discipline.md)).

### Pattern B — People at companies matching a technographic filter

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"oceanio","actionSlug":"searchPeople","config":{}}' \
  --data '{
    "peopleFilters": {"jobTitles": ["VP Marketing", "CMO"], "seniorities": ["vp", "c_suite"]},
    "companiesFilters": {"technologies": ["shopify"], "countries": ["US"]},
    "limit": 50
  }' \
  --wait-until-finished
```

Enum values in both examples (`companySizes`, `seniorities`, `technologies`, …) are **illustrative** — fetch the real accepted values from the `listObjectFieldValues` autocomplete before building the filter (see pitfalls).

### Pattern C — Enrichment from weak identifiers

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"oceanio","actionSlug":"enrichPerson","config":{}}' \
  --records '[
    {"person":{"firstName":"Alice","lastName":"Smith","jobTitle":"CTO"},"company":{"domain":"acme.com"}},
    {"person":{"linkedin":"https://linkedin.com/in/bobjones"}}
  ]' \
  --wait-until-finished
```

`enrichCompany` mirrors this: identifiers nest under a `company` object (plus an optional `people` array for known contacts) — accepts `domain`, `name`, `linkedin`, socials, a registration number, or a postal address, which makes it useful when domain-only enrichers miss.

## Common pitfalls

- **Inputs are nested objects.** Filters go inside `peopleFilters` / `companiesFilters`; enrich identifiers inside `person` / `company`. Flat top-level fields express nothing.
- **Filter values are opaque enums.** `companySizes`, `revenues`, `seniorities`, `departments`, `emailStatuses`, `industries`, `technologies` take provider-defined string values — inspect them via the `listObjectFieldValues` autocomplete on `connection integration get oceanio` before building the filter; guessed strings silently mismatch.
- **`searchCompanies` bills per item, `searchPeople` per call** — the dump prices `searchCompanies` per returned record (`limit` = budget cap) while `searchPeople` is a fixed 1/execution.
- **Rate limit: 60 calls/minute** (spread) — the slowest in this group; batch accordingly.

## Position in the waterfall

- **SOURCE — mid-tier rung** (both searches at 1): after `salesNavigator` / `icypeas` (0.02–0.05), before `peopleDataLabs` / `waterfall.searchProspects` (3). Promote it when the filter is lookalike- or technographic-first.
- **ENRICH — mid-tier rung** (both enriches at 1): peer of `waterfall.enrichCompany` (1) and `apolloio.enrichOrganization` (1); pilot 10 rows to pick by coverage.
- Sourced people flow on to CONTACT (`FullEnrich.findEmail`, 1) and VERIFY (`waterfall.verifyEmail`, 0.1) as usual.

## Action shape

`{"kind":"connector","integrationSlug":"oceanio","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
