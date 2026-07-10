---
provider: cleon1
category: enrichment
last-reviewed: 2026-07-09
---

# cleon1 (Cleon1)

Premium phone finder — **the most expensive phone rung in the catalog at 15 credits**, the last resort after every cheaper rung (`prospeo` 3 → `FullEnrich` 6 → `waterfall` 7 → `datagma` 8) has missed ([`../references/stage-action-map.md`](../references/stage-action-map.md)). Both actions cost the same 15; the difference is the anchor: a LinkedIn URL (`findPhoneFromLinkedin`, the LinkedIn-anchored option the stage map recommends) or name + company (`findPhone`). Phone is the guarded lever in [`../references/cost-discipline.md`](../references/cost-discipline.md) — cleon1 enters a plan **only on explicit user request, on qualified high-value leads only**.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `findPhoneFromLinkedin` | 15 | `linkedinUrl` (required) | Phone from a LinkedIn URL — the strongest anchor; prefer it when you hold the URL. |
| `findPhone` | 15 | `firstName, lastName` (required), `companyName`, `companyDomain` | Phone from name, optionally refined with company info, when no LinkedIn URL exists. |

## What it's for

- ✅ **Final phone escalation** — a handful of high-value, qualified leads where the entire cheaper chain came back empty and the user explicitly asked for phones.
- ✅ **LinkedIn-anchored precision** — `findPhoneFromLinkedin` keys on the profile URL itself, so there's no name-ambiguity risk; output echoes `first_name` / `last_name` / `company_name` / `company_domain` for a sanity check, plus `direct_phone`.
- ❌ **Any default pipeline** — at 15/record, one ungated 100-row batch is 1,500 credits. The chain starts at `prospeo.findPhone` (3); see [`../references/alternatives.md`](../references/alternatives.md).
- ❌ **Email-anchored lookup** — there is no email input on either action; if all you hold is an email, `datagma.findPhone` (8) takes one ([`datagma.md`](datagma.md)).

## Patterns

### Pattern A — LinkedIn-anchored last rung (gated)

```bash
# Explicit user request + qualified leads only — 15 credits each
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cleon1","actionSlug":"findPhoneFromLinkedin","config":{}}' \
  --records '[{"linkedinUrl":"https://linkedin.com/in/alicesmith"}]' \
  --wait-until-finished
```

### Pattern B — Name + company when no URL exists

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cleon1","actionSlug":"findPhone","config":{}}' \
  --records '[{"firstName":"Alice","lastName":"Smith","companyName":"Acme","companyDomain":"acme.com"}]' \
  --wait-until-finished
```

Only `firstName` + `lastName` are required — but a bare name is the weakest possible anchor at the highest possible price. Always pass `companyName` and/or `companyDomain` when you have them.

## Common pitfalls

- **15 credits is the catalog's phone ceiling.** That's ~2× `datagma` (8), 5× `prospeo` (3), or 150 `waterfall.verifyEmail` calls. Never reach for cleon1 first; run it only on the residue of the full chain.
- **camelCase inputs** — `linkedinUrl`, `firstName`, `companyDomain`. Don't reuse other providers' snake_case shapes.
- **No email input.** Neither action accepts an email identifier; route email-anchored phone lookups to `datagma.findPhone` (8) instead.
- **Name-only `findPhone` on common names** — with no company anchor, a wrong-person match still bills 15. Verify the echoed `company_name` / `linkedin_url` in the output against your record.

## Anti-patterns

- **Including cleon1 in a recipe's default chain.** Every recipe gates phone lookup behind qualification and explicit request; the premium rung doubles down on that gate.
- **Batch-running it "to fill the phone column".** Pilot on ≤5 rows; if the cheaper rungs' misses were data-quality misses (bad URLs, stale companies), cleon1 will miss on the same rows — for 15 credits each.

## Position in the waterfall

- `findPhoneFromLinkedin` / `findPhone` — **CONTACT stage, terminal rung** of the phone chain: `prospeo` (3) → `FullEnrich` (6) → `waterfall` (7) → `datagma` (8) → **cleon1 (15)**. Explicit user request only, qualified leads only.
- Phones don't flow to VERIFY (that's an email stage) — but the record they attach to should already be verified before you spend 15 credits on it.

## Action shape

`{"kind":"connector","integrationSlug":"cleon1","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
