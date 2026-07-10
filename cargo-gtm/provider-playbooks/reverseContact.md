---
provider: reverseContact
category: contact
last-reviewed: 2026-07-09
---

# reverseContact (Reverse Contact)

LinkedIn-anchored reverse lookups. **Only one of its four actions is credits-based**: `enrichCompanyFromLinkedin` (1) — a niche ENRICH rung for when your input is precisely a **LinkedIn company URL**. The other three (domain → company, LinkedIn URL → profile, email → profile) run **only on your own Reverse Contact API key** connector. Don't route generic company enrichment here: at 1 credit it matches `waterfall.enrichCompany` (1, priority) while `linkedin.enrichCompany` (0.25) covers most LinkedIn-anchored needs at a quarter of the price (see [`../references/stage-action-map.md`](../references/stage-action-map.md), Enrich company — "Niche: LinkedIn URL → company").

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrichCompanyFromLinkedin` | 1 | `linkedinUrl` (required) | LinkedIn company URL → company record, when the priority stack missed. |

## Own-API-key actions (no credits — require your Reverse Contact account connector)

| Action | What it does |
|---|---|
| `enrichCompanyFromDomain` | `domain` (required) → company record. |
| `enrichProfileFromLinkedin` | `linkedinUrl` (required) → person profile. |
| `enrichProfileFromEmail` | `email` (required; `firstName`, `lastName`, `companyDomain`, `companyName` optional hints) → person profile. Its signature **reverse-email lookup**. |

These consume your Reverse Contact plan's quota, not cargo credits — treat them as a surface for users who already subscribe, especially `enrichProfileFromEmail` when you hold an email and need the person behind it.

## What it's for

- ✅ **LinkedIn company URL → firmographics, as a fallback** — when you sourced company LinkedIn URLs (e.g. from `salesNavigator`) and `waterfall.enrichCompany` / `linkedin.enrichCompany` missed.
- ✅ **Reverse-email person lookup on an existing subscription** — own-key `enrichProfileFromEmail` for inbound/signup emails.
- ❌ **Default company enrich** — the chain is `cargo.enrichBusinessFirmographics` (0.5) → `waterfall.enrichCompany` (1) → `peopleDataLabs.enrichCompany` (3) (see [`../references/alternatives.md`](../references/alternatives.md)).
- ❌ **LinkedIn-anchored enrich on a budget** — `linkedin.enrichCompany` (0.25) / `linkedin.enrichCompanyFromDomain` (0.5) first.
- ❌ **Credits-based person enrichment** — its profile actions aren't credits-compatible; use `waterfall.enrichContact` / `FullEnrich` instead.

## Patterns

### Pattern A — LinkedIn company URL → company (fallback rung)

```bash
# Only on rows the priority enrich chain missed, where a LinkedIn company URL exists
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"reverseContact","actionSlug":"enrichCompanyFromLinkedin","config":{}}' \
  --records '[{"linkedinUrl":"https://www.linkedin.com/company/acme"}]' \
  --wait-until-finished
```

The catalog dump documents no output schema for these actions — inspect the first run's output (resolve the output schema via `cargo-orchestration`, or read the run's `runContext`) before filtering on field names.

## Cost traps

- **1 credit for a niche lookup.** If the row also has a domain, the cheaper domain-first chain (`companyEnrich.enrichByDomain` 0.25, `linkedin.enrichCompanyFromDomain` 0.5, `cargo.enrichBusinessFirmographics` 0.5) should already have run — this action is for URL-only rows.
- **Own-key actions on the wrong assumption.** `enrichProfileFromEmail` and friends fail without a Reverse Contact API key connector; there is no credits fallback for them.

## Anti-patterns

- **Using it to "find" a company LinkedIn URL.** It consumes a LinkedIn URL, it doesn't discover one — URL discovery is a sourcing problem (`salesNavigator`, or [`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md) for people).
- **Skipping verification on any downstream email.** Emails surfaced via profile enrichment go through the free pre-cull ([`../references/contact-accuracy.md`](../references/contact-accuracy.md)) then `waterfall.verifyEmail` (0.1), like every other source (see [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md)).

## Position in the waterfall

**ENRICH stage, niche fallback rung.** Default company chain: `cargo.enrichBusinessFirmographics` (0.5, after `matchBusiness`) → `waterfall.enrichCompany` (1) → `peopleDataLabs.enrichCompany` (3). `reverseContact.enrichCompanyFromLinkedin` (1) slots in only when the input is a LinkedIn company URL the stack couldn't resolve.

## Action shape

`{"kind":"connector","integrationSlug":"reverseContact","actionSlug":"enrichCompanyFromLinkedin","config":{}}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/build-tam.md`](../recipes/build-tam.md) — ENRICH stage backfill when TAM rows carry LinkedIn company URLs.
- [`../recipes/prospecting.md`](../recipes/prospecting.md) — the enrich rung of the find → enrich → verify → sync spine.
