---
provider: FullEnrich
category: enrichment (premium contact lookup) + free list building
last-reviewed: 2026-10-02
---

# FullEnrich

Premium contact-detail provider, and now a **free** sourcing source. Four paid actions fill email + phone + LinkedIn gaps — higher cost than cheap email finders, but **better hit rate**, and the only provider in the priority stack that does **reverse-email lookup**. Four more — `searchPeople`, `searchCompanies`, `lookupPerson`, `lookupCompany` — bill **0 credits**, as do the `fetchPeople` / `fetchCompanies` extractors that pull the same searches into a model. That makes FullEnrich the cheapest search in the catalog: size and pull a list here before paying `aiArk` (0.01–0.05) or `salesNavigator` (0.2) per record.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `findEmail` | 1 | `firstName, lastName, domainName, companyName, linkedinUrl` | Default email finder in the priority stack. |
| `findPhone` | 6 | `firstName, lastName, domainName, companyName, linkedinUrl` | Premium phone lookup. Escalate from `prospeo.findPhone` (3). |
| `findPhoneAndEmail` | 7 | `firstName, lastName, domainName, companyName, linkedinUrl` | Combined call when both are needed and you'd otherwise pay 1+6=7 anyway. **No discount over running both separately.** |
| `reverseEmailLookup` | 1 | `email` | **Unique action.** Email → LinkedIn URL + company info. |
| `searchPeople` | 0 | person filters (`peopleInfo`, `personLocation`, `jobRole`, `skills`, `education`, `languages`, `tenure`, `pastCompany`) + current-company filters (`companyInfo`, `industry`, `companyType`, `headquarters`, `specialties`, `technologies`, `headcount`, `foundedYear`) + `limit` (default 10, max 2,000) | **Free people search.** Title, seniority, function, location, skills, tenure, past company, and the company they work at. |
| `searchCompanies` | 0 | company filters (as above) + `keywords` + `limit` (default 10, max 2,000) | **Free company search.** Industry, headcount, HQ, technologies, specialties, founded year, description keywords. |
| `lookupPerson` | 0 | `linkedinUrl` **or** `linkedinId` **or** `fullName` + (`companyDomain` / `companyLinkedinUrl` / `companyLinkedinId`) | One person you already have an identifier for → profile, title, current employer. No match, no record. |
| `lookupCompany` | 0 | `domain` **or** `linkedinUrl` **or** `linkedinId` | One company → name, domain, industry, headcount, LinkedIn URL. |

Two extractors, `fetchPeople` and `fetchCompanies`, take the same filters as the searches and pull the result straight into a model (`limit` default 1,000, max 10,000; preview is 10 rows). People unify as **contacts** on LinkedIn URL, companies as **accounts** on domain + LinkedIn URL. Also **0 credits**.

"Free" means no provider credits: Cargo's managed connection absorbs FullEnrich's own 0.25-FullEnrich-credit-per-record charge. On an **own-key** connector that charge lands on the user's FullEnrich account instead. The per-execution node charge in [`../../cargo-billing/SKILL.md`](../../cargo-billing/SKILL.md) still applies.

## What it's for

- ✅ **Free sourcing** — `searchPeople` / `searchCompanies` (0) as the first rung for people and company lists. Pilot it before `aiArk` and `salesNavigator`; demote only when a pilot shows its coverage or filters miss your segment.
- ✅ **Recurring list into a model** — `fetchPeople` / `fetchCompanies` (0) as the extractor behind a model that a play then enriches.
- ✅ **Default email finder** in the prospecting spine — better hit rate than cheap providers (`hunter`/`icypeas` at 0.5 cred), worth the 2× cost when conversion matters.
- ✅ **Reverse-email lookup** — given an email, retrieve LinkedIn + company. Critical for de-anonymizing email-only data sources.
- ✅ **Phone lookup with multi-input flexibility** — accepts any combination of name/domain/company/linkedin.

## Patterns

### Pattern A — Default email finder in the spine

```bash
# After sourcing + (optional) basic enrichment, find emails for the contacts
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findEmail"}' \
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
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"reverseEmailLookup"}' \
  --records '[{"email":"alice@acme.com"},{"email":"bob@globex.com"}]' \
  --wait-until-finished
```

Returns LinkedIn URL + company name + (sometimes) title. Feed the LinkedIn URL into `linkedin.enrichProfile` for full validation per the `linkedin-url-lookup` recipe.

### Pattern C — Combined phone + email

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findPhoneAndEmail"}' \
  --records '[{"firstName":"Alice","lastName":"Smith","linkedinUrl":"…","domainName":"acme.com"}]' \
  --wait-until-finished
```

Cost is 7 credits — same as running `findEmail` (1) + `findPhone` (6) separately. Only use the combined call when API simplicity matters more than the ability to skip phone lookup for low-value rows.

### Pattern D — Free list building

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"searchPeople","config":{}}' \
  --data '{
    "jobRole": {"title_or": ["VP of Sales", "Head of Sales"], "seniority_or": ["VP", "Head"]},
    "industry": {"industry_or": ["Software Development"]},
    "headcount": {"min": 50, "max": 500},
    "personLocation": {"location_or": ["United States"]},
    "limit": 100
  }' \
  --wait-until-finished
```

Filter values are plain strings, not codes — the inverse of `salesNavigator`. Values inside one filter are OR'd, filters are AND'd. `seniority_or`, `function_or` and `company_type_or` take FullEnrich's enums (`Owner, Founder, C-level, Partner, VP, Head, Director, Manager, Senior` for seniority); `industry_or` and `sub_function_or` resolve through the `listIndustries` / `listJobSubFunctions` autocompletes. Domains, company names and LinkedIn URLs match exactly; titles, skills and locations match loosely. Each page returns up to 100 records and the action pages on its own up to `limit`.

## Common pitfalls

- **Free search is still not free downstream.** The list costs nothing; `findEmail` (1) and `findPhone` (6) on every row does. Keep the sample-then-approve gate on the enrichment that follows.
- **`findPhoneAndEmail` is not a discount.** 7 credits = 1 (email) + 6 (phone). Run separately if you want to skip phone lookups for unqualified leads.
- **Multi-input matters.** Hit rate jumps significantly when you pass `linkedinUrl` AND `domainName` together vs. either alone. If you have both, use both.
- **Don't use `findEmail` for verification.** It returns a single best-guess email; some are catch-all and will bounce. Always verify with `waterfall.verifyEmail` (0.1 cred) before using in outreach.

## Anti-patterns

- **snake_case field names.** FullEnrich inputs are **camelCase**: `firstName`, `lastName`, `domainName`, `companyName`, `linkedinUrl`. Do NOT reuse waterfall's `first_name`/`domain` shape here — the exact inverse of the waterfall trap.
- **Shipping a catch-all address on one source.** If `verifyEmail` says catch-all, the address ships only when a second independent finder returned the exact same string; otherwise flag it "unverified".
- **`findPhone` in a default chain.** Phone is the ~10×-email lever — explicit user request and qualified leads only ([`../references/cost-discipline.md`](../references/cost-discipline.md) §5).

## Fallback chain

If `FullEnrich.findEmail` returns nothing for a row, escalate via:

1. `peopleDataLabs.enrichPerson` (3 cred) — heavyweight backfill.
2. Or `hunter.findEmail` (0.5 cred) — different underlying source, sometimes finds what FullEnrich misses.
3. Last resort: `icypeas.findEmail` (0.1 cred).

Don't run all four blindly — the spine is `FullEnrich` first, escalate only on misses. **Demote dynamically**: if FullEnrich misses on the pilot's first ~10 rows of a batch (some segments — e.g. non-LinkedIn-native industries — are outside its coverage), move it behind hunter for the rest of that batch.

## Recurring use

The contact finders have no scheduled fit — a found email is stable data; re-running the finder on a timer just re-bills rows that won't change.

- **In-play shape:** `findEmail` as the CONTACT node of a play triggered by rows entering the segment; gate on the email column still being empty so re-evaluation never re-bills enriched rows.
- **Scheduled pull:** `fetchPeople` / `fetchCompanies` (0) behind a model are the natural recurring source — the extractor refreshes the list, and a play on rows entering the model pays for enrichment on net-new rows only.
- **Recurring niche:** `reverseEmailLookup` (1) on newly captured email-only rows (webforms, `snitcher.searchSessions`) — gate on the LinkedIn-URL column being empty.
- **Phone stays out of recurring chains:** `findPhone` (6) is explicit-request + qualified rows only (see Anti-patterns) — never wire it into a play's default path.

## Action shape

`{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"<slug>"}`. **No `connectorUuid` in `config`.** Note the capitalization: `FullEnrich` (camel-case starting with capital `F`).
