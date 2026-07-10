---
provider: anthropic
category: llm
last-reviewed: 2026-07-09
---

# anthropic (Anthropic)

Claude through a single `instruct` action — the **default judgment-tier LLM of the pack**: the prompt library ([`../references/prompt-library/index.md`](../references/prompt-library/index.md)) is written against it. Billed per **1,000-token package** per model tier. Provider routing in one line: anthropic Sonnet for judgment-heavy steps (positioning, scoring against soft ICPs, salience), `openAi` nano-tier (0.006) for cheapest bulk, `gemini` Flash (0.01–0.05) for cheap high-throughput, `perplexity` when the answer must come from the live web.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `instruct` | 0.2–4 / 1,000-token package (per-model tiers below) | `model` + `prompt` (required); `advancedSettings.{systemPrompt, maxTokens, temperature, withWebSearch}` | Personalization, scoring, extraction, classification steps inside enrichment pipelines. |

### Per-model cost tiers

| Tier | Model ids | Credits / 1,000 tokens |
|---|---|---|
| Sonnet | `claude-sonnet-4-6`, `claude-sonnet-4-5-20250929`, `claude-sonnet-4-20250514` (schema default), `claude-3-7-sonnet-latest`, `claude-3-5-sonnet-latest` (deprecated) | 0.2 |
| Haiku | `claude-3-5-haiku-latest` | 0.2 |
| Opus | `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-opus-4-1-20250805`, `claude-opus-4-20250514` | 2 |
| Fable | `claude-fable-5` | 4 |

`advancedSettings.withWebSearch: true` adds a **fixed 0.4 credits per call** on top of the token rate, at any tier. Rate limit: 4,000 calls/min per model. (`claude-3-opus-latest` is in the model enum but has no published credit rule — avoid it.)

## What it's for

- ✅ **Judgment-heavy steps** — positioning summaries, soft-criteria ICP scoring, long-document salience: Sonnet at 0.2/1k is the pack default (see [`../recipes/icp-discovery.md`](../recipes/icp-discovery.md)).
- ✅ **Extraction and classification with prompt-enforced JSON** — the whole prompt library runs through `anthropic.instruct` with `temperature: 0`.
- ✅ **Personalized outreach lines** — `temperature: 0.3`, see [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) step 5.
- ❌ **Cheapest possible bulk** — on Cargo credits, Haiku costs the **same 0.2 as Sonnet**, so there is no intra-anthropic discount; go to `openAi` nano-tier (0.006, 33× cheaper) or `gemini` Flash for pure-volume transforms.
- ❌ **Web-grounded research answers** — `withWebSearch` exists (+0.4/call fixed), but `perplexity` is purpose-built for cited web answers.

## Pattern — batch personalization / extraction

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"anthropic","actionSlug":"instruct","config":{"model":"claude-sonnet-4-6","advancedSettings":{"maxTokens":4096,"temperature":0}}}' \
  --records '[{"prompt":"<substituted prompt for row 1>"},{"prompt":"<row 2>"}, ...]' \
  --wait-until-finished
```

`prompt` goes in each record; `model` and `advancedSettings` in `config`. Take the prompt text from the prompt library rather than authoring from scratch.

## Input quirks

- **Temperature range is 0–1** — not 0–2 like openAi/gemini/perplexity. A pipeline-wide `temperature: 1.5` that works elsewhere is out of range here.
- **`advancedSettings.maxTokens` is required whenever `advancedSettings` is present** (default 4096). Include it any time you set `temperature` or `systemPrompt`.
- **No structured-output config.** Unlike openAi/gemini/perplexity, `instruct` has no `output.responseFormat` — JSON shape is enforced in the prompt ("emit ONLY the JSON object"), which is exactly how the prompt-library extraction prompts are written.
- Model ids must match the enum verbatim — copy them from the tier table above.

## Cost traps

- **500-row batch math** (≈1 package per short call): Sonnet/Haiku ≈ **100 credits**; Opus ≈ **1,000**; Fable 5 ≈ **2,000**. Opus/Fable are 10–20× Sonnet — never use them for bulk extraction or personalization; reserve them for a handful of high-stakes judgment calls.
- **`withWebSearch` on a batch** adds 0.4 × rows of fixed cost (+200 credits on 500 rows) before any tokens — route research needs to `perplexity` or a scrape + extract instead.
- **Token-metered, not call-metered.** Stuffing a whole scraped page into every prompt multiplies packages — truncate inputs (~3,000 words max, per the prompt-library guidance).

## Position in the LLM stack

- **Default for judgment** — the "quality" rung of [`../references/stage-action-map.md`](../references/stage-action-map.md) LLM section.
- For bulk-cheap transforms, demote to `openAi` nano-tier or `gemini` Flash after validating the prompt on a Sonnet pilot (pilot gate: [`../references/cost-discipline.md`](../references/cost-discipline.md)).

## Action shape

`{"kind":"connector","integrationSlug":"anthropic","actionSlug":"instruct","config":{"model":"…","advancedSettings":{…}}}`. **No `connectorUuid` in `config`.** Costs above are the Cargo-credits rules; a workspace can instead attach its own Anthropic key (connector config takes a single required `apiKey`) and bill the provider directly.

## Pairs with

- [`../references/prompt-library/index.md`](../references/prompt-library/index.md) — the prompt source for every `instruct` call (extraction, qualification, scoring, personalization, research, signal analysis).
- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — personalize stage; [`../recipes/icp-discovery.md`](../recipes/icp-discovery.md) — pattern analysis; [`../recipes/tech-intent.md`](../recipes/tech-intent.md) — scrape → LLM extract.
