---
provider: openAi
category: llm
last-reviewed: 2026-07-09
---

# openAi (OpenAI)

GPT models through a single `instruct` action — **the cheapest bulk-LLM tier in the catalog**: the nano models run at **0.006 credits per 1,000-token package**, 33× cheaper than anthropic's cheapest tier (0.2). Default provider for pure-volume transforms (extraction, classification, short personalization) once the prompt is proven. Routing: `anthropic` Sonnet for judgment, openAi nano for cheapest bulk, `gemini` Flash for cheap high-throughput, `perplexity` for web-grounded answers.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `instruct` | 0.006–0.5 / 1,000-token package (per-model tiers below) | `model` + `prompt` (required); `advancedSettings.{systemPrompt, maxTokens, temperature, withWebSearch}`; `output.{responseFormat, jsonSchema}` | Bulk LLM steps with native structured output. |

### Per-model cost tiers

| Tier | Model ids | Credits / 1,000 tokens |
|---|---|---|
| Nano | `gpt-5-nano`, `gpt-5.5-nano`, `gpt-5.4-nano`, `gpt-5.3-nano` | 0.006 |
| 4.1 Nano | `gpt-4.1-nano` | 0.01 |
| 4o Mini | `gpt-4o-mini` | 0.02 |
| Mini | `gpt-5-mini` (schema default), `gpt-5.5-mini`, `gpt-5.4-mini`, `gpt-5.3-mini` | 0.03 |
| 4.1 Mini | `gpt-4.1-mini` | 0.05 |
| Full GPT-5 | `gpt-5`, `gpt-5.5`, `gpt-5.4`, `gpt-5.3`, `gpt-5.2`, `gpt-5.1` | 0.2 |
| GPT-4.1 | `gpt-4.1` | 0.3 |
| Legacy | `gpt-4o`, `gpt-3.5-turbo` | 0.5 |

`advancedSettings.withWebSearch: true` adds a **fixed 0.4 credits per call**. Rate limit: 10,000 calls/min per model — the highest of the four LLM providers.

## What it's for

- ✅ **Cheapest at-scale LLM step** — `gpt-5-nano` for prompt-library extraction/classification/personalization on large segments, after a pilot proves the prompt.
- ✅ **Native structured output** — `output.responseFormat: "json_schema"` + a `jsonSchema` object validates the shape at the API level; no prompt-only JSON enforcement needed.
- ✅ **Balanced default** — `gpt-5-mini` (0.03) is the schema's own recommendation for cost/performance when nano output quality wobbles.
- ❌ **Judgment-heavy steps** — soft-criteria scoring, positioning, salience: use `anthropic` Sonnet (see [`../references/prompt-library/index.md`](../references/prompt-library/index.md) per-prompt model guidance).
- ❌ **Web research** — `withWebSearch` costs +0.4 fixed per call; `perplexity` is the web-grounded provider.

## Pattern — bulk extraction with schema-validated JSON

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"openAi","actionSlug":"instruct","config":{"model":"gpt-5-nano","advancedSettings":{"temperature":0},"output":{"responseFormat":"json_schema","jsonSchema":{"type":"object","properties":{"industry":{"type":"string"},"confidence":{"type":"string"}}}}}}' \
  --records '[{"prompt":"<substituted extraction prompt row 1>"},{"prompt":"<row 2>"}, ...]' \
  --wait-until-finished
```

`prompt` goes in each record; `model`, `advancedSettings`, and `output` in `config`. `responseFormat` enum: `text` (default) | `json_object` | `json_schema` (the last requires the sibling `jsonSchema` object).

## Input quirks

- **`maxTokens` counts reasoning tokens too** on GPT-5 models ("includes both visible output tokens and reasoning tokens") — a tight `maxTokens` can truncate visible output even when the answer is short. Leave headroom.
- **Temperature is 0–2, default 1** — set `temperature: 0` explicitly for extraction/scoring; the default is creative, not deterministic.
- `json_object` mode still requires the word "JSON" discipline in your prompt; `json_schema` is the stricter, preferred mode for parse-ready output.

## Cost traps

- **500-row batch math** (≈1 package per short call): `gpt-5-nano` ≈ **3 credits**; `gpt-5-mini` ≈ **15**; `gpt-5` ≈ **100**; `gpt-4o` ≈ **250**. Never run a full-size or legacy model on a bulk transform — the nano/full spread is 33×.
- **`gpt-4o-mini` is not the cheap option anymore.** At 0.02 it costs 3.3× `gpt-5-nano` (0.006) for the same bulk role — older recipes citing gpt-4o-mini as the floor predate the GPT-5 tiers.
- **Legacy trap:** `gpt-4o` and `gpt-3.5-turbo` bill at 0.5 — more than `gpt-5` itself. Never pick them.
- **`withWebSearch` on a batch** adds 0.4 × rows fixed (+200 credits on 500 rows) before tokens.

## Position in the LLM stack

- **The bulk rung** of [`../references/stage-action-map.md`](../references/stage-action-map.md) LLM section: pilot the prompt on `anthropic` Sonnet (~10 rows), then demote the batch to `gpt-5-nano`/`gpt-5-mini` per [`../references/cost-discipline.md`](../references/cost-discipline.md).

## Action shape

`{"kind":"connector","integrationSlug":"openAi","actionSlug":"instruct","config":{"model":"…","output":{…}}}`. **No `connectorUuid` in `config`.** Costs above are the Cargo-credits rules; a workspace can instead attach its own OpenAI key (connector config takes a single required `apiKey`) and bill the provider directly.

## Pairs with

- [`../references/prompt-library/index.md`](../references/prompt-library/index.md) — reuse the library's extraction/qualification/scoring prompts; they port to openAi unchanged (keep `temperature: 0` for deterministic families).
- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — the cheap-at-scale swap for the personalization step; [`../guides/writing-outreach.md`](../guides/writing-outreach.md) — provider choice for outreach copy.
