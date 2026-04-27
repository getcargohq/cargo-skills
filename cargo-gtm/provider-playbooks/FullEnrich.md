---
provider: FullEnrich
category: enrichment (premium contact lookup)
last-reviewed: 2026-04-27
---

# FullEnrich

Premium contact-detail provider. Four credits-based actions, all focused on filling email + phone + LinkedIn gaps. Higher cost than cheap email finders, but **better hit rate**, and the only provider in the priority stack that does **reverse-email lookup**.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `findEmail` | 1 | `firstName, lastName, domainName, companyName, linkedinUrl` | Default email finder in the priority stack. |
| `findPhone` | 6 | `firstName, lastName, domainName, companyName, linkedinUrl` | Premium phone lookup. Escalate from `prospeo.findPhone` (3). |
| `findPhoneAndEmail` | 7 | `firstName, lastName, domainName, companyName, linkedinUrl` | Combined call when both are needed and you'd otherwise pay 1+6=7 anyway. **No discount over running both separately.** |
| `reverseEmailLookup` | 2 | `email` | **Unique action.** Email → LinkedIn URL + company info. |

## What it's for

- ✅ **Default email finder** in the prospecting spine — better hit rate than cheap providers (`hunter`/`icypeas` at 0.5 cred), worth the 2× cost when conversion matters.
- ✅ **Reverse-email lookup** — given an email, retrieve LinkedIn + company. Critical for de-anonymizing email-only data sources.
- ✅ **Phone lookup with multi-input flexibility** — accepts any combination of name/domain/company/linkedin.

## Patterns

### Pattern A — Default email finder in the spine

```bash
# After sourcing + (optional) basic enrichment, find emails for the contacts
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findEmail","config":{}}' \
  --records '[
    {"firstName":"Alice","lastName":"Smith","domainName":"acme.com"},
    {"firstName":"Bob","lastName":"Jones","linkedinUrl":"https://linkedin.com/in/bobjones"}
  ]' \
  --wait-until-finished
```

Pass either `domainName` (highest reliability) or `linkedinUrl`. Both is best.

### Pattern B — Reverse lookup from an email

When you have an email but no other identity (e.g., from `snitcher.searchSessions` or a webform):

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"reverseEmailLookup","config":{}}' \
  --records '[{"email":"alice@acme.com"},{"email":"bob@globex.com"}]' \
  --wait-until-finished
```

Returns LinkedIn URL + company name + (sometimes) title. Feed the LinkedIn URL into `linkedin.enrichProfile` for full validation per the `linkedin-url-lookup` recipe.

### Pattern C — Combined phone + email

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findPhoneAndEmail","config":{}}' \
  --records '[{"firstName":"Alice","lastName":"Smith","linkedinUrl":"…","domainName":"acme.com"}]' \
  --wait-until-finished
```

Cost is 7 credits — same as running `findEmail` (1) + `findPhone` (6) separately. Only use the combined call when API simplicity matters more than the ability to skip phone lookup for low-value rows.

## Common pitfalls

- **`findPhoneAndEmail` is not a discount.** 7 credits = 1 (email) + 6 (phone). Run separately if you want to skip phone lookups for unqualified leads.
- **Multi-input matters.** Hit rate jumps significantly when you pass `linkedinUrl` AND `domainName` together vs. either alone. If you have both, use both.
- **Don't use `findEmail` for verification.** It returns a single best-guess email; some are catch-all and will bounce. Always verify with `waterfall.verifyEmail` (0.1 cred) before using in outreach.

## Fallback chain

If `FullEnrich.findEmail` returns nothing for a row, escalate via:

1. `peopleDataLabs.enrichPerson` (3 cred) — heavyweight backfill.
2. Or `hunter.findEmail` (0.5 cred) — different underlying source, sometimes finds what FullEnrich misses.
3. Last resort: `icypeas.findEmail` (0.1 cred).

Don't run all four blindly — the spine is `FullEnrich` first, escalate only on misses.

## Action shape

`{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.** Note the capitalization: `FullEnrich` (camel-case starting with capital `F`).
