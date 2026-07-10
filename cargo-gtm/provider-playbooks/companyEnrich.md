---
provider: companyEnrich
category: enrichment
last-reviewed: 2026-07-09
---

# companyEnrich (CompanyEnrich)

Budget company enrichment. `enrichByDomain` (0.25) is the **cheapest company-by-domain action in the catalog** ([`../references/stage-action-map.md`](../references/stage-action-map.md)) — half the price of the stack default `cargo.enrichBusinessFirmographics` (0.5), but less rich, so [`../references/alternatives.md`](../references/alternatives.md) reserves it for budget-critical batches. `findSimilarCompanies` (1 **per company returned**) is a lookalike finder for seeding TAM expansion — the only unit-priced action here, so `limit` is the cost dial.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrichByDomain` | 0.25 | `domain` (required) | Cheapest domain → firmographics: industry, employees, revenue, technologies, funding, socials, NAICS codes. |
| `findSimilarCompanies` | 1 **per item** | `domain` (required), `filters` (industries, technologies, keywords, region/country/state/city, employeeCountMin/Max, revenueMin/Max, yearFoundedMin/Max), `limit` | Lookalikes of a seed company, filtered — TAM expansion from a best-customer domain. |

## What it's for

- ✅ **Budget-critical company enrichment at scale** — a 10,000-row TAM at 0.25 is 2,500 credits vs 5,000 on the cargo default. Output covers firmographics plus `technologies`, `financial.funding` history, and a full `socials` block, so one call can serve several downstream columns.
- ✅ **Lookalike seeding** — `findSimilarCompanies` from a Closed-Won domain, filtered to your ICP's size/geo, feeds [`../recipes/build-tam.md`](../recipes/build-tam.md).
- ❌ **Default enrichment when budget isn't the constraint** — the priority stack (`cargo` native → `waterfall`) has richer, match-verified data; alternatives.md: "only when budget critical".
- ❌ **Person data** — company-only provider; no contact or email actions.

## Patterns

### Pattern A — Cheap domain → firmographics

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"companyEnrich","actionSlug":"enrichByDomain","config":{}}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished
```

`domain` is the only input — a bare domain like `company.com`, not a URL. No name- or LinkedIn-based lookup on this action.

### Pattern B — Lookalikes from a seed domain (cost-capped)

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"companyEnrich","actionSlug":"findSimilarCompanies","config":{}}' \
  --record '{"domain":"acme.com","filters":{"country":"United States","employeeCountMin":50,"employeeCountMax":500,"industries":["Software"]},"limit":25}' \
  --wait-until-finished
```

**Always set `limit`** — pricing is 1 credit × companies returned.

## Common pitfalls

- **`findSimilarCompanies` is per-item.** Unlike `enrichByDomain`'s fixed 0.25, an uncapped similar-companies call bills 1 credit for every company in the result. `limit: 100` = 100 credits.
- **`employees` and `revenue` come back as strings** (range buckets), not numbers — cast or map before filtering on them in storage SQL.
- **Filter values are free-text via the CLI.** The UI backs `industries` / `technologies` / `keywords` / geo filters with autocomplete lists; from the CLI you pass plain strings, so misspelled values silently narrow results to zero.
- **Rate limit 300/minute** (spread) — fine for most batches, but a five-figure TAM enrich stretches over the better part of an hour.

## Anti-patterns

- **Running it beside the cargo default "for extra coverage".** Paying 0.25 + 0.5 per row for overlapping firmographics defeats the only reason to be here (budget). Pick one per [`../references/cost-discipline.md`](../references/cost-discipline.md).
- **Using lookalikes as final TAM rows without enrichment.** Similar-company results are seeds — flow them through the normal ENRICH → dedupe path before counting them as TAM.

## Position in the waterfall

- `enrichByDomain` — **ENRICH (company), budget rung**: cheapest of the chain (`companyEnrich` 0.25 → `linkedin` 0.25–0.5 → `cargo` 0.5 ✅ → `waterfall` 1 ✅ → `peopleDataLabs` 3).
- `findSimilarCompanies` — **SOURCE-adjacent**: lookalike expansion feeding TAM builds, upstream of ENRICH.

## Action shape

`{"kind":"connector","integrationSlug":"companyEnrich","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
