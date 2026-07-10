---
provider: icypeas
category: contact + verification
last-reviewed: 2026-07-09
---

# icypeas

The **cheap tier** of the contact stack, three ways: `verifyEmail` at **0.01** is the cheapest verification in the entire catalog (10× cheaper than the `waterfall.verifyEmail` default), `findEmail` at 0.1 is the cheap last resort of the find-email chain, and `findPeople`/`findCompanies` at 0.02/record are the cheapest non-LinkedIn sourcing alternative to `salesNavigator`. Prefer it for very large lists where unit cost dominates; avoid it as the lead email finder when hit rate matters — that's `FullEnrich.findEmail` ([`../references/alternatives.md`](../references/alternatives.md)).

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `verifyEmail` | **0.01** | `email` | **Cheapest verify in the catalog.** Very large verify batches. |
| `findEmail` | 0.1 | `firstName, lastName, domainOrCompany` (all required) | Cheap last-resort rung of the find-email chain. |
| `scanDomain` | 0.1 | `domainOrCompany` | Discover **role-based** addresses on a domain (contact@, admin@, …). |
| `findPeople` | 0.02/record | `currentJobTitle, currentCompanyName, location, keyword, limit` | Cheapest non-LinkedIn people sourcing. |
| `findCompanies` | 0.02/record | `name, industry, location, keyword, headcountMin, headcountMax, limit` | Cheapest company sourcing. |

`findPeople`/`findCompanies` are package-billed per 100 records and paginated (`paginationToken` in the response meta); `limit` defaults to 100, max 10,000.

## What it's for

- ✅ **Verification at scale** — 10,000 emails = 100 credits. Use over `waterfall.verifyEmail` (0.1) when the list is large enough for the 10× saving to matter.
- ✅ **Last-resort email finding** — rung 4 of the chain (FullEnrich → hunter → peopleDataLabs → icypeas), per [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md).
- ✅ **Cheap sourcing when LinkedIn coverage is thin** — `findPeople` (0.02) matches `salesNavigator.searchLeads` pricing with a different database; useful for privacy-focused industries.
- ✅ **Role-based address discovery** — `scanDomain` is the only action in the stack that enumerates generic mailboxes on a domain.

## Patterns

### Pattern A — Bulk verify

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"icypeas","actionSlug":"verifyEmail","config":{}}' \
  --records '[{"email":"alice@acme.com"},{"email":"bob@globex.com"}]' \
  --wait-until-finished
```

Run the free `validate-emails.ts` cull first ([`../references/contact-accuracy.md`](../references/contact-accuracy.md)) — even at 0.01/row, paying to verify syntactically invalid or disposable addresses is waste.

### Pattern B — Last-resort email finder

```bash
# Only on rows that FullEnrich, hunter, AND peopleDataLabs all missed
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"icypeas","actionSlug":"findEmail","config":{}}' \
  --records '[{"firstName":"Alice","lastName":"Smith","domainOrCompany":"acme.com"}]' \
  --wait-until-finished
```

All three fields are **required**; `domainOrCompany` accepts either a domain or a company name (domain is more reliable). The output nests results under `emails[]`, each with a `certainty` grade plus MX records/provider — take the top entry, don't assume a flat `email` field.

### Pattern C — Cheap sourcing sweep

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"icypeas","actionSlug":"findPeople","config":{}}' \
  --data '{"currentJobTitle":"CTO","location":"FR","limit":200}' \
  --wait-until-finished
```

Filters are coarse (title, company, location, keyword) — nothing like salesNavigator's facets. Use alpha-2 country codes (`US`, `FR`) for `location`.

## Common pitfalls

- **30 requests/minute rate limit** — the slowest connector in this group (hunter and leadMagic run at 300/min). Large `findEmail`/`verifyEmail` batches take time; the platform spreads and retries automatically, so don't cancel a slow batch.
- **`emails[].certainty` is the provider grading its own homework.** A found email still goes through independent verification before use.
- **`scanDomain` returns role accounts** — contact@/admin@ addresses are REVIEW-tier for outreach (see the audit verdicts in [`../references/contact-accuracy.md`](../references/contact-accuracy.md)), not sequencer-ready contacts.

## Anti-patterns

- **Leading the find-email chain with icypeas.** 0.1 credits buys the lowest hit rate in the chain — it's the mop-up rung, not the opener.
- **snake_case field names.** icypeas inputs are **camelCase**: `firstName`, `lastName`, `domainOrCompany`.
- **Skipping verification because the finder is cheap.** Every found email — icypeas included — flows to a verify step (`waterfall.verifyEmail` 0.1, or icypeas's own 0.01 for bulk).

## Position in the waterfall

- `findEmail` — **rung 4 (last)** of the find-email chain. Often skipped: if hit rate after rung 2–3 is > 90%, the remaining misses are mostly uncoverable rows.
- `verifyEmail` — VERIFY-stage alternative to `waterfall.verifyEmail` for very large lists.
- `findPeople` / `findCompanies` — SOURCE-stage alternative when LinkedIn-anchored search isn't viable.

## Action shape

`{"kind":"connector","integrationSlug":"icypeas","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
