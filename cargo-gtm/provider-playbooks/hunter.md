---
provider: hunter
category: contact (email)
last-reviewed: 2026-07-09
---

# hunter

Mid-tier email finder. Its `findEmail` (0.5) is **rung 2 of the find-email waterfall** — a different underlying source than `FullEnrich.findEmail` (1), so it often finds what FullEnrich misses. Prefer it as the escalation step on FullEnrich misses, or as the lead finder when budget is critical and a lower hit rate is acceptable ([`../references/alternatives.md`](../references/alternatives.md)). Avoid its `verifyEmail` — at 1 credit it is the most expensive verify tier in the catalog.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `findEmail` | 0.5 | `first_name, last_name, full_name, domain, company` | Rung-2 email finder in the spine ([`../references/waterfall-strategy.md`](../references/waterfall-strategy.md)). |
| `enrichPerson` | 1 | `email` | Email → person info. Cheap mid-tier alternative to heavier person enrichers. |
| `searchDomain` | 1 | `domain, type, seniorities, departments, requiredFields, limit` | List people at one domain, filtered by seniority/department. Max **10 records per call**. |
| `verifyEmail` | 1 | `email` | **Avoid.** 10× `waterfall.verifyEmail` (0.1), 100× `icypeas.verifyEmail` (0.01). |

## What it's for

- ✅ **Escalation on FullEnrich misses** — the canonical find-email chain is FullEnrich (1) → hunter (0.5) → peopleDataLabs (3) → icypeas (0.1); hunter's independent index is the whole point of running it second.
- ✅ **Budget-constrained lead finder** — half FullEnrich's price when the user accepts a lower hit rate.
- ✅ **Small per-domain people lists** — `searchDomain` filters by seniority and department when you need a handful of contacts at one known company.

## Patterns

### Pattern A — Rung 2 of the find-email chain

```bash
# Run ONLY on the rows where FullEnrich.findEmail returned nothing
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"hunter","actionSlug":"findEmail","config":{}}' \
  --records '[
    {"first_name":"Alice","last_name":"Smith","domain":"acme.com"},
    {"full_name":"Bob Jones","company":"Globex"}
  ]' \
  --wait-until-finished
```

`domain` beats `company` for accuracy — pass the domain whenever you have it. Output includes `email`, a confidence `score`, an `accept_all` boolean (catch-all flag), `position`, `linkedin_url`, the public-web `sources` it was extracted from, and a `verification.status` block.

### Pattern B — People at one domain

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"hunter","actionSlug":"searchDomain","config":{}}' \
  --records '[{"domain":"acme.com","type":"personal","seniorities":["executive"],"departments":["sales","marketing"],"limit":10}]' \
  --wait-until-finished
```

`domain` and `type` (`all`/`personal`/`generic`) are required. `limit` caps at 10 — this is a spot-check tool, not a sourcing engine; for volume sourcing use `salesNavigator.searchLeads` (0.02) or `icypeas.findPeople` (0.02).

## Common pitfalls

- **`accept_all: true` means catch-all.** The domain accepts any address, so a "found" email proves nothing. Ship it only if a second independent finder returned the exact same string; otherwise flag "unverified".
- **The embedded `verification` block is the provider grading its own homework.** Run `waterfall.verifyEmail` (0.1) on every found email regardless — verification hard rules in [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md).
- **`searchDomain` returns at most 10 records** and costs 1 credit per call — don't loop it to build a list.

## Anti-patterns

- **camelCase field names.** hunter inputs are **snake_case**: `first_name`, `last_name`, `full_name`, `domain`, `company`. Do NOT reuse FullEnrich's `firstName`/`domainName` shape here.
- **`hunter.verifyEmail` in any chain.** 1 credit buys 10 `waterfall.verifyEmail` calls or 100 `icypeas.verifyEmail` calls for the same job.
- **Paid verify before the free cull.** Run the `validate-emails.ts` script from [`../references/contact-accuracy.md`](../references/contact-accuracy.md) first — dropping invalid/disposable/duplicate rows is free and shrinks the paid batch.

## Position in the waterfall

- `findEmail` — **rung 2** of the find-email chain (after FullEnrich, before peopleDataLabs). CONTACT stage of the prospecting spine.
- Every hit still flows to the VERIFY stage: free pre-cull ([`../references/contact-accuracy.md`](../references/contact-accuracy.md)) → `waterfall.verifyEmail` (0.1).
- Demote dynamically: if hunter misses on the pilot's first ~10 rows, drop it behind peopleDataLabs for the rest of that batch.

## Action shape

`{"kind":"connector","integrationSlug":"hunter","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
