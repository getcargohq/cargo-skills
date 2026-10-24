---
provider: firecrawl
category: research (scraping)
last-reviewed: 2026-10-23
---

# firecrawl (Firecrawl)

Web scraping, crawling, and web search at **0.05 credits per item** — the default web-research provider for the personalization and niche-research stages. It fetches pages as clean markdown for downstream LLM extraction; it is **not** a bulk-enrichment provider. Its `agent` action is the exception to the flat price: it browses on its own and bills by the Firecrawl credits it burns.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `scrape` | 0.05 / item | `url`, `includeFullPage`, `formats` (`markdown` default, `html`, `rawHtml`, `links`) | Turn one URL into clean data (markdown, html, links, metadata). |
| `search` | 0.05 / item | `query`, `limit` (1–100) | Web search when no structured provider has the data. |
| `crawl` | 0.05 / **page** | `url`, `maxDepth`, `limit`, `includePaths`, `excludePaths`, `options` | Recursively gather a site's pages (docs, job boards, portfolio pages). |
| `map` | 0.05 / call | `url`, `search`, `limit` (1–100,000), `sitemap` (`include` / `skip` / `only`), `includeSubdomains` | List a site's URLs without scraping them; returns `{ links: [{ url, title, description }] }`. |
| `agent` | 0.05 / **Firecrawl credit used** (cap `maxCredits`, default 250 → up to **12.5**) | `prompt` (required, ≤10,000 chars), `urls`, `schema` (JSON schema for the answer), `maxCredits`, `effort` (`low` / `medium` / `high`), `strictConstrainToURLs` | Answer a research prompt by searching and browsing — optionally as structured data matching `schema`. |

`scrape`, `search` and `crawl` bill **per item returned**, not per call (`map` returns one `links` object, so it bills once per call). `agent` bills per Firecrawl credit the run consumed, so its price varies run to run; a run that reaches `maxCredits` stops with an error and no result. In credits mode the connector is rate-limited (15/min, spread), so large crawls take time as well as credits — `agent` runs outside that limit and polls until Firecrawl finishes.

## What it's for

- ✅ **Personalization research** — scrape a prospect's site/blog/case-study page, then extract angles with an LLM (`anthropic.instruct`) for the first-line step of [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md).
- ✅ **Niche signals no structured provider covers** — industry job boards ([`../recipes/tech-intent.md`](../recipes/tech-intent.md)), investor portfolio pages ([`../recipes/portfolio-prospecting.md`](../recipes/portfolio-prospecting.md)), "companies that mention X on their site".
- ✅ **Cheap web search** — `search` at 0.05/result is the lowest-cost web-search rung in the sourcing map.
- ✅ **Open-ended research where you don't know the page** — `agent` finds and reads the pages itself and can return a typed object (`schema`). Know the URL already? `scrape` (0.05) plus an LLM is cheaper and more predictable.
- ❌ **Firmographics / tech stack at scale** — `aiArk.enrichCompany` (0.01) and `builtwith.getDomainSummary` (**free**) return structured fields directly; scraping + LLM-extracting the same facts costs more end-to-end and parses worse.
- ❌ **Jobs on major boards** — `theirStack.searchJobs` (0.5 / item) already covers LinkedIn, Indeed, etc. Crawl only the niche boards theirStack misses.

## Patterns

### Pattern A — Scrape one page → LLM extract

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"firecrawl","actionSlug":"scrape"}' \
  --data '{"url":"https://acme.com/customers"}' \
  --wait-until-finished
```

Feed the returned markdown to `anthropic.instruct` for structured extraction — the scrape is 0.05; the LLM call usually dominates the cost of this pair.

### Pattern B — Web search fallback

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"firecrawl","actionSlug":"search"}' \
  --data '{"query":"\"built on Stripe Atlas\" fintech startup","limit":20}' \
  --wait-until-finished
```

Billed per result: `limit: 20` ≈ 1 credit. Size `limit` to what you'll actually read.

### Pattern C — Bounded crawl of a niche site

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"firecrawl","actionSlug":"crawl"}' \
  --data '{
    "url": "https://jobs.nicheboard.io",
    "maxDepth": 1,
    "limit": 50,
    "includePaths": ["/jobs/*"]
  }' \
  --wait-until-finished
```

`maxDepth` semantics: `0` scrapes only the entered URL; `1` adds pages one level deep; `2` two levels; and so on. `options` accepts `ignoreSitemap`, `allowBackwardLinks`, `allowExternalLinks`.

### Pattern D — Agent with a structured answer and a hard cap

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"firecrawl","actionSlug":"agent"}' \
  --data '{
    "prompt": "Find the pricing tiers and the cheapest paid plan price for this company",
    "urls": ["https://acme.com"],
    "schema": {"type":"object","properties":{"tiers":{"type":"array","items":{"type":"string"}},"cheapestPaidMonthlyUsd":{"type":"number"}}},
    "maxCredits": 40,
    "effort": "low"
  }' \
  --wait-until-finished
```

`maxCredits: 40` caps the run at 2 Cargo credits. Pilot on a few rows and read `creditsUsedCount` before choosing a cap for a batch.

## Common pitfalls

- **Unbounded crawls.** `crawl` bills 0.05 per page crawled — an uncapped crawl of a large site burns hundreds of credits. **Always set `limit`** and start with `maxDepth: 1`; widen only if the pilot shows you need more.
- **Path-filter key spelling.** The action's input schema names the filters `includePaths` / `excludePaths`, while the UI labels them Includes/Excludes. A misspelled key (e.g. `includesPaths`) is refused by `action execute` (`Unknown field: includesPaths`), but inside a workflow node it is stripped and the crawl runs unfiltered.
- **`agent` without a `maxCredits` sized to the job.** The default 250 is a ceiling, not a typical spend — but across a 500-row batch it is a 6,250-credit ceiling. Set it per task, and prefer `scrape` + an LLM when you already know the page.
- **`allowExternalLinks` on a crawl.** It lets the crawler leave the target domain — combined with a loose `limit` this is the fastest way to pay for pages you didn't want.

## Anti-patterns

- **Scraping what a structured provider sells cheaper.** Company facts (`aiArk.enrichCompany`, 0.01) and tech stack (`builtwith.getDomainSummary`, free) come back typed for less than a scrape costs. Scrape only for data no structured provider has — which is genuinely where website copy, positioning changes, and page-specific claims live.
- **Crawling per-record in a batch.** A crawl inside a 500-record workflow multiplies pages × records. Crawl once, store the result, and join it to records instead.

## Position in the waterfall

**Web-research default** (see [`../references/stage-action-map.md`](../references/stage-action-map.md), Web research): `firecrawl` first at 0.05/item, escalating to `linkup.search` (0.5 standard, 2 deep) when you need structured answers, or `perplexity.instruct` (from 0.3 / 1k tokens) for cited synthesis. As a sourcing rung, `search` is the last-resort coverage fallback after salesNavigator / theirStack / serper.

Firecrawl's `crawl` also exists as an **extractor** — usable to sync a website into a connector-backed knowledge library (see the `cargo-content` skill) rather than as a one-off action.

## Recurring use

- **Scheduled fit: yes, for decaying pages.** A scheduled `crawl` of a niche job board (daily — hiring-intent cadence, see [`../recipes/save-as-play.md`](../recipes/save-as-play.md)) or a weekly `search` sweep works — but every run re-bills 0.05 per page/result returned, so keep `limit`/`maxDepth` as tight on run 50 as on run 1.
- **`agent` in a play bills its variable price on every row it runs on** — gate it on its output column being empty, and keep `maxCredits` as tight as the pilot allows.
- **Prefer the extractor for "keep this site fresh".** A recurring site sync is what the `crawl` extractor → knowledge library path is for (see Position in the waterfall), not a cron'd one-off action.
- **In-play gate:** never crawl per-record (see Anti-patterns). For per-record `scrape`, gate on the scraped-markdown column still being empty so play re-evaluation doesn't re-fetch pages already stored.

## Action shape

`{"kind":"connector","integrationSlug":"firecrawl","actionSlug":"<slug>"}`. **No `connectorUuid` in `config`.**
