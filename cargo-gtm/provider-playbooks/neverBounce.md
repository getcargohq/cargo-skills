---
provider: neverBounce
category: verification
last-reviewed: 2026-07-09
---

# neverBounce (NeverBounce)

Dedicated email verification. **One credits-based action, 0.2 credits** — double the priority-stack default `waterfall.verifyEmail` (0.1) and 20× the bulk option `icypeas.verifyEmail` (0.01). It earns a call in two cases: the user has an **existing NeverBounce subscription** (own API key connector — the 0.2 price stops mattering), or you want a typo-rescuing second opinion and the equal-cost alternatives (`zeroBounce`, `enrichley`) have already been spent on this list.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `verifyEmail` | 0.2 | `email` (required) | Verify a single email's deliverability, with a suggested typo correction. |

The connector also accepts your own NeverBounce API key (`apiKey`) — same action, billed to your NeverBounce plan instead of credits.

## What it's for

- ✅ **Existing NeverBounce subscription** — wire the own-key connector and use it as the house verifier.
- ✅ **Typo rescue** — output includes `suggested_correction`; a "bad" email is sometimes one transposed character from a deliverable one.
- ❌ **Default verify step** — `waterfall.verifyEmail` (0.1) leads (see [`../references/alternatives.md`](../references/alternatives.md), Verify email alternatives).
- ❌ **Second opinion at list scale** — `zeroBounce.verifyEmail` (0.1) is an independent provider at half the price.
- ❌ **Bulk verification** — `icypeas.verifyEmail` (0.01) is 20× cheaper.

## Patterns

### Pattern A — Re-verify the ambiguous subset

```bash
# Only on rows the first verifier flagged catch-all / ambiguous
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"neverBounce","actionSlug":"verifyEmail","config":{}}' \
  --records '[{"email":"alice@acme.com"},{"email":"bob@globex.com"}]' \
  --wait-until-finished
```

Keep an email when either verifier passes it cleanly; drop it only when both agree it's bad. At 0.1 + 0.2 per re-checked row, run this on the ambiguous subset only.

## Output fields

`status, result, flags[], suggested_correction, execution_time`. Filter on `result`; `flags` carries per-address diagnostic markers. The catalog dump doesn't enumerate the `result` / `flags` values — treat anything short of an unambiguous valid verdict as unproven and route it like a catch-all (send only per your sequencer's risk tolerance).

## Cost traps

- **2× the default on every row.** A 1,000-row verify costs 200 credits here vs 100 on `waterfall.verifyEmail`. Run the free pre-cull first ([`../references/contact-accuracy.md`](../references/contact-accuracy.md)) so only plausible rows reach the paid step.
- **Credits by accident.** If the user already pays NeverBounce, set up the own-key connector before batching.

## Anti-patterns

- **neverBounce as the first verify rung.** Chain order is deliberate: `waterfall.verifyEmail` (0.1) default, 0.1-tier second opinions, `icypeas` for bulk (see [`../references/stage-action-map.md`](../references/stage-action-map.md), Verify email).
- **Ignoring `suggested_correction`.** When present, re-verify the corrected address before writing the contact off — a fixed typo is the cheapest "found email" there is.
- **Trusting a finder's own "verified" flag.** Every found email goes through an independent verify step regardless (see [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md)).

## Position in the waterfall

**VERIFY stage, mid-premium rung — outside the default chain.** Default: free pre-cull → `waterfall.verifyEmail` (0.1) → `zeroBounce.verifyEmail` (0.1) second opinion → `icypeas.verifyEmail` (0.01) for bulk. `neverBounce.verifyEmail` (0.2) enters via own key or as a deliberate extra opinion.

## Action shape

`{"kind":"connector","integrationSlug":"neverBounce","actionSlug":"verifyEmail","config":{}}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — the verify step before personalization; never sequence unverified emails.
- [`../recipes/prospecting.md`](../recipes/prospecting.md) — the verify rung of the find → enrich → verify → sync spine.
