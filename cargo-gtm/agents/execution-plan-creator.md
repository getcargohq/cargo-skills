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
2. **Assumptions defined operationally** — every judgment call spelled out as a testable rule (not "best contact" but "highest-ranked current employee matching RevOps/GTM-ops titles, weighted Chief > VP > Head > Director > Lead > Manager"), plus data decisions already made and the cost trade-off chosen.
3. **Stage breakdown** — each step labelled with stage (SOURCE / DEDUPE / ENRICH / SIGNAL / CONTACT / VERIFY / BACKFILL / WRITE-BACK / SEQUENCE / SYNC), with provider + action slug + cost per step — anchored in the priority stack where possible; long-tail providers only when priority can't serve the criteria.
4. **Pilot step + budget reconciliation** — the plan's first executed step is always a 1–3 row pilot; the full-run estimate is grounded in the pilot's observed per-row cost and reconciled against the actual balance (`billing subscription get`). If the estimate exceeds the balance, the plan says so up front.
5. **Approval question with 3 shaped choices** — run-until-cap / top-up-then-run / trim-scope-to-fit (with a proposed trimming heuristic). Never bare yes/no.
6. **Open questions for the user** — anything ambiguous (segment source, contact volume per company, write-back destination).

## Plan template

```
GOAL: <one sentence>

ASSUMPTIONS (operational definitions — anything the user should confirm):
  - Volume: ~N records
  - ICP: <one-line>
  - "<judgment call>" = <testable rule>
  - Dropped/fixed in the input: <rows dropped and why, domains corrected>
  - Cost trade-off: <e.g. cheap email chain (0.14 cr) over premium play (1.4 cr) — why>
  - Output: <model write-back / CSV / CRM push>

PLAN:

  Step 0 — PILOT (always first)
    Run steps 1–N on 2 rows of the exact input.
    Report: credits spent, per-row cost, hit-rate, output preview.

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

TOTAL BUDGET: ~X credits (catalog estimate — refine from the pilot's observed per-row cost)
BALANCE CHECK: remaining credits = subscriptionAvailableCreditsCount − subscriptionCreditsUsedCount
  → covers the run? If short, say by how much BEFORE running.

APPROVE FULL RUN? (pick one)
  1. Run until the cap — ~K of N rows fit the current balance; resumable, keeps successful rows.
  2. Top up first, then run all N clean.
  3. Trim to the best ~M rows so the budget covers everything (heuristic: <e.g. funded + RevOps ≥ 2 first>).

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

The plan IS the approval gate: pilot first, estimate reconciled against the balance, 3 shaped choices, and no paid fan-out until the user picks one. Full rules (receipts, 1.4×N over-provision, count-first sizing, the phone guard): [`../references/cost-discipline.md`](../references/cost-discipline.md).

## Action shape rule (critical)

Every recipe step must use the canonical action shape: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.** See [`../../cargo-orchestration/references/examples/actions.md`](../../cargo-orchestration/references/examples/actions.md).

## Output retrieval

Final step of every plan ends with `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>` — the canonical way to retrieve action results. See [`../references/output-retrieval.md`](../references/output-retrieval.md).
