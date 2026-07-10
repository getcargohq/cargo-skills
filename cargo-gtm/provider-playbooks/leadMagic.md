---
provider: leadMagic
category: contact (email + mobile)
last-reviewed: 2026-07-09
---

# leadMagic

Mid-tier email finder whose hits come **pre-annotated**: `findEmail` (0.5) returns a `status` field, full MX diagnostics (provider, security gateway, records), and bonus company firmographics in the same payload. An alternative rung to `hunter.findEmail` at the same price — the default finder remains `FullEnrich.findEmail` (1) per [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md). Also carries `enrichProfile` (3): email → LinkedIn profile URL. No verify or phone actions — pair with `waterfall`/`prospeo` for those stages.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `findEmail` | 0.5 | `firstName, lastName` (required), `domain, companyName` | Mid-tier email finder; MX-annotated output. |
| `enrichProfile` | 3 | `email` (required), `isPersonal` | Email → LinkedIn `profile_url`. |

## What it's for

- ✅ **Chain rung at the 0.5 tier** — interchangeable with `hunter.findEmail` / `findyMail.findEmail`; run it on the rows the earlier rung missed ([`../references/alternatives.md`](../references/alternatives.md)).
- ✅ **MX-aware triage** — `mx_provider`, `mx_security_gateway`, and `has_mx` in the hit payload help flag risky domains before paid verification.
- ✅ **Firmographics for free on hits** — company name, industry, size, founded, location, and LinkedIn URL ride along with each found email; useful when coalescing chain results.
- ✅ **Email → LinkedIn URL** — `enrichProfile` de-anonymizes an email-only row when `FullEnrich.reverseEmailLookup` (2) missed; set `isPersonal: true` for personal addresses.

## Patterns

### Pattern A — Email finder rung

```bash
# Run on the rows the earlier rung missed
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"leadMagic","actionSlug":"findEmail","config":{}}' \
  --records '[
    {"firstName":"Alice","lastName":"Smith","domain":"acme.com"},
    {"firstName":"Bob","lastName":"Jones","companyName":"Globex"}
  ]' \
  --wait-until-finished
```

`firstName` and `lastName` are both **required** — full-name-only rows must be split first. Add `domain` (preferred) or `companyName`; domain-anchored lookups are more reliable.

### Pattern B — Email → LinkedIn profile

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"leadMagic","actionSlug":"enrichProfile","config":{}}' \
  --records '[{"email":"alice@acme.com"},{"email":"bob.jones@gmail.com","isPersonal":true}]' \
  --wait-until-finished
```

Returns `profile_url`. Validate the URL with `linkedin.enrichProfile` before trusting it, per the strict-validation pattern in [`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md).

## Common pitfalls

- **`status` is the provider grading its own homework.** Whatever `findEmail.status` claims, the hit still goes through `waterfall.verifyEmail` (0.1) before any sequencer — verification hard rules in [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md).
- **`mx_security_gateway: true` is a deliverability warning**, not a reason to auto-drop — route those rows to REVIEW rather than silently discarding (verdict semantics in [`../references/contact-accuracy.md`](../references/contact-accuracy.md)).
- **`enrichProfile` at 3 credits is pricier than `FullEnrich.reverseEmailLookup` (2)** for the same email → LinkedIn job. Use it as the fallback, not the opener.

## Anti-patterns

- **snake_case field names.** leadMagic inputs are **camelCase**: `firstName`, `lastName`, `domain`, `companyName`. (Its *outputs* are snake_case — don't mirror them back into inputs.)
- **Name-only records.** Without at least `domain` or `companyName`, `firstName` + `lastName` alone match too many people — expect junk hits.
- **Paid verify before the free cull.** Run `validate-emails.ts` ([`../references/contact-accuracy.md`](../references/contact-accuracy.md)) on the enriched list first; only survivors go to `waterfall.verifyEmail`.

## Position in the waterfall

- `findEmail` — CONTACT-stage mid-tier rung alongside `hunter`/`findyMail` (all 0.5), behind the `FullEnrich.findEmail` default. Demote whichever 0.5-tier finder misses on the pilot's first ~10 rows.
- Every hit flows to the VERIFY stage: free pre-cull → `waterfall.verifyEmail` (0.1). leadMagic has **no verify action of its own**.
- `enrichProfile` — LinkedIn-URL-resolution fallback after `FullEnrich.reverseEmailLookup`.

## Action shape

`{"kind":"connector","integrationSlug":"leadMagic","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.** Note the capitalization: `leadMagic` (camel-case with capital `M`).
