---
provider: enrichCrm
category: enrichment
last-reviewed: 2026-07-09
---

# enrichCrm (EnrichCRM)

Flat-rate generalist: four actions, all **1 credit fixed** — person enrichment, email finding, company enrichment, and funding data. `findEmail` sits beside the other 1-credit alternates on the find-email chain ([`../references/stage-action-map.md`](../references/stage-action-map.md), "CRM-friendly fallback"), but `getFunding` **leads** the funding signal — it is the only credits-based funding action in the catalog, which is the role it plays in [`../recipes/funding-watch.md`](../recipes/funding-watch.md). Value here is breadth at a predictable price.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrichPerson` | 1 | `email` **or** `fullName` + `domainName` **or** `firstName` + `lastName` + `domainName` | LinkedIn-profile-flavored person enrichment (headline, role/seniority, company history, skills). |
| `findEmail` | 1 | `firstName, lastName, fullName, company, linkedInSlug, findEmailV2Country` | Escalation rung of the find-email chain, same price as the `FullEnrich` default. |
| `enrichCompany` | 1 | `domainName` (required), booleans `filmographic, tech, financial, companyFrench` | Company enrichment with toggleable data blocks. |
| `getFunding` | 1 | `domain` (required) | Financial + funding data — the catalog's only credits-based funding action. |

## What it's for

- ✅ **Funding signal** — `getFunding` is where every funding question in this pack lands. Coverage is strong on venture-backed companies and structurally thin on bootstrapped ones; there is no cheaper rung to try first.
- ✅ **Find-email escalation** — a different underlying source at the same 1-credit price as `FullEnrich.findEmail`; slot it beside `datagma` / `enrowio` in [`../references/alternatives.md`](../references/alternatives.md).
- ✅ **Person enrichment from an email you already hold** — `enrichPerson` output is rich on profile fields (`extractedRole`, `extractedSeniority`, `headline`, `pastCompaniesDetails`, `skillsList`) useful for scoring and personalization.
- ❌ **First-stop person or company enrichment** — the priority stack (`aiArk` → `waterfall` → `peopleDataLabs`) leads both of those stages. Funding is the exception: `getFunding` is first-stop because it is only-stop.

## Patterns

### Pattern A — Funding signal (from funding-watch)

```bash
# Gate on last_funding_round_at so recently-pulled rows are skipped
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"getFunding"}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished
```

### Pattern B — Find-email escalation rung

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"findEmail"}' \
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
- `enrichPerson` / `enrichCompany` — **ENRICH, fallback rungs** behind the stack (`aiArk` → `waterfall` → `peopleDataLabs`).
- `getFunding` — **SIGNAL (funding), sole rung**: no cheaper credits-based funding action exists.

## Recurring use

The one action here with a real monitor shape is `getFunding` — funding is an event stream, not a static field.

- **Scheduled pull:** re-run `getFunding` (1) **weekly** on the watched-companies segment, per [`../recipes/funding-watch.md`](../recipes/funding-watch.md); cadence defaults in [`../recipes/save-as-play.md`](../recipes/save-as-play.md). At 1 credit a row with no since-timestamp feed, cadence is the only cost dial — daily re-bills unchanged data six days in seven. Diff each pull against the stored funding fields so only *changed* rows trigger paid downstream steps.
- **In-play gate:** the other three actions are per-record enrichment — `findEmail` only where `email` is still empty, `enrichPerson` / `enrichCompany` only where their target profile/firmographic fields are unfilled. Re-running them on a timer re-bills stable data.

## Action shape

`{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"<slug>"}`. **No `connectorUuid` in `config`.**
