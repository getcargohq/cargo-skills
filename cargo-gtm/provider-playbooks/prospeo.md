---
provider: prospeo
category: contact (email + phone)
last-reviewed: 2026-07-09
---

# prospeo

Contact-lookup specialist whose standout is **the cheapest phone finder in the priority stack** — `findPhone` (3) is the default first stop of the phone chain, ahead of `FullEnrich.findPhone` (6) and `waterfall.findPhone` (7). Its `findEmail` (0.5) is a mid-tier alternative to the `FullEnrich.findEmail` (1) default; prefer it only when budget-constrained or as a waterfall rung ([`../references/alternatives.md`](../references/alternatives.md)). Also carries cheap LinkedIn-profile and company enrichment at 0.5.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `findEmail` | 0.5 | `firstName, lastName, fullName, companyDomain` (**`companyDomain` required**) | Mid-tier email finder. |
| `enrichLinkedin` | 0.5 | `url` | Cheapest LinkedIn URL → person details in the enrich stage ([`../references/stage-action-map.md`](../references/stage-action-map.md)). |
| `enrichCompany` | 0.5 | `companyName, companyWebsite, companyLinkedinUrl` | B2B firmographics; prefer website or LinkedIn URL over name. |
| `findPhone` | 3 | `url` (LinkedIn URL, required) | **Default first stop of the phone chain.** |

## What it's for

- ✅ **Phone chain, rung 1** — prospeo (3) → FullEnrich (6) → waterfall (7); escalate only on misses ([`../references/waterfall-strategy.md`](../references/waterfall-strategy.md)).
- ✅ **Budget email finding** — 0.5 vs FullEnrich's 1, when a lower hit rate is acceptable or as a chain rung.
- ✅ **Cheap LinkedIn-URL enrichment** — `enrichLinkedin` when you already hold a validated profile URL and need title/role details.

## Patterns

### Pattern A — Phone lookup on qualified leads only

```bash
# Phone is the expensive lever — qualified rows only, never the full list
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"prospeo","actionSlug":"findPhone","config":{}}' \
  --records '[
    {"url":"https://linkedin.com/in/alicesmith"},
    {"url":"https://linkedin.com/in/bobjones"}
  ]' \
  --wait-until-finished
```

The only accepted identifier is a LinkedIn URL (`url`). No URL → no lookup; resolve one first via the [`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md) recipe.

### Pattern B — Budget email finding

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"prospeo","actionSlug":"findEmail","config":{}}' \
  --records '[
    {"firstName":"Alice","lastName":"Smith","companyDomain":"acme.com"},
    {"fullName":"Bob Jones","companyDomain":"globex.com"}
  ]' \
  --wait-until-finished
```

`companyDomain` is **required** — a domain, not a company name. Rows with only a company name need domain resolution first (e.g. `cargo.matchBusiness` or `prospeo.enrichCompany`).

## Common pitfalls

- **`findPhone` at 3 credits is still the ~10×-email lever.** Run it on qualified leads after explicit user request only ([`../references/cost-discipline.md`](../references/cost-discipline.md)); escalate misses to `FullEnrich.findPhone`, don't re-run.
- **`findEmail` without `companyDomain` fails** — it's the one required field. Name-only or name+company-name records don't run.
- **`enrichCompany` with name only is a weak match.** The schema's own guidance: prefer `companyWebsite` or `companyLinkedinUrl` when possible.

## Anti-patterns

- **snake_case field names.** prospeo inputs are **camelCase**: `firstName`, `lastName`, `fullName`, `companyDomain`. Do NOT reuse waterfall's `first_name`/`domain` shape here.
- **Shipping a found email unverified.** No finder's output skips verification: free pre-cull with `validate-emails.ts` ([`../references/contact-accuracy.md`](../references/contact-accuracy.md)), then `waterfall.verifyEmail` (0.1) on the survivors.
- **Using `findEmail` as the default over FullEnrich.** The spine default is `FullEnrich.findEmail` (better hit rate); prospeo is the budget alternative, not the starting point.

## Position in the waterfall

- `findPhone` — **rung 1** of the phone chain. CONTACT stage, gated to qualified leads.
- `findEmail` — mid-tier CONTACT alternative alongside `hunter`/`findyMail`/`leadMagic` (all 0.5); every hit flows to the VERIFY stage (`waterfall.verifyEmail`, 0.1).
- `enrichLinkedin` / `enrichCompany` — enrich-stage fillers when the identifier you hold matches their required input.

## Action shape

`{"kind":"connector","integrationSlug":"prospeo","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
