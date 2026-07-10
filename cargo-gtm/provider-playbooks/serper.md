---
provider: serper
category: research (search)
last-reviewed: 2026-07-09
---

# serper (Serper)

Google search results and Google Places, **0.05 credits fixed per query** (up to 100 records per call). Two jobs: `searchPlaces` is the **default sourcing action for local SMBs / storefronts** — the segment the LinkedIn-shaped priority stack skips — and `search` is Google-results research for personalization and fact-finding.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `searchPlaces` | 0.05 (fixed) | `query`, `country`, `locale`, `limit` (default 10, max 100) | Google Maps-style local business results. Default for SMB / storefront / service-area sourcing. |
| `search` | 0.05 (fixed) | `query`, `country`, `locale`, `limit` (default 10, max 100) | Google search results for research and lookups. |

Billing is **fixed per query, not per record** — a `limit: 100` call costs the same 0.05 as a `limit: 10` call, so raise `limit` and lower the query count, never the reverse.

## What it's for

- ✅ **Local / SMB TAM** — "dentists in Austin", "HVAC contractors in Lyon": `searchPlaces` is the sourcing rung the priority stack lacks (see [`../recipes/build-tam.md`](../recipes/build-tam.md), local-SMB variant, and [`../guides/finding-companies-and-contacts.md`](../guides/finding-companies-and-contacts.md)).
- ✅ **Google lookups mid-pipeline** — recent news, a company's public footprint, resolving an official website before enrichment.
- ✅ **Geo-targeted results** — `country` (autocomplete-backed country list) plus `locale` (Google interface-language codes like `en`, `fr`, `de`) localize results properly.
- ❌ **Standard B2B sourcing** — `salesNavigator.searchLeads` (0.02) / `searchAccounts` (0.05) return structured, LinkedIn-anchored records; Google results need parsing.
- ❌ **Reading a page you already know** — that's `firecrawl.scrape` (0.05/item); serper returns result listings, not page content.

## Patterns

### Pattern A — Local-SMB sourcing

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"serper","actionSlug":"searchPlaces","config":{}}' \
  --data '{"query":"dentists in Austin, TX","country":"us","limit":100}' \
  --wait-until-finished
```

One query = 0.05 credits for up to 100 places. To build a bigger TAM, fan out **queries** (by city, neighborhood, or category) rather than paging one query — each geo variant is its own 0.05 call.

### Pattern B — Research lookup for personalization

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"serper","actionSlug":"search","config":{}}' \
  --data '{"query":"Acme GmbH funding announcement","country":"de","locale":"de","limit":10}' \
  --wait-until-finished
```

Pipe the results into an LLM step (`anthropic.instruct`) to extract the fact you need; serper hands back result listings, not answers.

## Common pitfalls

- **Paying per record in your head.** Cost is per **query**. Ten queries at `limit: 10` cost 10× more than one query at `limit: 100` for the same volume — always max out `limit` before adding queries.
- **Skipping `country`/`locale` for local sourcing.** Without them Google decides the geography for you; SMB lists come back skewed. Set `country` (from the country autocomplete) and put the city in the query.
- **Treating place results as enriched records.** `searchPlaces` output is a raw local listing — dedupe it and enrich (website → `cargo.matchBusiness` → firmographics) before it enters a model.

## Anti-patterns

- **serper for LinkedIn-shaped B2B lists.** If the segment is companies/people that salesNavigator covers, serper adds a parsing step and loses structure — it earns its place only where Google is the best index (local SMBs, public-web facts).
- **Fanning out searches without a cap.** Fixed-per-query pricing is cheap until an agent loops one query per record over a 5,000-row segment (250 credits of searches). Batch the distinct queries first; run each once.

## Position in the waterfall

- `searchPlaces` — **first (and effectively only) rung for local-SMB sourcing** (see [`../references/stage-action-map.md`](../references/stage-action-map.md), Sourcing — Local SMBs), with `firecrawl.search` as the web-search fallback.
- `search` — a web-research rung alongside `firecrawl.search`; pick serper when you specifically want Google's ranking/geo behavior, firecrawl when you want to continue into scraping.

## Action shape

`{"kind":"connector","integrationSlug":"serper","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/build-tam.md`](../recipes/build-tam.md) — the local-SMB sourcing variant.
- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — quick public-web facts feeding the personalization step.
