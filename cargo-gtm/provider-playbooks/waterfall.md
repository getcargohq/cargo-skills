---
provider: waterfall
category: enrichment (multi-source contact + signal)
last-reviewed: 2026-04-27
---

# waterfall (Waterfall.io)

Multi-source enrichment with built-in fallback across multiple underlying providers. **Swiss-army-knife of the priority stack** — one provider covering contact enrichment, company enrichment, email verification, phone lookup, prospect search, and the **only credits-based job-change detection action in the catalog**.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `verifyEmail` | **0.1** | `email` | Email verification. **Cheapest tier in the priority stack.** |
| `enrichCompany` | 1 | `linkedin, domain, name` | Fallback for unmatched cargo companies; also useful when LinkedIn is the only known identifier. |
| `enrichContact` | 2 | `linkedin, full_name, first_name, last_name, domain, email, include_extra_fields` | Multi-source contact enrichment. |
| `detectJobChange` | 3 | `professional_email, personal_email, company_domain, company_linkedin, contact_linkedin` | **Unique action.** Returns `MOVED / LEFT / NO_CHANGE / UNKNOWN` plus updated person info. |
| `searchProspects` | 3 | `domain, company_name, linkedin, title_filter, location_country, …` | People search; alternative to salesNavigator when LinkedIn-anchored search isn't enough. |
| `findPhone` | 7 | `linkedin, full_name, first_name, last_name, domain, email, include_extra_fields` | Phone number lookup. Premium pricing — escalate from `prospeo.findPhone` (3) only when needed. |

## What it's for

- ✅ **Email verification at the cheapest tier** (0.1) — default for any verify step in the spine.
- ✅ **Job change signal** — `detectJobChange` is the only credits-based action of its kind in the entire 120-integration catalog. Cargo-unique strength.
- ✅ **Fallback contact / company enrichment** — when cargo native + FullEnrich miss, waterfall is the next stop before the heavyweight peopleDataLabs.
- ✅ **Multi-identifier enrichment** — accepts LinkedIn URL, domain, name, or email. Useful when the input is weakly identified.

## Patterns

### Pattern A — Email verification at scale

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"verifyEmail","config":{}}' \
  --records '[{"email":"alice@acme.com"},{"email":"bob@globex.com"}, ...]' \
  --wait-until-finished
```

At 0.1 cred/email, 1,000 emails = 100 credits. Default verify step in any prospecting pipeline.

### Pattern B — Job change detection (signal segment)

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"detectJobChange","config":{}}' \
  --records '[
    {"professional_email":"alice@acme.com","contact_linkedin":"https://linkedin.com/in/alicesmith"},
    {"professional_email":"bob@globex.com","contact_linkedin":"https://linkedin.com/in/bobjones"},
    ...
  ]' \
  --wait-until-finished
```

Pass any combination of identifiers; multi-identifier inputs improve coverage. Result statuses:
- `MOVED` — person changed company; new role + company returned.
- `LEFT` — person left and current state unknown.
- `NO_CHANGE` — same role / company.
- `UNKNOWN` — no signal available.

Filter to `MOVED` for outbound timing. See [`../recipes/job-change-monitoring.md`](../recipes/job-change-monitoring.md) for the full pattern including segment write-back.

### Pattern C — Fallback contact enrichment

```bash
# Only run on rows where cargo.matchProspect / enrichProspectDetails returned no data
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"enrichContact","config":{}}' \
  --records '[
    {"linkedin":"https://linkedin.com/in/alice","include_extra_fields":true},
    {"first_name":"Bob","last_name":"Jones","domain":"globex.com"}
  ]' \
  --wait-until-finished
```

`include_extra_fields: true` increases response richness but doesn't change cost.

## Common pitfalls

- **Don't use `findPhone` first.** At 7 credits, it's the most expensive phone action in the priority stack. Try `prospeo.findPhone` (3) first; escalate to waterfall only when prospeo misses.
- **`detectJobChange` requires at least one identifier**. Best coverage: LinkedIn URL + company domain. Email-only inputs often return UNKNOWN.
- **`searchProspects` is 3 credits/record** — comparable to peopleDataLabs but with less rich filtering. Default to salesNavigator.searchLeads (0.02) unless you need waterfall's specific filter combinations.

## Action shape

`{"kind":"connector","integrationSlug":"waterfall","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
