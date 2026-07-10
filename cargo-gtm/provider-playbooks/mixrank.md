---
provider: mixrank
category: enrichment (person + company, premium backfill)
last-reviewed: 2026-07-09
---

# mixrank (Mixrank)

Premium person/company enrichment — two actions, both **4 credits**, the most expensive general enrichers in the catalog (above `peopleDataLabs` at 3, `cargo.enrichProspectDetails` at 2, `waterfall.enrichCompany` at 1). Its earner is identifier flexibility: `findPerson` matches from **any** of email, phone, name (+ company), or social URL — including **phone-only reverse lookup**, which the cheaper chain doesn't do. Treat it as the last backfill rung, never the first stop.

## Credits-based actions

| Action | Cost | Inputs (all optional — pass at least one) | Use for |
|---|---|---|---|
| `findPerson` | 4 | `email`, `phone`, `socialUrl`, `name` / `firstName` + `lastName`, `companyName`, `domain` | Resolve a person from whatever identifier you have — incl. phone or bare name + company. |
| `findCompany` | 4 | `name`, `url`, `linkedin` | Resolve a company from name, domain/website URL, or LinkedIn URL. |

## What it's for

- ✅ **Reverse-phone lookup** — `findPerson` with just `phone` identifies who a number belongs to; no cheaper action in the catalog takes phone as an input key.
- ✅ **Weak-identifier person backfill** — rows where cargo native (2) and `waterfall` missed and all you have is a name + company or a stray social URL.
- ✅ **Company resolution from a bare name** — `findCompany` with `name` only, when there's no domain to key on (though `oceanio.enrichCompany` at 1 also takes weak identifiers — try it first).
- ❌ **Default ENRICH rung** — at 4 credits it's 2–4× the standard chain; a 1,000-row batch through mixrank is 4,000 credits.
- ❌ **Email/phone *finding*** — mixrank resolves *who someone is* from an identifier; to find missing emails/phones, use the CONTACT chains (`FullEnrich`, `prospeo`, …).

## Patterns

### Pattern A — Reverse-phone identification

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"mixrank","actionSlug":"findPerson","config":{}}' \
  --data '{"phone":"+14155551234"}' \
  --wait-until-finished
```

### Pattern B — Last-rung person backfill

```bash
# Only on rows the cheaper enrich rungs missed
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"mixrank","actionSlug":"findPerson","config":{}}' \
  --records '[
    {"firstName":"Alice","lastName":"Smith","companyName":"Acme","domain":"acme.com"},
    {"socialUrl":"https://linkedin.com/in/bobjones"}
  ]' \
  --wait-until-finished
```

Stack every identifier you have per row — more keys, better match confidence at the same 4-credit price.

## Common pitfalls

- **No required fields.** The schema marks nothing required, so an empty `--data '{}'` still executes and still bills 4 credits. Always pass at least one identifier; guard the node with a filter on identifier presence.
- **Fixed cost on miss.** 4 credits whether or not a match comes back — gate mixrank on prior-rung misses only ([`../references/cost-discipline.md`](../references/cost-discipline.md)).
- **Bare-name matching is fuzzy.** `name` or `companyName` alone can mismatch namesakes; anchor with `domain` or `socialUrl` whenever possible, and pilot 10 rows before a batch.

## Position in the waterfall

**ENRICH stage, last rung.** Person: `linkedin.enrichProfile` (0.25) → `cargo.enrichProspectDetails` (2) → `peopleDataLabs` (3) → **mixrank (4)**. Company: `waterfall.enrichCompany` / `oceanio.enrichCompany` (1) → `peopleDataLabs.enrichCompany` (3) → **mixrank (4)**. Promote it out of order only for the phone-keyed niche. See [`../references/stage-action-map.md`](../references/stage-action-map.md).

## Action shape

`{"kind":"connector","integrationSlug":"mixrank","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/prospecting.md`](../recipes/prospecting.md) — final ENRICH backfill for the rows the standard chain leaves empty.
- [`../recipes/re-engagement.md`](../recipes/re-engagement.md) — identify inbound callers or stale contacts from a phone number before re-activating.
