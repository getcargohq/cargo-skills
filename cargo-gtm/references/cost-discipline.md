# Cost discipline — pilot gate, receipts, and spend rules

Canonical spend rules for every credits-based action in this skill. Recipes and playbooks link here instead of restating them. These are **mandatory behaviors**, not advice: an agent that skips the pilot gate or the receipt is misusing the skill.

## 1) The pilot → approval → full-run gate (blocking)

Required order for **every** paid batch (anything beyond a handful of records, or any action whose cost is unknown):

```
1. SAMPLE    Run a small slice of the EXACT input data through the EXACT config.
             1–3 rows to prove one action's config shape.
             10–20 records before any BATCH — one row can't show a hit-rate,
             and a batch's cost is (per-row cost × hit-rate) × N.
2. APPROVAL  Present the approval message (format below). Wait for the user.
             It must state the RECORD COUNT to be enrolled and the CREDIT
             ESTIMATE for them.
3. FULL RUN  Only after explicit approval, fan out across the remaining records.
```

Size the pool before you can quote either number — `segment get <uuid>` → `recordsCount`, a `storage query execute` count, or `wc -l` on the input file. All free. Approval of the sample is **not** approval of the full run; ask again, explicitly. Batch-sampling mechanics per data kind (`filter` + `limit`, `recordIds`, sliced `records`, truncated CSV) live in [`../../cargo-orchestration/SKILL.md`](../../cargo-orchestration/SKILL.md) → "Create a batch".

The approval message has four required sections. **If any section is missing, stay in AWAIT_APPROVAL — do not run paid or cost-unknown actions.**

```
ASSUMPTIONS
  Define every judgment call operationally, not vaguely.
  Bad:  "best contact per company"
  Good: "best contact = highest-ranked current employee matching RevOps/GTM-ops
         titles, weighted Chief > VP > Head > Director > Lead > Manager"
  Declare data decisions already made (rows dropped and why, domains fixed)
  and the cost trade-off chosen (cheap chain vs premium play, and why).

SAMPLE RESULT (verbatim)
  Rows run, credits spent, per-row cost, hit-rate — observed numbers,
  not catalog numbers. Paste a preview of the actual output rows.

CREDITS · SCOPE · CAP
  Both numbers, always, in one line the user can decide on:
    - HOW MANY records the full run would enroll (the counted pool minus
      the sample), and
    - WHAT IT COSTS = observed per-row cost × remaining rows.
  Reconcile against the ACTUAL balance (see §2) — if the estimate exceeds
  the balance, say so BEFORE the user hits it mid-run.

APPROVE?
  Offer 3 shaped choices, never bare yes/no:
    1. Run until the budget cap is hit (state how many rows that covers).
    2. Top up first, then run everything clean.
    3. Trim scope to fit the budget (propose the trimming heuristic —
       e.g. "keep the ~45 companies with funding data + RevOps team ≥ 2").
  Option 3 is usually the operator move: reshape scope instead of asking
  for more budget.
```

Check the balance before quoting an estimate:

```bash
cargo-ai billing subscription get
# remaining = subscriptionAvailableCreditsCount - subscriptionCreditsUsedCount
```

## 2) Per-run receipt (after every paid action)

After **every** paid action or batch — pilot included — report:

1. **Credits spent + balance remaining** — "12.4 credits spent, ~31 left."
2. **Hit-rate** — "found 34 emails of 40 contacts (85%)", per field when the action returns several ("RevOps count 67/70 · funding 31/70"). Flag rows to distrust, don't silently include them.
3. **Estimate vs actual, with the why** — only when they diverge: "cost 7.5 credits vs 3–5 estimated: theirStack billed per returned job posting, and 12 companies had >5 postings each."

Prefer the billing source of truth over your own arithmetic:

```bash
cargo-ai billing usage get-metrics --workflow-uuid <uuid>
```

A receipt is not optional bookkeeping — it is what makes the next-step suggestion and the next approval trustworthy.

**On a new account, frame the balance against the free tier.** A new workspace starts with **100 free credits, no card** — so "12.4 spent, 87.6 of your 100 free credits left" is the receipt a first-time user can actually act on, where "87.6 remaining" is a number with no scale. Two consequences for how you spend them:

- **Lead with the cheap rungs harder than usual.** 100 credits is ~5,000 sourced leads or ~50 fully enriched contacts — the same budget, two orders of magnitude apart depending on the chain. A first session that burns the tier on `findPhone` (6–7/lookup) leaves the user with nothing to try next.
- **Say what's left in the tier when proposing the next step.** "With ~88 free credits left, verifying all 400 of these runs ~40" is a decision the user can make in one word; "that'll cost about 40 credits" is not.

## 3) Over-provision 1.4×N, then filter — never chase misses

Provider coverage is a property of the target company, not something more retries can overcome. Contact search typically misses 15–20% of companies; email waterfalls miss another 5–10% of contacts.

- To deliver N complete rows, **source ~1.4×N** and let the misses fall out.
- **Drop incomplete rows instead of re-running them** through more providers — the marginal credits go to the same rows that already missed.
- Stop at ~80% of target and filter, rather than restarting the chain for the tail.

## 4) Count first, pay second

Size the pool before paying for it:

- Use free lookups (`connection integration list-actions`, model SQL counts, existing segments) and the cheapest search page before any paid pull.
- **Keep `limit`/page sizes strict** — search actions are billed on *returned* rows, not on matched totals. Where a provider returns a `total_count` alongside results, a 1-row request sizes the whole TAM for the price of one row.
- Never pull a full result set "to see what's there." Decide the filter from a small page, then pull exactly the scope approved in §1.

## 5) Provider-billing rules

- **Prefer pay-on-success actions** when coverage is uncertain. If a provider bills per attempt, prove quality on the pilot before scaling.
- **Phone is the guarded lever** — the escalation tier runs 3–7 credits/record, ~10× email. `aiArk.findMobilePhone` (0.5, mobile-only, LinkedIn-URL or domain+name anchored) is the cheap first rung and bills 0 on a miss, but the rule is unchanged: never include phone lookup in a default chain; it enters a plan only on explicit user request, on qualified leads only.
- Cheap-but-low-hit-rate providers are not savings: total spend is dominated by misses, not per-call price (see [`alternatives.md`](alternatives.md)).

## 6) Context discipline

Never read a large CSV/JSON export into the conversation context — it's the most common way to blow a session. Inspect exports with `head`, `jq`, or a storage SQL query, and pass files by path. Receipts and previews (a few rows) belong in context; datasets don't.

## Where this gate is applied

- The plan agent ([`../agents/execution-plan-creator.md`](../agents/execution-plan-creator.md)) emits plans in the §1 approval format.
- Every recipe's batch step assumes the gate ran; per-recipe credit-budget tables give the *catalog* estimate, the pilot gives the *observed* one — trust the pilot.
- Waterfall chains add their own stop-early rules on top: see [`waterfall-strategy.md`](waterfall-strategy.md).
