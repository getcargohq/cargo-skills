---
provider: companyEnrich
category: enrichment
last-reviewed: 2026-07-09
---

# companyEnrich (CompanyEnrich)

Budget company enrichment. `enrichByDomain` (0.25) carries a **fuller field set than the 0.01 stack default** `aiArk.enrichCompany` ([`../references/stage-action-map.md`](../references/stage-action-map.md)), so [`../references/alternatives.md`](../references/alternatives.md) promotes it on the rows aiArk returns thin rather than running it across the whole list. `findSimilarCompanies` (1 **per company returned**) is a lookalike finder for seeding TAM expansion — the only unit-priced action here, so `limit` is the cost dial.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrichByDomain` | 0.25 | `domain` (required) | Cheapest domain → firmographics: industry, employees, revenue, technologies, funding, socials, NAICS codes. |
| `findSimilarCompanies` | 1 **per item** (an empty result still bills 1) | `domain` (required), `filters` (industries, technologies, keywords, region/country/state/city, employeeCountMin/Max, revenueMin/Max, yearFoundedMin/Max), `limit` (default 10, max 100) | Lookalikes of a seed company, filtered — TAM expansion from a best-customer domain. |
| `getWorkforce` | 0.25 | `id` **or** `domain` | Workforce insights, including historical headcount by department (department-growth and layoff signals). |
| `lookupPerson` | 0.25 (0 on no match) | `email` (required) | Resolve a person from an email address: company from the email domain, then the person by local-part pattern. |

## What it's for

- ✅ **Depth on the rows the 0.01 rung left thin** — output covers firmographics plus `technologies`, `financial.funding` history, and a full `socials` block, so one call can serve several downstream columns that `aiArk.enrichCompany` leaves empty.
- ✅ **Lookalike seeding** — `findSimilarCompanies` from a Closed-Won domain, filtered to your ICP's size/geo, feeds [`../recipes/build-tam.md`](../recipes/build-tam.md).
- ❌ **First-stop enrichment across a whole list** — `aiArk.enrichCompany` (0.01) is 25× cheaper and answers most firmographic questions; alternatives.md promotes this action on the residue, not ahead of it.
- ❌ **Person data** — company-first provider; the one person action, `lookupPerson`, resolves from an email you already hold and finds no contact data.

## Patterns

### Pattern A — Cheap domain → firmographics

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"companyEnrich","actionSlug":"enrichByDomain"}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished
```

`domain` is the only input — a bare domain like `company.com`, not a URL. No name- or LinkedIn-based lookup on this action.

### Pattern B — Lookalikes from a seed domain (cost-capped)

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"companyEnrich","actionSlug":"findSimilarCompanies"}' \
  --data '{"domain":"acme.com","filters":{"country":"US","employeeCountMin":50,"employeeCountMax":500,"industries":["<NAICS code from listIndustries>"]},"limit":25}' \
  --wait-until-finished
```

**Always set `limit`** — pricing is 1 credit × companies returned.

## Common pitfalls

- **`findSimilarCompanies` is per-item.** Unlike `enrichByDomain`'s fixed 0.25, an uncapped similar-companies call bills 1 credit for every company in the result. `limit: 100` = 100 credits.
- **`employees` and `revenue` come back as strings** (range buckets), not numbers — cast or map before filtering on them in storage SQL.
- **Filter values are autocomplete codes, not names.** `industries` takes NAICS codes as strings, `country` a country code (`"US"`), `region` a region id, `state` / `city` numeric ids (from `listIndustries`, `listCountries`, `listRegions`, `listStates`, `listCities`). A non-numeric `industries`, `state` or `city` value is **silently dropped**, so `"industries":["Software"]` runs the search with no industry filter and bills for it. `technologies` / `keywords` are plain strings (`listTechnologies`, `listKeywords`); misspelled ones narrow results to zero.
- **Rate limit 300/minute** (spread) — fine for most batches, but a five-figure TAM enrich stretches over the better part of an hour.

## Anti-patterns

- **Running it beside `aiArk.enrichCompany` "for extra coverage".** Paying 0.01 + 0.25 per row for overlapping firmographics wastes the cheaper rung's whole point. Run aiArk across the list, then this one only on the rows it left empty — per [`../references/cost-discipline.md`](../references/cost-discipline.md).
- **Using lookalikes as final TAM rows without enrichment.** Similar-company results are seeds — flow them through the normal ENRICH → dedupe path before counting them as TAM.

## Position in the waterfall

- `enrichByDomain` — **ENRICH (company), second rung**: `aiArk` 0.01 ✅ → **`companyEnrich` 0.25** → `linkedin` 0.25–0.5 → `waterfall` 1 ✅ → `peopleDataLabs` 3.
- `findSimilarCompanies` — **SOURCE-adjacent**: lookalike expansion feeding TAM builds, upstream of ENRICH.

## Recurring use

- **Scheduled lookalikes:** `findSimilarCompanies` can re-run weekly to keep a TAM growing (persona/company searches → weekly; [`../recipes/save-as-play.md`](../recipes/save-as-play.md)) — but results overlap heavily run to run and bill 1 credit **per company returned**, so keep `limit` tight and dedup against the Companies model (a free `storage query execute` on `domain`) before any downstream enrichment.
- **In-play gate:** `enrichByDomain` runs only where the row's firmographic target columns are still empty after the 0.01 rung — never beside it (see anti-patterns).
- **Stable data:** firmographics don't decay; a scheduled re-enrich of an existing TAM just re-bills unchanged data at 0.25/row.

## Action shape

`{"kind":"connector","integrationSlug":"companyEnrich","actionSlug":"<slug>"}`. **No `connectorUuid` in `config`.**
