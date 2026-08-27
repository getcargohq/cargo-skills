---
provider: kitt
category: verification (email)
last-reviewed: 2026-07-09
---

# kitt (Kitt)

Dedicated email verification — **one action, 0.05 credits**, half the price of the priority-stack default `waterfall.verifyEmail` (0.1) and 5× the price of the catalog floor `icypeas.verifyEmail` (0.01). Its output splits the verdict into `validIdentity` and `validSMTP`, so it's the budget rung when you want *why*, not just pass/fail. Listed as the cheaper verify alternative in [`../references/alternatives.md`](../references/alternatives.md) (Verify email alternatives).

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `verifyEmail` | 0.05 | `email` | Verify one email's deliverability. Output: `validity`, `validIdentity`, `validSMTP`, `mxDomain`, `reason`, `reasonCode`, `displayText`. |

## What it's for

- ✅ **Cheap verify with diagnostics** — `icypeas` (0.01) is cheaper but kitt's `validIdentity` / `validSMTP` split plus `reason`/`reasonCode` explain the verdict for triage.
- ✅ **High-throughput lists** — rate limit is 100 calls/**second** (spread), the fastest verifier in this group; large batches don't crawl.
- ✅ **Second opinion at low cost** — re-check ambiguous verdicts from `waterfall.verifyEmail` for 0.05 instead of another 0.1.
- ❌ **Default verify rung** — `waterfall.verifyEmail` (0.1, multi-source) is the priority-stack default; swap kitt in deliberately for budget or second-opinion reasons.
- ❌ **Absolute cheapest bulk pass** — `icypeas.verifyEmail` (0.01) wins when volume dominates and diagnostics don't matter.

## Patterns

### Pattern A — Batch verify before sequencing

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"kitt","actionSlug":"verifyEmail"}' \
  --records '[{"email":"alice@acme.com"},{"email":"bob@globex.com"}]' \
  --wait-until-finished
```

Filter on `validity`; when it's ambiguous, `validIdentity` vs `validSMTP` tells you whether the mailbox or the server is the problem, and `reason` / `reasonCode` give the provider's explanation.

### Pattern B — Single lookup

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"kitt","actionSlug":"verifyEmail"}' \
  --data '{"email":"alice@acme.com"}' \
  --wait-until-finished
```

## Common pitfalls

- **`validity` is a string, not a boolean.** Inspect actual values on a pilot batch before writing filters — don't assume `"valid"`/`"invalid"` is the full enum.
- **SMTP-pass ≠ mailbox-proven.** `validSMTP: true` with a weak `validIdentity` is the catch-all pattern; route those per your sequencer's risk tolerance rather than blanket-sending.
- **Verify even "verified" finds.** Email finders grade their own homework — every found email goes through a verify step regardless of the finder's flag ([`../references/waterfall-strategy.md`](../references/waterfall-strategy.md)).

## Position in the waterfall

**VERIFY stage, budget rung.** `icypeas.verifyEmail` (0.01, bulk floor) → **kitt (0.05, cheap + diagnostics)** → `waterfall.verifyEmail` (0.1, priority default) → `zeroBounce.verifyEmail` (0.1, second opinion). See [`../references/stage-action-map.md`](../references/stage-action-map.md), Verify email.

## Recurring use

Verification recurs per **send wave**, not per calendar — no scheduled fit beyond that.

- **Re-verify gate:** run `verifyEmail` (0.05) only on rows entering a send wave whose last clean verdict is stale — never on a blanket timer that re-bills the whole list.
- **In-play gate:** filter to rows where the kitt `validity` output is still empty, or gate on a verify-timestamp column older than the wave threshold.
- **Time-sensitivity:** verdicts decay slowly (mailboxes churn, not daily) — and when a pre-wave pass *is* due, the 100 calls/second rate limit keeps it fast.

## Action shape

`{"kind":"connector","integrationSlug":"kitt","actionSlug":"verifyEmail"}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — the VERIFY step before personalization; never sequence unverified emails.
- [`../recipes/prospecting.md`](../recipes/prospecting.md) — the verify rung of the find → enrich → verify → sync spine.
