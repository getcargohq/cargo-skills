---
provider: typesafe
category: llm (typed judgments)
last-reviewed: 2026-10-23
---

# typesafe (TypeSafe)

Typed yes/no, choice, and score judgments from TypeSafe's **Jev** model through one `evaluate` action — **0.01 credits per 1,000 input tokens**, output free. You don't write a prompt: you pass the content (`state`) and a list of questions, and every question comes back as a structured answer **with its probability**, all in one call. That makes it the cheapest way in the catalog to put a qualification, routing or scoring decision on every row, with a confidence you can threshold instead of a string you have to parse. The native `classify` action takes the same input on Cargo's own connection.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `evaluate` | 0.01 / 1,000 **input** tokens (billed on the tokens TypeSafe counts) | `state` (the record, message or document — any JSON or text), `questions[]` (required, ≥1), `model` (default `jev-latest`) | Several typed judgments about one piece of content in a single call. |

Each question has a `type`, an `id` (where the answer lands in the output, e.g. `isIcp`) and `instructions` (one question):

| `type` | Extra fields | Returns |
|---|---|---|
| `noul` (yes/no) | `trueCriteria`, `falseCriteria` (optional) | `answers.<id>.noul` — the probability the answer is yes, 0 to 1. |
| `choice` | `options[]` (2–255, each `option` + optional `description`) | `answers.<id>.choice` (highest-probability option), `confidence`, `probabilities` per option. |
| `score` | `levels[]` (2–10, ordered low → high) | `answers.<id>.score` — a probability-weighted level **index**, so it can land between levels — plus `confidence`, `legend` (index → level) and `probabilities`. |

Rate limit: 600 calls/min (spread). `model` resolves from the `listModels` autocomplete; `jev-latest` tracks the current stable release and the response reports which version answered.

## What it's for

- ✅ **Qualification at volume** — "is this an ICP fit", "which persona", "how urgent is this signal" on every row of a segment, for a fraction of an `instruct` call.
- ✅ **Routing on confidence** — branch on `answers.isIcp.noul` (`> 0.8` → auto-route, `0.4–0.8` → human review) instead of trusting a single label; pairs with [`../recipes/review-and-iterate.md`](../recipes/review-and-iterate.md).
- ✅ **Many questions, one read** — ten questions about the same record cost about the same as one, because only input tokens bill.
- ❌ **Generated text** — first lines, summaries, research notes: use `openAi` / `anthropic` `instruct`. This returns judgments, not prose.
- ❌ **Judgments that need facts the `state` doesn't hold** — it reads what you give it; enrich first.

## Patterns

### Pattern A — Three judgments on one company record

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"typesafe","actionSlug":"evaluate"}' \
  --data '{
    "state": {"name":"Acme","industry":"Logistics software","employees":240,"description":"Route optimisation for mid-size fleets"},
    "questions": [
      {"type":"noul","id":"isIcp","instructions":"Does this company sell software to businesses?"},
      {"type":"choice","id":"segment","instructions":"Which segment fits best?","options":[{"option":"SMB"},{"option":"Mid-market"},{"option":"Enterprise"}]},
      {"type":"score","id":"fit","instructions":"How well does this company match a B2B logistics ICP?","levels":["poor","weak","good","strong"]}
    ]
  }' \
  --wait-until-finished
```

In a workflow, `state` is where the expression goes (`{{nodes.<enrich-slug>}}`); the questions stay fixed text so answers stay comparable across records.

## Common pitfalls

- **Rubrics that change per record.** Questions are plain text by design — an instruction that interpolates row data produces answers you can't compare. Put the variable part in `state`.
- **One question asking three things.** "Is this a funded, US-based SaaS company?" blends three judgments into one probability. Ask three `noul` questions.
- **Big `state`, big bill.** Cost scales with input tokens only; pass the fields the questions need, not the whole enriched record with its raw payloads.

## Anti-patterns

- **Using `instruct` for a yes/no column.** A prompted LLM at 0.05–0.2 per 1,000 tokens, returning a string to parse, does worse at a job this does for 0.01 with a probability attached.

## Position in the waterfall

**SCORE / QUALIFY stage**, after ENRICH: the cheapest typed-judgment step. Prose-generating LLM steps (personalization, research synthesis) stay on the LLM providers ([`anthropic.md`](anthropic.md), [`openAi.md`](openAi.md), [`gemini.md`](gemini.md)).

## Recurring use

- **The recurring shape is a play node**, gated on rows newly entering the segment or newly enriched — never re-evaluate a whole model on a schedule; a judgment on unchanged input returns the same answer and bills again.
- **In-play gate:** run where the answer column is empty, or where the enrichment the `state` is built from changed since the last evaluation.

## Action shape

`{"kind":"connector","integrationSlug":"typesafe","actionSlug":"evaluate"}`. **No `connectorUuid` in `config`.** The native equivalent is `{"kind":"native","actionSlug":"classify"}` with the same inputs, minus `model`.
