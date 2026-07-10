---
provider: enrowio
category: contact (email)
last-reviewed: 2026-07-09
---

# enrowio (Enrowio)

Email finder + verifier pair. `findEmail` (1) is an **alt mid-tier finder at the top price tier** — same cost as the priority default `FullEnrich.findEmail` (1), so it earns a call only as an extra escalation rung on stack misses or via an existing Enrow subscription. `verifyEmail` (0.1) matches the priority default `waterfall.verifyEmail` (0.1), making it another equal-cost second-opinion verifier. Input quirk to remember: the finder takes a single **`fullName`** — there is no first/last split.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `findEmail` | 1 | `fullName` (required), `companyDomain`, `companyName`, `countryCode` | Extra escalation rung when the default find-email chain misses. |
| `verifyEmail` | 0.1 | `email` (required), `countryCode` | Equal-cost second opinion on ambiguous verdicts. |

The connector also accepts your own Enrow API key (`apiKey`) — same actions, billed to your Enrow plan instead of credits.

## What it's for

- ✅ **Deep escalation on misses** — after `FullEnrich.findEmail` (1) → `hunter.findEmail` (0.5) come up empty, a differently-sourced 1-credit rung for rows worth the spend.
- ✅ **Existing Enrow subscription** — own-key connector makes both actions quota-billed.
- ✅ **Second-opinion verify** — 0.1, same as the default; independent signal on catch-all/ambiguous rows.
- ❌ **Find-email first rung** — `FullEnrich.findEmail` (1) leads the chain; at equal price enrowio brings no default advantage (see [`../references/alternatives.md`](../references/alternatives.md)).
- ❌ **Budget finder** — `hunter.findEmail` (0.5) and `icypeas.findEmail` (0.1) are the cheaper tiers.

## Patterns

### Pattern A — Escalation rung of the find-email chain

```bash
# Run ONLY on rows the earlier rungs missed
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"enrowio","actionSlug":"findEmail","config":{}}' \
  --records '[
    {"fullName":"Alice Martin","companyDomain":"acme.com"},
    {"fullName":"Bob Durand","companyName":"Globex","countryCode":"FR"}
  ]' \
  --wait-until-finished
```

`companyDomain` beats `companyName` for accuracy and accepts multiple formats (`"apple.com"`, `"https://www.apple.com"`). `countryCode` is ISO 3166 alpha-2 and matters mainly when matching by `companyName`.

### Pattern B — Second-opinion verify

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"enrowio","actionSlug":"verifyEmail","config":{}}' \
  --records '[{"email":"alice@acme.com"}]' \
  --wait-until-finished
```

The catalog dump documents no output schema for either action — inspect the first run's output (resolve the output schema via `cargo-orchestration`, or read the run's `runContext`) before filtering on field names.

## Common pitfalls

- **`fullName` only.** No `firstName`/`lastName` fields — concatenate before calling (e.g. `{{nodes.<slug>.first_name}} {{nodes.<slug>.last_name}}` in an expression).
- **camelCase inputs.** `fullName`, `companyDomain`, `countryCode` — don't reuse hunter/dropcontact's snake_case shape here.
- **Rate-limited to 60 calls/minute** (spread), with up to 8 backoff retries per call — large batches drain slowly. Poll; don't re-trigger.

## Anti-patterns

- **enrowio.findEmail as an early rung.** 1 credit buys the priority default; run this only on residual misses that are individually worth it, per the pilot gate in [`../references/cost-discipline.md`](../references/cost-discipline.md).
- **Trusting the finder's own result.** Every found email goes through the free pre-cull ([`../references/contact-accuracy.md`](../references/contact-accuracy.md)) then `waterfall.verifyEmail` (0.1) — providers grade their own homework (see [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md)).

## Position in the waterfall

- `findEmail` — **late escalation rung** of the CONTACT-stage find-email chain, outside the default order (see [`../references/stage-action-map.md`](../references/stage-action-map.md), Find email — "Alt mid-tier").
- `verifyEmail` — **VERIFY stage, alternative rung** at the default 0.1 price, alongside `zeroBounce.verifyEmail` and `enrichley.verify`.

## Action shape

`{"kind":"connector","integrationSlug":"enrowio","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/prospecting.md`](../recipes/prospecting.md) — CONTACT and VERIFY rungs of the find → enrich → verify → sync spine.
