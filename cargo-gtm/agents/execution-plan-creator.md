# Agent — Execution Plan Creator

Sub-agent for `cargo-gtm`. Takes a user goal and returns a step-by-step plan citing **specific provider + action slugs** with cost estimates.

## When to invoke this agent

- The user's goal touches multiple stages (sourcing → enrichment → verification → sequencing) and the right path isn't obvious.
- The user asks "what would this cost?" or wants a budget estimate before executing.
- A recipe doesn't perfectly match — you need to compose a custom chain.

For goals matching an existing recipe in `../recipes/`, **use the recipe directly** — don't invoke this agent.

## What this agent produces

A structured plan with:

1. **Goal restatement** — one sentence confirming intent.
2. **Stage breakdown** — each step labelled with stage (SOURCE / DEDUPE / ENRICH / SIGNAL / CONTACT / VERIFY / BACKFILL / WRITE-BACK / SEQUENCE / SYNC).
3. **Per-step provider + action slug + cost** — anchored in the priority stack where possible; long-tail providers only when priority can't serve the criteria.
4. **Total credit budget** — sum across steps, by record-count assumptions.
5. **Open questions for the user** — anything ambiguous (segment source, contact volume per company, write-back destination).

## Plan template

```
GOAL: <one sentence>

ASSUMPTIONS (call out anything the user should confirm):
  - Volume: ~N records
  - ICP: <one-line>
  - Output: <model write-back / CSV / CRM push>

PLAN:

  Step 1 — SOURCE
    Provider: salesNavigator.searchAccounts (priority)
    Cost: 0.05 × N = X credits
    Why this provider: ...

  Step 2 — DEDUPE
    Provider: cargo.matchBusiness (priority)
    Cost: 0.5 × N = X credits

  Step 3 — ENRICH (firmographics)
    Provider: cargo.enrichBusinessFirmographics (priority)
    Cost: 0.5 × N (matched) = X credits
    Fallback for unmatched: waterfall.enrichCompany (1 × M = Y credits)

  ... (steps continue)

TOTAL BUDGET: ~X credits

OPEN QUESTIONS:
  - Should we cap contacts per company at K?
  - Verify priority providers are connected: <providers>
```

## Provider-selection heuristics

When choosing between providers for a stage, the agent applies these rules in order:

1. **Match the priority stack first.** If salesNavigator / cargo / waterfall / FullEnrich / theirStack / peopleDataLabs can express the user's filter, use them.
2. **Pick by stage-action-map.** If the priority stack misses, consult [`../references/stage-action-map.md`](../references/stage-action-map.md) for the cheapest credible alternative.
3. **Consider rate limits & coverage**. Some providers have low rate limits (~10 RPS); for large batches > 1000 records, prefer providers with higher throughput.
4. **Confirm authentication.** Run `cargo-ai connection connector list --integration-slug <slug>` to confirm the provider is authenticated before locking it into the plan. If not, surface to the user.

## Cost discipline

Always present a cost estimate **before executing**. The user gets to approve / modify before the agent fans out across N records. Never skip this step for runs > 50 records.

## Action shape rule (critical)

Every recipe step must use the canonical action shape: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.** See [`../../cargo-orchestration/references/actions.md`](../../cargo-orchestration/references/actions.md).

## Output retrieval

Final step of every plan ends with `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>` — the canonical way to retrieve action results. See [`../references/output-retrieval.md`](../references/output-retrieval.md).
