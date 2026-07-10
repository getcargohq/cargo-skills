---
provider: rocketreach
category: enrichment
last-reviewed: 2026-07-09
---

# rocketreach (RocketReach)

Single-action person lookup: `lookupPerson` (1 credit) resolves a person **and their company** from flexible identifiers — name + employer, LinkedIn URL, email, or a US healthcare **NPI number** — returning contact channels (`emails`, `phones`, `recommended_email`, `current_work_email`), profile data, and `job_history` in one call. It's a 1-credit ENRICH fallback beside `apolloio.enrichPerson`; the priority stack (`cargo` native → `waterfall`) still leads ([`../references/alternatives.md`](../references/alternatives.md)). The NPI input is its genuinely distinctive angle: healthcare-provider lookups the generalist stack doesn't key on.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `lookupPerson` | 1 | `name, currrentEmployer, title, linkedinUrl, email, npiNumber, lookupType` (enum: `standard, premium, premium (feeds disabled), bulk, phone, enrich`) | Person + company lookup from any identifier mix; healthcare lookups via NPI. |

## What it's for

- ✅ **Fallback person enrichment** — 1 credit when a pilot shows RocketReach hits where `cargo.enrichProspectDetails` (2) / `waterfall.enrichContact` (2) miss for the niche.
- ✅ **Healthcare-provider lookup** — `npiNumber` input plus `npi_data` in the output; no other catalog action takes an NPI.
- ✅ **One-call person + company context** — output carries `current_employer`, `current_employer_domain`, `current_employer_linkedin_url`, and `job_history`, so a hit can also seed company enrichment and job-change checks.
- ❌ **Sourcing or search** — lookup only; there is no people-search action here. Credits-based sourcing stays on `salesNavigator`.
- ❌ **First-stop email finding** — the find-email chain has cheaper dedicated rungs starting at `icypeas` (0.1); see [`../references/stage-action-map.md`](../references/stage-action-map.md).

## Patterns

### Pattern A — Fallback lookup from name + employer

```bash
# Only on rows the priority stack missed
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"rocketreach","actionSlug":"lookupPerson","config":{}}' \
  --records '[
    {"name":"Alice Smith","currrentEmployer":"Acme","title":"CTO"},
    {"linkedinUrl":"https://linkedin.com/in/bobjones"}
  ]' \
  --wait-until-finished
```

### Pattern B — Healthcare lookup by NPI

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"rocketreach","actionSlug":"lookupPerson","config":{}}' \
  --record '{"npiNumber":1234567890}' \
  --wait-until-finished
```

`npiNumber` is a **number**, not a string.

## Common pitfalls

- **`currrentEmployer` has three r's.** That misspelling is the literal schema key — a correctly-spelled `currentEmployer` is silently ignored and the lookup runs on name alone.
- **No field is required** — the schema accepts any subset, but an identifier-free call can't match; pass at least a LinkedIn URL, an email, an NPI, or name + employer.
- **`lookupType` doesn't change the billed cost** — the credits schedule is a fixed 1 regardless of the enum value. Treat the phone-bearing output as gated anyway: the phone-cost guard in [`../references/cost-discipline.md`](../references/cost-discipline.md) is about intent, not just price.
- **Rate limit 250/minute** (spread) — comfortable for fallback residues, slow for full-list enrichment (another reason the stack leads).

## Anti-patterns

- **Using `lookupPerson` as a bulk email finder.** Found emails still flow to VERIFY (`waterfall.verifyEmail`, 0.1), and the dedicated chain is cheaper and purpose-built; use RocketReach for the person/company bundle or the NPI niche.
- **Trusting `recommended_email` without verification.** It's a finder recommendation, not a verified address.

## Position in the waterfall

- `lookupPerson` — **ENRICH (person), 1-credit fallback rung** beside `apolloio.enrichPerson` (1), behind the stack's `cargo` (2) → `waterfall` (2) → `peopleDataLabs` (3) chain; promote it per-batch only when a pilot shows better niche coverage (healthcare especially).
- Emails it surfaces flow to **VERIFY** before activation.

## Action shape

`{"kind":"connector","integrationSlug":"rocketreach","actionSlug":"lookupPerson","config":{}}`. **No `connectorUuid` in `config`.**
