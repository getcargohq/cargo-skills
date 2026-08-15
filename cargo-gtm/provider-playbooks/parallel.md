---
provider: parallel
category: research (search, extract, agentic task)
last-reviewed: 2026-08-15
---

# parallel (Parallel)

Web search, page extraction, and **agentic research tasks that return a schema you define**. Three actions, and the third is the one nothing else in the catalog does: `createTask` runs a multi-step research job and fills a JSON schema, at a cost you pick from a nine-rung processor ladder starting at **0.125**.

Cheapest extraction in the catalog at **0.025 per URL**, half of `firecrawl.scrape` (0.05).

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `extract` | 0.025 **per URL** | `urls` (required), `objective`, `searchQueries`, `maxCharsTotal`, `fullContent` | **Cheapest page read in the catalog.** Pull content from URLs you already have, optionally steered by an `objective`. |
| `search` | 0.125 fixed **+ 0.025 per item** | `searchQueries` (required), `objective`, `mode`, `numResults`, `maxCharsTotal`, `includeDomains`, `excludeDomains`, `afterDate` | Ranked web search with relevance scoring, steered by an objective rather than keywords alone. |
| `createTask` | 0.125 (`lite`) | `input` (required), `processor` (required), `outputSchema`, `includeDomains`, `excludeDomains`, `afterDate`, `location` | **Unique action.** An agentic research task that returns structured output against your own schema. |

`extract` bills per URL with no fixed component, so a 10-URL call is 0.25 and there is no penalty for splitting or batching.

### The `createTask` processor ladder

`processor` is **required and has no default**, so the tier is always a deliberate choice. It is the only cost decision in this provider that can run away:

| Processor | Cost | When |
|---|---|---|
| `lite` | **0.125** | The default choice. A focused question over public web with a small schema. |
| `base` | 0.25 | The same, when `lite` returns thin results on a hard target. |
| `core` | 0.625 | Multi-hop questions ("who do they compete with, and what do those competitors charge"). |
| `core2x` | 1.25 | Wider fan-out on the same shape. |
| `pro` | 2.5 | Deep research where a wrong answer is expensive. |
| `ultra` / `ultra2x` / `ultra4x` / `ultra8x` | 7.5 / 15 / 30 / **60** | Exhaustive research. **`ultra8x` costs 60 credits per record** — more than a full waterfall on a contact. Never reach for these across a list. |

**Start at `lite` and escalate the misses, exactly as with an email waterfall.** Going straight to `pro` across 200 rows is 500 credits for a question `lite` may have answered for 25.

## What it's for

- ✅ **Reading pages you already have URLs for** — `extract` at 0.025 is the cheapest rung in the catalog, and it takes an `objective` so the extraction is steered rather than a raw dump.
- ✅ **Structured research output** — `createTask` with `outputSchema` returns a JSON object rather than prose, which is what makes it usable in a pipeline instead of in a chat window. Nothing else in the catalog fills a caller-supplied schema.
- ✅ **Account research and personalization** — an objective-driven question over public web, cited and structured, at 0.125 a record.
- ❌ **Structured B2B firmographics** — `companyEnrich.enrichByDomain` (0.25) or `linkedin.enrichCompanyFromDomain` (0.5) return typed fields. Do not pay an agentic task to guess a headcount that an enrichment provider knows.
- ❌ **Finding people or emails** — that is the contact stack ([`../references/stage-action-map.md`](../references/stage-action-map.md)); a research task is the wrong instrument and the wrong price.
- ❌ **Local SMB listings** — `serper.searchPlaces` (0.05) is the index for that.

## Patterns

### Pattern A — Read the pages you already have (cheapest rung)

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"parallel","actionSlug":"extract","config":{}}' \
  --data '{
    "urls": ["https://acme.com", "https://acme.com/careers"],
    "objective": "What the company says it does, and which teams it is growing"
  }' \
  --wait-until-finished
```

Two URLs, 0.05 credits. Pass `objective` even when it feels optional: it is the difference between an extraction and a page dump you then pay an LLM to read.

### Pattern B — Structured research at the cheapest tier

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"parallel","actionSlug":"createTask","config":{}}' \
  --data '{
    "input": "What has Acme publicly said about its priorities in the last 12 months, and who does it name as competitors?",
    "processor": "lite",
    "outputSchema": {
      "type": "object",
      "properties": {
        "priorities": {"type": "array", "items": {"type": "string"}},
        "competitors": {"type": "array", "items": {"type": "string"}},
        "sources": {"type": "array", "items": {"type": "string"}}
      }
    }
  }' \
  --wait-until-finished
```

**Put a `sources` field in every `outputSchema`.** The task will fill it, and without it you get confident prose with nothing to check it against, which is the failure mode research output has.

### Pattern C — Objective-steered search

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"parallel","actionSlug":"search","config":{}}' \
  --data '{
    "searchQueries": ["Acme Series B", "Acme layoffs 2026"],
    "objective": "Recent funding or headcount changes at Acme",
    "numResults": 10,
    "afterDate": "2026-01-01"
  }' \
  --wait-until-finished
```

0.125 fixed plus 0.025 per result, so `numResults: 10` is 0.375 and `numResults: 50` is 1.375. Unlike `serper`, raising the result count **does** raise the bill.

## Common pitfalls

- **Omitting `processor` and assuming a cheap default.** It is required, so the call fails rather than defaulting, which is the good outcome. The bad outcome is copying an example that pins `pro` and running it over a list.
- **Reading `search` pricing as fixed.** It is fixed **plus** per item. That is the opposite of `serper` (0.05 flat for up to 100), so a habit carried from serper of maxing the limit is expensive here.
- **Using `createTask` for a field an enrichment provider owns.** An agentic task can return a headcount. It will cost more than `companyEnrich.enrichByDomain` and be less reliable, because it is inferring what the other provider looked up.
- **`outputSchema` with no sources field.** See Pattern B. This is the single most common way research output becomes unusable.

## Anti-patterns

- **The processor ladder across a segment.** `ultra8x` is 60 credits per record. On a 500-row segment that is 30,000 credits, which is larger than most accounts' monthly allocation. If a tier above `core` is genuinely needed, the run is a per-record decision and not a batch.
- **`createTask` where `extract` would do.** If you already have the URL, extraction is 0.025 and the task is at least 0.125. Reach for the task when the question needs finding pages, not reading known ones.
- **Parallel as a firmographics provider.** See the ❌ list. This is a research instrument.

## Position in the waterfall

- `extract` — **first rung for reading a known URL**, ahead of `firecrawl.scrape` (0.05) on price alone. Prefer firecrawl when you need its crawl behavior across a site rather than a URL list.
- `createTask` — the structured-research rung, ahead of `linkup.instruct` (1) on price at `lite` (0.125) and `base` (0.25), and the only one that fills a caller-supplied schema. Prefer `linkup.instruct` when a `sourcedAnswer` in prose is genuinely all you want.
- `search` — a web-search rung alongside `firecrawl.search` (0.05) and `serper.search` (0.05). Both of those are cheaper for plain queries; parallel earns its place when the `objective` steering measurably improves what comes back.

## Action shape

`{"kind":"connector","integrationSlug":"parallel","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.** Inputs go in `--data` for a single call and in `--records` when fanning out per row.

## Pairs with

- [`../recipes/account-expansion.md`](../recipes/account-expansion.md) — research feeding an expansion angle.
- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — the personalization step, where structured output beats prose.

## Recurring use

- **Signal-triggered, not timer-driven.** Research goes stale on events (funding, a launch, a leadership change), not on a calendar. Re-running `createTask` monthly over a static list re-bills settled rows for an answer that has not changed.
- **In-play gate:** filter to rows whose research column is empty, or whose triggering signal is newer than the stored research timestamp.
- **Pin the processor in the play, not in the prompt.** A recurring node that lets the tier vary per run has an unbounded bill. Set `lite` in the node and treat an escalation as a separate, human-approved run.
- **Cache `extract` output.** Page content changes slowly; re-extracting the same URL every run is the cheapest action in the catalog repeated until it is not cheap.
