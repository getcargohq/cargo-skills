---
provider: perplexity
category: llm
last-reviewed: 2026-07-09
---

# perplexity (Perplexity)

Web-grounded LLM through a single `instruct` action — **every model has live internet access** (per the schema: "All models have access to internet"). The research rung of the LLM stack: use it when the answer must come from the current web (company facts, recent news, "what is X known for"), not for offline transforms — bulk-tier `openAi`/`gemini` models are 10–80× cheaper (gpt-5-nano 0.006 vs sonar's 0.3–1) on prompts that don't need the web.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `instruct` | 0.3–1 / 1,000-token package (per model × `searchContextSize`, below) | `model` + `prompt` (required); `advancedSettings.{searchContextSize, systemPrompt, searchRecencyFilter, searchDomainFilter, returnRelatedQuestions, returnImages, maxTokens, temperature}`; `output.{responseFormat, jsonSchema, regex}` | Web-grounded research answers per record. |

### Per-model cost tiers (credits / 1,000 tokens, by `searchContextSize`)

| Model | low | medium (default) | high | Rate limit |
|---|---|---|---|---|
| `sonar` | 0.3 | 0.4 | 0.5 | 1,000/min |
| `sonar-reasoning` | 0.4 | 0.5 | 0.6 | 1,000/min |
| `sonar-reasoning-pro` | 0.5 | 0.7 | 0.9 | 1,000/min |
| `sonar-pro` | 0.6 | 0.8 | 1 | 1,000/min |
| `sonar-deep-research` | 0.5 (flat) | 0.5 (flat) | 0.5 (flat) | **5/min** |

## What it's for

- ✅ **Per-record web research** — company summaries, recent-news lookups, fact-finding that feeds personalization (see [`../guides/writing-outreach.md`](../guides/writing-outreach.md), research step).
- ✅ **Scoped research** — `searchRecencyFilter` (`month`/`week`/`day`/`hour`) for freshness; `searchDomainFilter` to pin citations to up to 3 domains (prefix `-` to blacklist one).
- ✅ **Deep single-shot reports** — `sonar-deep-research` for a handful of high-value accounts, never batches (5/min).
- ❌ **Offline transforms** — extraction, classification, scoring, personalization on data you already hold: `sonar` at 0.3–0.5 costs 50–80× `openAi` `gpt-5-nano` (0.006).
- ❌ **Result listings** — if you want raw Google results to parse yourself, that's `serper.search` (0.05 fixed); perplexity returns synthesized answers.

## Pattern — web-grounded company research per record

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"perplexity","actionSlug":"instruct","config":{"model":"sonar","advancedSettings":{"searchContextSize":"low","searchRecencyFilter":"month","temperature":0}}}' \
  --records '[{"prompt":"What is Acme GmbH known for? 2-sentence summary."},{"prompt":"..."}, ...]' \
  --wait-until-finished
```

`prompt` goes in each record; `model` and `advancedSettings` in `config`. Pipe the answers into a cheap `anthropic`/`openAi` step for structured extraction if you need parse-ready JSON downstream.

## Input quirks

- **The schema default model is `sonar-deep-research`** — the 5/min, research-grade model. Always set `model` explicitly; an unset model turns a 500-row batch into a ~100-minute crawl at premium depth.
- **`searchContextSize` is a config cost lever, not just quality** — it moves the token rate up to ~1.8× (defaults to `medium`). Start `low` for one-fact lookups.
- **Structured output enums differ from openAi/gemini:** `output.responseFormat` is `text` (default) | `jsonSchema` (camelCase, requires sibling `jsonSchema`) | `regex` (requires sibling `regex`). There is no `json_object` mode here.
- **Temperature is 0–2 (exclusive), default 0** — already deterministic by default, unlike openAi/gemini (default 1).
- No `withWebSearch` flag — search is always on; that's the product.

## Cost traps

- **500-row batch math** (≈1 package per short call): `sonar` low ≈ **150 credits**, medium ≈ **200**; `sonar-pro` high ≈ **500**; `sonar-deep-research` ≈ **250 credits AND ~100 minutes** at 5/min. Compare: the same 500 rows on `openAi` `gpt-5-nano` ≈ 3 credits — only pay perplexity rates for rows that genuinely need the web.
- **Don't use reasoning/pro tiers for lookups.** "What does this company do?" is a `sonar`-low question; `sonar-reasoning-pro` high (0.9) triples the cost for no better citation.
- **Research the account, not the contact list.** 20 accounts × 25 contacts = research 20 times, not 500 — dedupe to one perplexity call per company, then fan the answer out to contacts.

## Position in the LLM stack

- **The web-grounded rung** of [`../references/stage-action-map.md`](../references/stage-action-map.md) LLM section; escalation path for facts: model data → `serper.search` (0.05) + cheap extract → `perplexity.instruct` when synthesis/citations are needed.
- Gate batch research spend through [`../references/cost-discipline.md`](../references/cost-discipline.md) — pilot ~10 rows first.

## Action shape

`{"kind":"connector","integrationSlug":"perplexity","actionSlug":"instruct","config":{"model":"…","advancedSettings":{…}}}`. **No `connectorUuid` in `config`.** Costs above are the Cargo-credits rules; a workspace can instead attach its own Perplexity key (connector config takes a single required `apiKey`) and bill the provider directly.

## Pairs with

- [`../references/prompt-library/index.md`](../references/prompt-library/index.md) — company-research prompts; run the research here, the structured extraction on a cheap offline model.
- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) / [`../recipes/funding-watch.md`](../recipes/funding-watch.md) — fresh-facts inputs to the personalization stage.
