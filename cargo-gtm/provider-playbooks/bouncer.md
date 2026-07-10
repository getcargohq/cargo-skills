---
provider: bouncer
category: verification
last-reviewed: 2026-07-09
---

# bouncer (Bouncer)

Dedicated email verification. **One credits-based action, 0.3 credits** — 3× the priority-stack default `waterfall.verifyEmail` (0.1) and 30× the bulk option `icypeas.verifyEmail` (0.01), making it the second-most-expensive verify tier in the catalog (only `hunter.verifyEmail` at 1 costs more). On credits it almost never earns a call; its real audience is users with an **existing Bouncer subscription** who wire their own API key into a connector and run verification on their plan instead of cargo credits.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `verifyEmail` | 0.3 | `email` (required) | Verify a single email's deliverability. |

The connector also accepts your own Bouncer API key (`apiKey`) — same action, billed to your Bouncer plan instead of credits.

## What it's for

- ✅ **Existing Bouncer subscription** — the user already pays Bouncer; create an own-key connector and the 0.3-credit price stops mattering.
- ✅ **Deliberate extra opinion on high-value contacts** — a different underlying provider when `waterfall.verifyEmail` and `zeroBounce.verifyEmail` disagree and the contact is worth a third check.
- ❌ **Default verify step** — `waterfall.verifyEmail` (0.1) is the priority default (see [`../references/alternatives.md`](../references/alternatives.md), Verify email alternatives).
- ❌ **Second opinion by default** — `zeroBounce.verifyEmail` (0.1) gives an independent verdict at a third of the price.
- ❌ **Bulk verification** — `icypeas.verifyEmail` (0.01) is 30× cheaper on large lists.

## Patterns

### Pattern A — Third opinion on a contested subset

```bash
# Only on rows where waterfall and zeroBounce disagreed, and the contact justifies 0.3
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"bouncer","actionSlug":"verifyEmail","config":{}}' \
  --records '[{"email":"alice@acme.com"},{"email":"bob@globex.com"}]' \
  --wait-until-finished
```

The catalog dump documents no output schema for this action — inspect the first run's output (resolve the action's output schema via `cargo-orchestration`, or read the run's `runContext`) before filtering on field names.

## Cost traps

- **0.3 per row compounds fast.** A 1,000-row verify costs 300 credits here vs 100 on `waterfall.verifyEmail` and 10 on `icypeas.verifyEmail`. Run the free pre-cull first ([`../references/contact-accuracy.md`](../references/contact-accuracy.md)) and reserve bouncer for the narrow subset that justifies it.
- **Credits by accident.** If the user mentions a Bouncer account, set up the own-key connector before batching — running their existing tool on cargo credits at 0.3/row is pure waste.

## Anti-patterns

- **bouncer as the first verify rung.** The default chain starts at `waterfall.verifyEmail` (0.1); premium-priced alternatives are swapped in deliberately, never by default (see [`../references/stage-action-map.md`](../references/stage-action-map.md), Verify email).
- **Skipping verification because a finder said "verified".** Providers grade their own homework — every found email goes through an independent verify step (see [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md)).

## Position in the waterfall

**VERIFY stage, premium rung — outside the default chain.** Default: free pre-cull → `waterfall.verifyEmail` (0.1) → `zeroBounce.verifyEmail` (0.1) second opinion → `icypeas.verifyEmail` (0.01) for bulk. `bouncer.verifyEmail` (0.3) enters only via own key or a deliberate third opinion.

## Action shape

`{"kind":"connector","integrationSlug":"bouncer","actionSlug":"verifyEmail","config":{}}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — the verify step before personalization; never sequence unverified emails.
- [`../recipes/prospecting.md`](../recipes/prospecting.md) — the verify rung of the find → enrich → verify → sync spine.
