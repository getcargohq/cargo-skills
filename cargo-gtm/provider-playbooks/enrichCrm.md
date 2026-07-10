---
provider: enrichCrm
category: enrichment
last-reviewed: 2026-07-09
---

# enrichCrm (EnrichCRM)

Flat-rate generalist: four actions, all **1 credit fixed** — person enrichment, email finding, company enrichment, and funding data. None leads its chain: `findEmail` sits beside the other 1-credit alternates on the find-email chain ([`../references/stage-action-map.md`](../references/stage-action-map.md), "CRM-friendly fallback"), and `getFunding` is the fallback behind `cargo.enrichBusinessFundingAndAcquisitions` (0.5) on the funding signal — the role it plays in [`../recipes/funding-watch.md`](../recipes/funding-watch.md). Value here is breadth at a predictable price, not a chain-leading hit rate.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrichPerson` | 1 | `email` **or** `fullName` + `domainName` **or** `firstName` + `lastName` + `domainName` | LinkedIn-profile-flavored person enrichment (headline, role/seniority, company history, skills). |
| `findEmail` | 1 | `firstName, lastName, fullName, company, linkedInSlug, findEmailV2Country` | Escalation rung of the find-email chain, same price as the `FullEnrich` default. |
| `enrichCompany` | 1 | `domainName` (required), booleans `filmographic, tech, financial, companyFrench` | Company enrichment with toggleable data blocks. |
| `getFunding` | 1 | `domain` (required) | Financial + funding data — funding-signal fallback after cargo native. |

## What it's for

- ✅ **Funding fallback** — `getFunding` when cargo's match misses a private company; cargo native has wider venture-backed coverage, so escalate here only on misses.
- ✅ **Find-email escalation** — a different underlying source at the same 1-credit price as `FullEnrich.findEmail`; slot it beside `datagma` / `enrowio` in [`../references/alternatives.md`](../references/alternatives.md).
- ✅ **Person enrichment from an email you already hold** — `enrichPerson` output is rich on profile fields (`extractedRole`, `extractedSeniority`, `headline`, `pastCompaniesDetails`, `skillsList`) useful for scoring and personalization.
- ❌ **First-stop anything** — the priority stack (`cargo` native → `waterfall` → `peopleDataLabs`) leads every stage this provider touches.

## Patterns

### Pattern A — Funding fallback (from funding-watch)

```bash
# Only on rows where cargo.enrichBusinessFundingAndAcquisitions missed
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"getFunding","config":{}}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished
```

### Pattern B — Find-email escalation rung

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"findEmail","config":{}}' \
  --records '[{"firstName":"Alice","lastName":"Smith","company":"Acme","findEmailV2Country":"France"}]' \
  --wait-until-finished
```

Every hit still flows to VERIFY: free pre-cull, then `waterfall.verifyEmail` (0.1).

## Common pitfalls

- **`domainName` vs `domain`** — `enrichPerson` / `enrichCompany` key on `domainName`; `getFunding` keys on `domain`. Mixing them up silently drops the identifier.
- **`linkedInSlug` is a slug, not a URL** — `findEmail` wants the profile slug (`alicesmith`), not `https://linkedin.com/in/alicesmith`. Note the capital `In`.
- **`filmographic` is the literal schema key** on `enrichCompany` — yes, spelled with an `l`; `firmographic` is not a recognized field.
- **`enrichPerson` marks nothing required** — the schema accepts any subset, but the action needs one full identifier combo (email, or full name + domain, or first + last + domain); partial combos waste the credit.

## Anti-patterns

- **Running `enrichCompany` + `getFunding` on every row.** `enrichCompany`'s `financial: true` toggle and `getFunding` overlap; if you only need funding data, one credit suffices.
- **Skipping verification on `findEmail` hits.** 1-credit finders feed the same VERIFY stage as every other rung.

## Position in the waterfall

- `findEmail` — **CONTACT stage, alt 1-credit rung** beside `FullEnrich` (1, default) after the 0.5 mid-tiers.
- `enrichPerson` / `enrichCompany` — **ENRICH, fallback rungs** behind the stack (`cargo` → `waterfall` → `peopleDataLabs`).
- `getFunding` — **SIGNAL (funding), fallback** behind `cargo.enrichBusinessFundingAndAcquisitions` (0.5).

## Action shape

`{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
