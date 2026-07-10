---
provider: datagma
category: enrichment
last-reviewed: 2026-07-09
---

# datagma

Contact-info finder: one mid-tier email action and two premium phone actions. `findEmail` (1) is an **alt mid-tier rung** of the find-email chain ([`../references/stage-action-map.md`](../references/stage-action-map.md)) — same price as the `FullEnrich` default, so it earns a slot only as an escalation with a different underlying source. `findPhone` / `findPhoneAndEmail` (8) are the **second-most-expensive phone tier in the catalog** — last resort before `cleon1` (15), never the first stop.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `findEmail` | 1 | `firstName, lastName, companyName` (all required) | Escalation rung on the find-email chain when cheaper sources miss. |
| `findPhone` | 8 | `email`, `personLinkedInUrl` | Phone lookup from an email or LinkedIn URL. **Last-rung pricing.** |
| `findPhoneAndEmail` | 8 | `firstName, lastName, companyName` (all required) | Phone + email in one call from name + company. |

## What it's for

- ✅ **Find-email escalation** — a different index than `FullEnrich` / `hunter`, so it can hit where the standard chain (FullEnrich 1 → hunter 0.5 → peopleDataLabs 3) misses. Slot it beside the other 1-credit alternates ([`../references/alternatives.md`](../references/alternatives.md), "Alt mid-tier").
- ✅ **Phone from an identifier the cheaper rungs rejected** — `findPhone` takes `email` or `personLinkedInUrl`; useful for the handful of high-value leads left after `prospeo` → `FullEnrich` → `waterfall` all missed.
- ❌ **First-stop anything** — every datagma action has a cheaper chain-leader: email starts at `FullEnrich.findEmail` (1, best hit rate) with `hunter` (0.5) behind it; phone starts at `prospeo.findPhone` (3).

## Patterns

### Pattern A — Escalation rung of the find-email chain

```bash
# Only on rows where the earlier rungs returned nothing
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"datagma","actionSlug":"findEmail","config":{}}' \
  --records '[
    {"firstName":"Alice","lastName":"Smith","companyName":"Acme"},
    {"firstName":"Bob","lastName":"Jones","companyName":"Globex"}
  ]' \
  --wait-until-finished
```

All three fields are required — no domain-only or full-name variants. Every hit still flows to VERIFY: free pre-cull, then `waterfall.verifyEmail` (0.1).

### Pattern B — Last-rung phone lookup (gated)

```bash
# Qualified, high-value leads only — 8 credits each
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"datagma","actionSlug":"findPhone","config":{}}' \
  --records '[{"personLinkedInUrl":"https://linkedin.com/in/alicesmith","email":"alice@acme.com"}]' \
  --wait-until-finished
```

Neither field is marked required in the schema — pass at least one identifier; both together give the best match odds.

## Common pitfalls

- **camelCase inputs** — `firstName`, `lastName`, `companyName`, `personLinkedInUrl` (note the capital `In`). Don't reuse the snake_case shapes from `waterfall` / `hunter` here.
- **`findPhoneAndEmail` saves nothing.** 8 credits — more than `FullEnrich.findPhoneAndEmail` (7) and the same as `findPhone` alone, so the "free" email is only worth it if you'd otherwise pay both. If the email rung already ran, calling it re-bills work you've done.
- **`companyName`, not domain** — `findEmail` / `findPhoneAndEmail` key on the company **name**; there is no domain input, so ambiguous names ("Apex") depress the hit rate.
- **8 credits buys a lot elsewhere** — the whole cheaper phone chain (`prospeo` 3 + `FullEnrich` 6 escalation is 9 for two independent attempts) or 80 verifications. Gate per [`../references/cost-discipline.md`](../references/cost-discipline.md).

## Anti-patterns

- **Phone actions in a default pipeline.** Phone lookup is gated to qualified leads in every recipe; at 8/record an ungated batch is the fastest way to burn a budget.
- **Skipping verification because the email "came with" the phone.** `findPhoneAndEmail` output is a finder result like any other — VERIFY stage (`waterfall.verifyEmail`, 0.1) still applies.

## Position in the waterfall

- `findEmail` — **CONTACT stage, escalation rung**: after `FullEnrich` (1) and the 0.5 mid-tiers (`hunter` / `prospeo` / `findyMail` / `leadMagic`), beside the other 1-credit alternates. Demote it for the batch if it misses on the pilot's first ~10 rows.
- `findPhone` / `findPhoneAndEmail` — **CONTACT stage, last rung** of the phone chain: `prospeo` (3) → `FullEnrich` (6) → `waterfall` (7) → **datagma (8)** → `cleon1` (15, premium).
- Every found email flows to **VERIFY** (`waterfall.verifyEmail`, 0.1) before activation.

## Action shape

`{"kind":"connector","integrationSlug":"datagma","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
