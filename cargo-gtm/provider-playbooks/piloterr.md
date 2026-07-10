---
provider: piloterr
category: sourcing (bulk company lists + G2 product scrape)
last-reviewed: 2026-07-09
---

# piloterr (Piloterr)

Ultra-cheap sourcing surfaces, both priced at **0.01**: an **action** (`getG2ProductInfo`) that scrapes one G2 product page (reviews, ratings, pricing plans, specs), and an **extractor** (`fetchCompanies`, 0.01 **per item**) that syncs filtered company lists into a model — 10,000 companies for 100 credits, the cheapest at-scale company pull in the catalog. It complements rather than replaces `salesNavigator.searchAccounts` (0.05): salesNavigator is an on-demand action inside a workflow; piloterr's company pull is a scheduled model sync.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `getG2ProductInfo` | 0.01 | `query` (G2 product URL **or** slug, e.g. `postman`) | G2 product info — reviews, ratings, pricing plans, specs. 100× cheaper than `g2.enrichProduct` (1). |

## Extractor (syncs into a model, not an action)

| Extractor | Cost | Inputs | Use for |
|---|---|---|---|
| `fetchCompanies` | 0.01 per item | `filter` (cargo filter shape), `sort`, `limit` (default 200, max 10,000) | Bulk LinkedIn-flavored company records: `name`, `domain`, `industry`, `staff_count`/`staff_range`, `linkedin_url`, HQ fields, `founded`, `specialities_list`, … |

Wire it with `cargo-ai storage model create … --extractor-slug fetchCompanies` (see `cargo-storage`). Fetch mode is non-incremental with a **14-day minimum interval**. Synced rows unify into the account model on `domain` / `website` / `linkedin_url` / LinkedIn ids — re-fetches dedupe instead of duplicating.

## What it's for

- ✅ **Bulk TAM seeding on a budget** — a 10,000-company filtered pull costs 100 credits vs 500 with `salesNavigator.searchAccounts` (0.05/record).
- ✅ **G2 product scrapes at volume** — competitive review sweeps at 0.01/product; includes pricing plans, which `g2.enrichProduct` doesn't list in its description.
- ❌ **Interactive sourcing inside a play** — `fetchCompanies` is an extractor on a sync schedule; for search-as-a-node, use `salesNavigator` / `oceanio`.
- ❌ **Filters beyond firmographics** — the property set is LinkedIn-page-shaped (industry, staff, HQ, founded); no funding, tech-stack, or intent filters. That's `theirStack` (0.5) / `peopleDataLabs` (3).

## Patterns

### Pattern A — Cheap G2 product info

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"piloterr","actionSlug":"getG2ProductInfo","config":{}}' \
  --data '{"query":"postman"}' \
  --wait-until-finished
```

### Pattern B — Bulk company model via the extractor

Configure the model's extractor with the cargo filter shape (note the `conjonction` spelling):

```json
{
  "filter": {
    "conjonction": "and",
    "groups": [{
      "conjonction": "or",
      "conditions": [
        {"propertyName": "industry", "operator": "is", "values": ["Computer Software"]},
        {"propertyName": "staff_range", "operator": "is", "values": ["51-200"]}
      ]
    }]
  },
  "sort": [{"propertyName": "staff_count", "kind": "desc"}],
  "limit": 5000
}
```

`industry`, `staff_range`, and `headquarter_country` values are provider enums — resolve them via the `listObjectPropertyEnum` autocomplete on `connection integration get piloterr` before building the filter.

## Common pitfalls

- **`fetchCompanies` is an extractor.** `action execute` won't run it — it lives on a model (`--extractor-slug`), syncs at most every 14 days, and bills 0.01 × rows returned. `limit` is the budget cap.
- **`conjonction`, not `conjunction`.** The filter shape is cargo's standard `{conjonction, groups, conditions}` — the misspelling-that-isn't breaks silently (see the router's [`gotchas.md`](../../cargo/references/gotchas.md)).
- **Guessed enum values match nothing.** Filter enums come from the autocomplete; free-text `industry` strings silently return zero rows.
- **Rate limit: 30 calls/minute** (spread) — fine for the extractor, slow for fanning `getG2ProductInfo` across thousands of rows in one burst.

## Position in the waterfall

**SOURCE stage, bulk/scheduled rung.** For recurring TAM refresh: **piloterr extractor (0.01/item)** → `salesNavigator.searchAccounts` (0.05, interactive) → `oceanio.searchCompanies` (1, lookalike/technographic) → `peopleDataLabs` (3, heavyweight filters). See [`../references/stage-action-map.md`](../references/stage-action-map.md).

## Action shape

`{"kind":"connector","integrationSlug":"piloterr","actionSlug":"getG2ProductInfo","config":{}}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/build-tam.md`](../recipes/build-tam.md) — the cheapest seed for a 1,000–10,000-company TAM model.
- [`../recipes/tech-intent.md`](../recipes/tech-intent.md) — G2 review data as qualitative color on intent-matched accounts.
