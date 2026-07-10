---
provider: firecrawl
category: research (scraping)
last-reviewed: 2026-07-09
---

# firecrawl (Firecrawl)

Web scraping, crawling, and web search at **0.05 credits per item** — the default web-research provider for the personalization and niche-research stages. It fetches pages as clean markdown for downstream LLM extraction; it is **not** a bulk-enrichment provider.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `scrape` | 0.05 / item | `url` | Turn one URL into clean data (markdown, html, links, metadata). |
| `search` | 0.05 / item | `query`, `limit` (1–100) | Web search when no structured provider has the data. |
| `crawl` | 0.05 / **page** | `url`, `maxDepth`, `limit`, `includesPaths`, `excludesPaths`, `options` | Recursively gather a site's pages (docs, job boards, portfolio pages). |

All three bill **per item returned**, not per call. In credits mode the connector is rate-limited (15/min, spread), so large crawls take time as well as credits.

## What it's for

- ✅ **Personalization research** — scrape a prospect's site/blog/case-study page, then extract angles with an LLM (`anthropic.instruct`) for the first-line step of [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md).
- ✅ **Niche signals no structured provider covers** — industry job boards ([`../recipes/tech-intent.md`](../recipes/tech-intent.md)), investor portfolio pages ([`../recipes/portfolio-prospecting.md`](../recipes/portfolio-prospecting.md)), "companies that mention X on their site".
- ✅ **Cheap web search** — `search` at 0.05/result is the lowest-cost web-search rung in the sourcing map.
- ❌ **Firmographics / tech stack at scale** — `cargo.enrichBusinessFirmographics` (0.5) and `cargo.enrichBusinessTechnographics` (1) return structured fields directly; scraping + LLM-extracting the same facts costs more end-to-end and parses worse.
- ❌ **Jobs on major boards** — `theirStack.searchJobs` (0.5) already covers LinkedIn, Indeed, etc. Crawl only the niche boards theirStack misses.

## Patterns

### Pattern A — Scrape one page → LLM extract

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"firecrawl","actionSlug":"scrape","config":{}}' \
  --data '{"url":"https://acme.com/customers"}' \
  --wait-until-finished
```

Feed the returned markdown to `anthropic.instruct` for structured extraction — the scrape is 0.05; the LLM call usually dominates the cost of this pair.

### Pattern B — Web search fallback

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"firecrawl","actionSlug":"search","config":{}}' \
  --data '{"query":"\"built on Stripe Atlas\" fintech startup","limit":20}' \
  --wait-until-finished
```

Billed per result: `limit: 20` ≈ 1 credit. Size `limit` to what you'll actually read.

### Pattern C — Bounded crawl of a niche site

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"firecrawl","actionSlug":"crawl","config":{}}' \
  --data '{
    "url": "https://jobs.nicheboard.io",
    "maxDepth": 1,
    "limit": 50,
    "includesPaths": ["/jobs/*"]
  }' \
  --wait-until-finished
```

`maxDepth` semantics: `0` scrapes only the entered URL; `1` adds pages one level deep; `2` two levels; and so on. `options` accepts `ignoreSitemap`, `allowBackwardLinks`, `allowExternalLinks`.

## Common pitfalls

- **Unbounded crawls.** `crawl` bills 0.05 per page crawled — an uncapped crawl of a large site burns hundreds of credits. **Always set `limit`** and start with `maxDepth: 1`; widen only if the pilot shows you need more.
- **Path-filter key spelling.** The action's input schema names the filters `includesPaths` / `excludesPaths` (note the plural "includes"), while the UI labels them include/exclude paths. If a filter appears ignored, check the spelling against the schema.
- **`allowExternalLinks` on a crawl.** It lets the crawler leave the target domain — combined with a loose `limit` this is the fastest way to pay for pages you didn't want.

## Anti-patterns

- **Scraping what a structured provider sells cheaper.** Company facts, tech stack, keywords, and website changes all exist as cargo native actions (0.5–1) with typed outputs. Scrape only for data no structured provider has.
- **Crawling per-record in a batch.** A crawl inside a 500-record workflow multiplies pages × records. Crawl once, store the result, and join it to records instead.

## Position in the waterfall

**Web-research default** (see [`../references/stage-action-map.md`](../references/stage-action-map.md), Web research): `firecrawl` first at 0.05/item, escalating to `linkup.search` (0.5) when you need structured answers, or `perplexity.instruct` (0.3) for cited synthesis. As a sourcing rung, `search` is the last-resort coverage fallback after salesNavigator / theirStack / serper.

Firecrawl's `crawl` also exists as an **extractor** — usable to sync a website into a connector-backed knowledge library (see the `cargo-content` skill) rather than as a one-off action.

## Action shape

`{"kind":"connector","integrationSlug":"firecrawl","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
