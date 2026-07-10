---
provider: societeInfo
category: enrichment
last-reviewed: 2026-07-09
---

# societeInfo (Societe Info)

French-market company and contact data, anchored on the official registry: registration numbers, NAF activity codes, juridical forms, conventions collectives, filed financials (`minSales` / `minProfits`). Two actions, both premium at 4 credits — `search` bills **4 per item returned**, `enrich` a fixed 4. Reach for it only when the target is a **French entity** and the generalist stack (`cargo` native → `waterfall`, 0.25–1 for companies) lacks the registry depth you need; for everything else it's 8–16× the going rate ([`../references/stage-action-map.md`](../references/stage-action-map.md)).

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `search` | 4 **per item** | `objectType: "company"` + `searchFields` (name/value pairs: `query, where, nafLevel, juridicalFormLevel, conventionCollectiveCode, minSales/maxSales, minProfits/maxProfits, minStaff/maxStaff, minCreationDate, webTechnos, sort, page` …) + toggles (`withSite, withPhone, withLinkedin, withEstablishments` …); **or** `objectType: "contact"` + `registrationNumber` (required) + `searchFields` (`contactLevelCode, contactDomainCode, contactRoleQuery, contactMax`) | Registry-filtered French company sourcing, or contacts at one registered company. |
| `enrich` | 4 | `objectType: "company"` or `"contact"` + `enrichFields` (name/value pairs: `name, domainName, email, firstName/lastName/fullName, linkedinUrl, registrationNumber, street/postalCode/city, minMatchScore` …; contact mode adds `withEmail, withLinkedin` toggles) | Resolve one French company/contact to its registry record from whatever identifier you hold. |

## What it's for

- ✅ **French TAM with registry filters** — company `search` by NAF code, juridical form, filed revenue/profit/staff ranges: criteria no generalist provider filters on.
- ✅ **Registry-grade company resolution** — `enrich` from a domain, name + address, or LinkedIn URL to the official record (registration number and legal identity).
- ✅ **Contacts at a registered company** — contact `search` keyed on the `registrationNumber` you got from a company search/enrich, filtered by role/level.
- ❌ **Non-French targets** — it's a France-scoped registry source; the stack covers everything else far cheaper.
- ❌ **Cheap firmographics on French companies** — if you don't need registry fields, `companyEnrich.enrichByDomain` (0.25) or `cargo` (0.5) suffices.

## Patterns

### Pattern A — Registry-filtered company search (cost-capped)

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"societeInfo","actionSlug":"search","config":{}}' \
  --record '{"objectType":"company","limit":10,"withSite":true,"searchFields":[{"name":"query","value":"logiciel"},{"name":"where","value":"Paris"},{"name":"minStaff","value":50}]}' \
  --wait-until-finished
```

**Set `limit`** — at 4 credits per item returned, an uncapped search is the cost trap here (25 results = 100 credits).

### Pattern B — Resolve a domain to the registry record

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"societeInfo","actionSlug":"enrich","config":{}}' \
  --record '{"objectType":"company","enrichFields":[{"name":"domainName","value":"acme.fr"},{"name":"minMatchScore","value":0.8}]}' \
  --wait-until-finished
```

## Common pitfalls

- **`search` is unit-priced, `enrich` is fixed** — same 4-credit sticker, very different bills. Cap search results; a "quick look" that returns a page of companies costs a page × 4.
- **Name/value pair arrays, not flat keys.** Filters go in `searchFields` / `enrichFields` as `[{"name":"...","value":...}]` objects — a flat `{"query":"..."}` config is silently ignored.
- **Contact mode requires `registrationNumber`** — the French company registration id, not a domain or name. Get it from a company `search`/`enrich` first; that's a 2-step, 8+-credit sequence.
- **`objectType` switches the whole schema.** Company and contact modes accept different fields; mixing them (e.g. `contactRoleQuery` in company mode) does nothing.

## Anti-patterns

- **Using it as a generic company enricher.** 4 credits buys 16 `companyEnrich.enrichByDomain` calls; societeInfo earns its price only on registry-specific French needs.
- **Piloting on `search` with no `limit`.** Pilot the filters with `limit: 3` before scaling, per [`../references/cost-discipline.md`](../references/cost-discipline.md).

## Position in the waterfall

- `enrich` — **ENRICH (company/contact), French specialist rung**: outside the default chain; promote per-batch for French entities needing registry fields.
- `search` — **SOURCE, French specialist**: registry-filtered sourcing feeding the normal ENRICH → VERIFY path (found contacts' emails still verify via `waterfall.verifyEmail`, 0.1).

## Action shape

`{"kind":"connector","integrationSlug":"societeInfo","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
