---
provider: dropcontact
category: contact (email)
last-reviewed: 2026-07-09
---

# dropcontact (Dropcontact)

**The French/EU tier of the find-email waterfall.** One credits-based action, `findEmail` (1) — same price as the priority default `FullEnrich.findEmail` (1), so it never wins on cost. It wins on **coverage**: it takes and returns French business-registry data (SIREN/SIRET, NAF codes, VAT), so swap it into the CONTACT stage when the list skews French/EU, or run it on FullEnrich misses for those geographies (see [`../references/alternatives.md`](../references/alternatives.md), Find email alternatives — "Better for French/EU data").

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `findEmail` | 1 | `first_name, last_name, full_name, email, phone, company, website, linkedin, company_linkedin, country, num_siren, siret` — all optional in the schema | Find a person's email + enrich person/company, with French registry fields. |

The connector also accepts your own Dropcontact API key (`apiKey`) — same action, billed to your Dropcontact plan instead of credits.

## What it's for

- ✅ **French/EU contact lists** — the geography where its index beats the default stack; SIREN/SIRET in, SIREN/SIRET/NAF/VAT out.
- ✅ **Escalation on FullEnrich misses for EU rows** — same 1-credit price, different underlying source.
- ❌ **Generic find-email first rung** — `FullEnrich.findEmail` (1) leads; mid-tiers (`hunter`, 0.5) come second (see [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md)).
- ❌ **Budget rung** — at 1 credit it's the top price tier; `icypeas.findEmail` (0.1) is the cheap last resort.

## Patterns

### Pattern A — Find-email rung for a French list

```bash
# Run on the FR/EU rows (or on FullEnrich misses for those rows)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"dropcontact","actionSlug":"findEmail","config":{}}' \
  --records '[
    {"first_name":"Alice","last_name":"Martin","website":"acme.fr"},
    {"full_name":"Bob Durand","company":"Globex","country":"France"}
  ]' \
  --wait-until-finished
```

No field is schema-required, but a call without at least a name plus a company identifier can't resolve anything — pass `website` over `company` when you have it, and `linkedin` / `company_linkedin` / `siret` when known.

## Output fields

`email` is an **array** of `{email, qualification}` objects — not a string. Plus person fields (`first_name, last_name, full_name, civility, job, job_function, job_level, linkedin, phone, location`) and company fields including the French registry block (`company, website, company_linkedin, nb_employees, siren, siret, siret_address, siret_zip, siret_city, naf5_code, naf5_des, vat, country`).

## Common pitfalls

- **`email` is an array.** Interpolate `{{nodes.<slug>.email[0].email}}`, not `{{nodes.<slug>.email}}` — the raw field is a list of candidates with per-candidate `qualification`.
- **`qualification` is the provider grading its own homework.** Route every returned email through the free pre-cull ([`../references/contact-accuracy.md`](../references/contact-accuracy.md)) then `waterfall.verifyEmail` (0.1) regardless.
- **Rate-limited to 60 calls/minute** (spread), with up to 10 backoff retries per call — large batches drain slowly by design. Don't re-trigger a batch that looks stalled; poll it.

## Anti-patterns

- **camelCase field names.** Inputs are **snake_case** (`first_name`, `company_linkedin`) — do NOT reuse FullEnrich's `firstName`/`domainName` shape here.
- **dropcontact for non-EU lists.** Same price as the default with weaker coverage outside its home turf — that's a swap-down, not a lateral move.

## Position in the waterfall

**CONTACT stage, geography-conditional rung.** For FR/EU-heavy lists: swap in at rung 1 alongside/instead of `FullEnrich.findEmail` (1); otherwise use only on FullEnrich misses for EU rows (see [`../references/stage-action-map.md`](../references/stage-action-map.md), Find email). Every hit still flows to VERIFY: free pre-cull → `waterfall.verifyEmail` (0.1).

## Action shape

`{"kind":"connector","integrationSlug":"dropcontact","actionSlug":"findEmail","config":{}}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/prospecting.md`](../recipes/prospecting.md) — the CONTACT rung of the find → enrich → verify → sync spine, for French/EU segments.
- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — enrich → verify before personalization.
