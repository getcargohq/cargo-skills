# Writing outreach

How to use Cargo's LLM providers and AI agent surface to score, qualify, and personalize outreach. Covers provider routing, prompt patterns, and integration with sequencers.

## LLM provider routing

Cargo exposes five LLM providers as `kind: "connector"` actions with credits-based pricing. All expose a single `instruct` action that takes a prompt + model and returns text.

| Provider | Strengths | Cost (credits, cheapest model) |
|---|---|---|
| **anthropic** | High-quality reasoning, long context, structured output via JSON mode | Haiku: 0.2 / Sonnet: 2 |
| **openAi** | Broadest model selection (gpt-4o, gpt-4o-mini), tool-use friendly | Mini: 0.006 / 4o: 0.03 |
| **perplexity** | Web-grounded research with citations | Sonar: 0.3 / Sonar-pro: 1 |
| **gemini** | Cheapest large-context option | Flash: 0.01 |
| **deepSeek** | Lowest-cost reasoning when latency isn't critical | varies |

For most outreach tasks: **anthropic Haiku** (0.2) is the right default. For deep research with citations: **perplexity sonar-pro**. For batch personalization on a large list: **openAi gpt-4o-mini** (0.006 — 30× cheaper than Haiku).

## Prompt patterns

### Lead scoring

```
You are an ICP fit scorer. Given a company profile, return a JSON object:
{
  "score": <integer 0-10>,
  "reasoning": "<one sentence>",
  "qualified": <true|false>
}

Company profile:
- Domain: {domain}
- Industry: {industry}
- Employee count: {employee_count}
- Tech stack: {technographics}
- Recent funding: {funding}

ICP criteria: {icp_description}
```

Use anthropic Haiku with `output: {"type": "jsonSchema", "jsonSchema": {...}}` to enforce structured output.

### Personalization (one-paragraph opener)

```
Write a single short paragraph (≤ 60 words) opening a cold email to {first_name},
{title} at {company}. Reference the most relevant signal from the company profile
below. Sound like a peer, not a vendor. No "I hope this finds you well."

Company profile: {firmographics}
Recent signals: {signals}
ICP angle: {icp_angle}
```

Run with openAi gpt-4o-mini for batch jobs (cheap, fast). Inputs come from earlier enrichment passes — keep the prompt short to amortize cost.

### Qualification rubric

```
Return PASS or FAIL with a one-sentence reason.

Criteria (ALL must hold):
1. Company has 50–500 employees.
2. Company is in {target_industries}.
3. Company has at least one {target_role} on the team.
4. Company shows recent intent: hiring for {target_intent_role} OR using {target_tech} OR raised funding in last 12 months.
```

## Multi-pass pipeline (research → score → personalize)

Run as three sequential `action execute-batch` calls, piping each step's output into the next:

```bash
# Pass 1 — Research (perplexity for fresh web context)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"perplexity","actionSlug":"instruct","config":{}}' \
  --records '[{"prompt":"What is <company> known for? 2-sentence summary.","model":"sonar"}, ...]' \
  --wait-until-finished > /tmp/research.json

# Pass 2 — Score (anthropic with structured output)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"anthropic","actionSlug":"instruct","config":{}}' \
  --records '<scoring inputs combining enrichment + research>' \
  --wait-until-finished > /tmp/scores.json

# Pass 3 — Personalize (openAi mini for cost)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"openAi","actionSlug":"instruct","config":{}}' \
  --records '<personalization inputs for high-scored leads only>' \
  --wait-until-finished > /tmp/openers.json
```

Filter between passes — only run pass 3 on leads that scored above your threshold in pass 2. Saves credits.

## Sequencer integration

Once leads are enriched, scored, and personalized, push to a sequencer:

| Provider | Action | Notes |
|---|---|---|
| **lemlist** | `upsertLead` | Maps name/email/company directly. Custom fields go in payload. Email finder + verifier built in. |
| **lgm** (LaGrowthMachine) | `createLead` | Audience-driven; create the lead and assign to an audience. |
| **instantly** | (CRUD) | Sequencing platform, use HTTP for direct API or check the `instantlyV2` integration. |
| **smartlead** | (CRUD) | Similar to instantly. |
| **outreach** / **salesloft** | (CRUD) | Enterprise sequencers. CRM-style integrations. |
| **heyReach** | (CRUD) | LinkedIn-focused outbound. |

These are mostly free CRUD operations (no credits) — push the personalized list with `action execute-batch` and the sequencer handles the campaign.

## CRM sync

If the user wants the enriched + scored data in their CRM:

| Provider | Action | Notes |
|---|---|---|
| **hubspot** | `upsertRecords` | Map cargo columns to HubSpot properties. `enrollToSequence` for sequence enrollment. |
| **salesforce** | (CRUD) | Lead / Contact / Account objects. |
| **pipedrive** | (CRUD) | Person / Organization / Deal objects. |
| **attio** | (CRUD) | Custom-object friendly. |

CRM CRUD is free (no credits). Compose ad hoc — discover actions via `cargo-ai connection integration get <slug>` and run via `orchestration action execute-batch`.

## When to use Cargo AI agents instead of raw LLM `instruct`

Cargo's `cargo-ai` skill (capability layer) lets you create persistent agents with system prompts, tools, and memory. Use those when:

- The agent needs RAG (upload a PDF for grounded answers).
- You want multi-turn chat with persistent context.
- The same prompt runs hundreds of times — define an agent once, invoke many.

For one-shot scoring or personalization across a batch, raw `instruct` is simpler and cheaper.

See [`../../cargo-ai/SKILL.md`](../../cargo-ai/SKILL.md) for the agent surface.

## Action shape rules

Same as everywhere else: `kind: "connector"` with `integrationSlug` + `actionSlug` + `config: {}`. No `connectorUuid` in config.

For LLM `instruct` actions, the `model` field is in the per-record data, not in `config`:

```json
{
  "kind": "connector",
  "integrationSlug": "anthropic",
  "actionSlug": "instruct",
  "config": {}
}
```

Per-record:
```json
{
  "prompt": "...",
  "model": "claude-haiku-4-5-20251001",
  "maxTokens": 500
}
```
