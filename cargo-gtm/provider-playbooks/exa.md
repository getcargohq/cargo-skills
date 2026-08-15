---
provider: exa
category: research (semantic search)
last-reviewed: 2026-08-15
---

# exa (Exa)

One action: semantic web search with a **category filter** and five search modes. What distinguishes it from the other search rungs is `category`, which restricts results to a document type (`company`, `news`, `financial report`, `research paper`, `people`, `tweet`, `personal site`) instead of hoping a keyword query lands there.

Billed **0.175 fixed + 0.025 per result**, so cost scales with `numResults` rather than with query count.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `search` | 0.175 fixed **+ 0.025 per result** | `query` (required), `searchType`, `category`, `numResults` (1–100), `includeText`, `includeDomains`, `excludeDomains`, `startPublishedDate`, `endPublishedDate`, `startCrawlDate`, `endCrawlDate` | Semantic search restricted to a document type. |

`searchType: "deep"` raises the fixed component from 0.175 to **0.3**; the per-result 0.025 is unchanged. Every other mode (`neural`, `fast`, `auto`, `instant`) bills the standard 0.175.

Worked cost: `numResults: 10` is 0.425, `numResults: 25` is 0.8, `numResults: 100` is 2.675. **Set `numResults` to what you will actually read.**

Rate limited to 10 calls per second.

## What it's for

- ✅ **Category-restricted research** — `category: "company"` returns company pages rather than blog posts about companies. `category: "financial report"` and `"news"` are the same idea for the questions where a general web search drowns in listicles.
- ✅ **Date-bounded questions** — the four date filters (`startPublishedDate` / `endPublishedDate` for publication, `startCrawlDate` / `endCrawlDate` for indexing) make "in the last quarter" a filter rather than a hope.
- ✅ **Semantic queries** — `searchType: "neural"` matches meaning rather than keywords, which is what you want for "companies that talk about the problem we solve".
- ❌ **Reading a page you already have** — `parallel.extract` (0.025/URL) or `firecrawl.scrape` (0.05). Search is the wrong instrument and 7x the price for a known URL.
- ❌ **Structured firmographics** — `companyEnrich.enrichByDomain` (0.25) returns typed fields. Search returns pages.
- ❌ **Plain keyword lookups** — `serper.search` and `firecrawl.search` are 0.05 flat for up to 100 results. If the query is a keyword and the category filter buys nothing, exa costs more for the same answer.

## Patterns

### Pattern A — Find company pages, not articles about companies

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"exa","actionSlug":"search","config":{}}' \
  --data '{
    "query": "B2B data enrichment platforms for revenue teams",
    "category": "company",
    "searchType": "neural",
    "numResults": 25
  }' \
  --wait-until-finished
```

0.8 credits for 25 company pages. Without `category`, the same query returns comparison listicles and vendor blogs, and you pay an LLM step to sort them out.

### Pattern B — What has been said recently, bounded by date

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"exa","actionSlug":"search","config":{}}' \
  --data '{
    "query": "Acme product strategy and priorities",
    "category": "news",
    "startPublishedDate": "2026-01-01",
    "numResults": 10,
    "includeText": true
  }' \
  --wait-until-finished
```

`includeText: true` returns extracted page text with each result, which can remove a separate extraction call. Compare the two before assuming: ten results with text may beat one search plus ten `parallel.extract` calls (0.425 against 0.675).

## Common pitfalls

- **Leaving `numResults` at a large default.** Cost is per result. This is the opposite of `serper`, where raising the limit is free, and the two are easy to confuse when copying a pattern between them.
- **Reaching for `searchType: "deep"` by reflex.** It nearly doubles the fixed cost. Use `auto` unless a shallower mode has already come back thin on this specific query.
- **Skipping `category`.** It is the reason to choose exa over the 0.05 search rungs. A query without it is a more expensive `serper.search`.
- **Treating results as records.** Search output is pages. Resolve to domains and enrich before anything enters a model.

## Anti-patterns

- **Per-row exa search across a segment.** 0.425 a row at ten results is 212 credits over 500 rows, for research most of those rows will never be acted on. Search the segment definition once; do not fan out per record.
- **exa where the answer needs to be structured.** `parallel.createTask` (0.125 at `lite`) returns a schema you define. exa returns ranked pages, and turning those into fields is another paid step.

## Position in the waterfall

- **Third rung for web search**, behind `serper.search` (0.05) and `firecrawl.search` (0.05) on price. It moves to first when the question needs a **category or date restriction**, which neither of those expresses.
- Ahead of `parallel.search` (0.125 + 0.025/item) when the filter is a document type; behind it when the steering wanted is an objective in natural language.

## Action shape

`{"kind":"connector","integrationSlug":"exa","actionSlug":"search","config":{}}`. **No `connectorUuid` in `config`.** Filters go in `--data`.

## Pairs with

- [`../recipes/icp-discovery.md`](../recipes/icp-discovery.md) — `category: "company"` sourcing against a described profile.
- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — date-bounded news for a personalization line that is actually recent.

## Recurring use

- **Cap `numResults` in the node.** A recurring search whose result count can vary has a bill that varies with it, and per-result pricing makes that compound quietly.
- **Date filters are what make a scheduled search legitimate.** Re-running an unbounded query weekly returns the same pages and re-bills them. Move `startPublishedDate` forward with the schedule so each run pays only for what is new.
- **In-play gate:** filter to rows whose research column is empty or whose last search predates the current window.
