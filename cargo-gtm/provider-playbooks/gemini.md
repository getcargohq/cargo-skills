---
provider: gemini
category: llm
last-reviewed: 2026-07-09
---

# gemini (Google Gemini)

Gemini models through a single `instruct` action — the **cheap high-throughput tier**: Flash models run at 0.01–0.05 credits per 1,000-token package with a **15,000 calls/min rate limit** (highest in the LLM catalog), plus optional Google Search grounding. Routing: `anthropic` Sonnet for judgment, `openAi` nano (0.006) for absolute-cheapest bulk, gemini Flash when you want cheap **and** fast (or Google-grounded), `perplexity` for cited web research.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `instruct` | 0.01–0.2 / 1,000-token package (per-model tiers below) | `model` + `prompt` (required); `advancedSettings.{systemPrompt, maxTokens, temperature, withWebSearch}`; `output.{responseFormat, jsonSchema}` | High-throughput LLM steps, optionally grounded in Google Search. |

### Per-model cost tiers

| Tier | Model ids | Credits / 1,000 tokens | Rate limit |
|---|---|---|---|
| Flash (older) | `gemini-2.0-flash`, `gemini-1.5-flash` | 0.01 | 15,000/min |
| Flash | `gemini-2.5-flash` (schema default) | 0.03 | 15,000/min |
| Flash (preview) | `gemini-3-flash-preview` | 0.05 | 15,000/min |
| Pro (older) | `gemini-1.5-pro` | 0.1 | 2,000/min |
| Pro | `gemini-2.5-pro` | 0.15 | 1,000/min |
| Pro (preview) | `gemini-3.1-pro-preview`, `gemini-3-pro-preview` | 0.2 | 1,000/min |

`advancedSettings.withWebSearch: true` ("With Google Search?") adds a **fixed 0.4 credits per call** per the billing rules — and the schema warns each search request incurs an additional 0.5-credit charge on Cargo credits. Treat grounded calls as materially more expensive than the token rate suggests.

## What it's for

- ✅ **Cheap, fast bulk transforms** — extraction/classification/short personalization at Flash prices; the 15,000/min ceiling means big batches don't throttle.
- ✅ **Native structured output** — `output.responseFormat`: `text` (default) | `json_object` | `json_schema` (+ sibling `jsonSchema` object), same surface as openAi.
- ✅ **Google-grounded answers mid-pipeline** — `withWebSearch` grounds responses in live Google Search when a `serper.search` + extract two-step is overkill.
- ❌ **Judgment-heavy steps** — soft scoring, positioning, salience: `anthropic` Sonnet (see per-prompt model guidance in [`../references/prompt-library/index.md`](../references/prompt-library/index.md)).
- ❌ **Absolute-cheapest bulk** — `openAi` `gpt-5-nano` (0.006) undercuts even `gemini-2.0-flash` (0.01) if throughput isn't the constraint.

## Pattern — high-throughput classification

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"gemini","actionSlug":"instruct","config":{"model":"gemini-2.5-flash","advancedSettings":{"temperature":0},"output":{"responseFormat":"json_object"}}}' \
  --records '[{"prompt":"<substituted classification prompt row 1>"},{"prompt":"<row 2>"}, ...]' \
  --wait-until-finished
```

`prompt` goes in each record; `model`, `advancedSettings`, and `output` in `config`.

## Input quirks

- **Temperature is 0–2, default 1** — set `temperature: 0` explicitly for extraction and scoring families.
- **Model ids are a plain enum** (no titles): copy them exactly from the tier table; `gemini-2.5-flash` is the schema default.
- The `-preview` models (3.x line) are newest but cost more than their stable siblings at the same tier — pilot before committing a batch to them.

## Cost traps

- **500-row batch math** (≈1 package per short call): `gemini-2.0-flash`/`1.5-flash` ≈ **5 credits**; `gemini-2.5-flash` ≈ **15**; `gemini-3-flash-preview` ≈ **25**; `gemini-2.5-pro` ≈ **75**; 3.x-pro-preview ≈ **100**. Keep bulk on Flash; Pro is 4–20× Flash for the same row count.
- **Grounded batches are the real trap:** `withWebSearch` adds 0.4 fixed per call (+200 credits on 500 rows) plus the per-search surcharge — a "grounded Flash" batch can cost more than an ungrounded Pro one. Ground only the rows that need fresh facts.
- **Never bulk on a judgment-tier model:** Pro-tier extraction is Flash-quality work at Pro prices — pilot on Pro/Sonnet if needed, then demote the batch to Flash.

## Position in the LLM stack

- **The throughput rung** of [`../references/stage-action-map.md`](../references/stage-action-map.md) LLM section: pick gemini Flash over `openAi` nano when rate limits (15,000/min vs 10,000/min) or Google grounding matter; otherwise nano is cheaper.
- Pilot-then-demote per [`../references/cost-discipline.md`](../references/cost-discipline.md).

## Action shape

`{"kind":"connector","integrationSlug":"gemini","actionSlug":"instruct","config":{"model":"…","output":{…}}}`. **No `connectorUuid` in `config`.** Costs above are the Cargo-credits rules; a workspace can instead attach its own Gemini key (connector config takes a single required `apiKey`) and bill Google directly.

## Pairs with

- [`../references/prompt-library/index.md`](../references/prompt-library/index.md) — the library's extraction/qualification/personalization prompts port unchanged; keep `temperature: 0` for the deterministic families.
- [`../recipes/build-tam.md`](../recipes/build-tam.md) / [`../recipes/tech-intent.md`](../recipes/tech-intent.md) — high-volume classify/extract stages where Flash throughput pays off.
