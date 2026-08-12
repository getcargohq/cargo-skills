---
provider: aiArk
category: enrichment
last-reviewed: 2026-07-25
---

# aiArk (AI Ark)

LinkedIn-anchored people/company data with an unusually cheap enrich-and-email combo, a personality-analysis action nothing else in the catalog has, and per-record search that bills at the bottom of the catalog. **All six actions are credits-based and run on cargo's managed connection** — no own-key connector required (unlike `apolloio`, where only two are). Category `enrichment`, sub-category list-building. Reach for it when you hold **LinkedIn URLs** (cheapest profile+email at 0.1), need a **mobile phone** cheaply (0.5 vs the 3+ phone tier), want **lookalike-company** discovery (0.01/record), or need **personality/selling guidance** for personalization. **In the priority stack** ([`../SKILL.md`](../SKILL.md) §5) as the URL-anchored enrich rung and the cheapest per-record search — but it doesn't displace the sourcing-first spine: `salesNavigator` (0.02/lead) still leads plain at-scale people sourcing, and `cargo` native still owns match-verified firmographics.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrichPerson` | **0.1** | `linkedinUrl` **or** `id` (AI-Ark person ID from a prior `searchPeople`) | Full person profile **+ verified email** in one call. Bills **0** when no email is found. |
| `reverseLookup` | **0.05** | `search` (an email address **or** a phone number) | Resolve a full person profile from an email or phone. Bills **0** on no match. |
| `analyzePersonality` | **0.05** | `linkedinUrl` | Personality insights (OCEAN, DISC) + tailored **selling and hiring guidance**. Bills **0** on no match. |
| `findMobilePhone` | **0.5** | `linkedinUrl` **or** (`domain` + `name`) | Mobile phone number. Bills **0** when nothing is found. |
| `searchPeople` | **0.05 / returned record** | contact + account filter **groups** (see below) + `limit` (default 10, max 100) | Filter-rich people search (title, seniority, department, education, skills, tenure, past company, firmographics). |
| `searchCompanies` | **0.01 / returned record** | account filter **groups** + `lookalikeDomains` (≤5 domains/LinkedIn URLs) + `limit` (default 10, max 100) | Cheapest company search in the catalog + lookalike discovery. |

Two extractors (`fetchPeople`, `fetchCompanies`) also exist for syncing search results straight into a model — same filter shape, bulk export up to 10,000 rows. Use them from a CDK/model-sync context; recipes here use the actions.

## What it's for

- ✅ **URL-in-hand enrich + email** — `enrichPerson` (0.1) returns the full profile **and** a verified email from a LinkedIn URL, cheaper than `linkedin.enrichProfile` (0.25) which returns no email, and it only bills when it actually finds an email.
- ✅ **Cheap mobile phone** — `findMobilePhone` (0.5) undercuts the whole phone tier (`prospeo.findPhone` 3, `FullEnrich.findPhone` 6). Mobile-only, LinkedIn-URL or domain+name anchored, billed only on a hit.
- ✅ **Lookalike-company sourcing** — `searchCompanies` with `lookalikeDomains` at 0.01/record: seed up to 5 domains, get similar companies for less than `oceanio` / `companyEnrich` lookalikes.
- ✅ **Rich people search** — `searchPeople` filters on education, skills, tenure windows, seniority, department, and past company that `salesNavigator` can't express, at 0.05/record.
- ✅ **Reverse lookup** — `reverseLookup` (0.05) turns a stray email or phone back into a profile.
- ✅ **Personalization signal** — `analyzePersonality` (0.05) is unique: OCEAN/DISC + selling guidance to feed the WRITE step.
- ❌ **Generic at-scale sourcing** — for plain industry/size/geo lead lists, `salesNavigator.searchLeads` (0.02) is still cheaper per record.

## Patterns

### Pattern A — Enrich + get a verified email from a LinkedIn URL (ENRICH + CONTACT in one)

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichPerson","config":{}}' \
  --records '[
    {"linkedinUrl":"https://linkedin.com/in/alicesmith"},
    {"linkedinUrl":"https://linkedin.com/in/bobjones"}
  ]' \
  --wait-until-finished
```

`linkedinUrl` **or** `id` is required (one of the two, or the call errors). Rows where AI Ark returns no email cost **0** — you're only billed on a found email.

### Pattern B — Cheapest mobile phone

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"findMobilePhone","config":{}}' \
  --records '[
    {"linkedinUrl":"https://linkedin.com/in/alicesmith"},
    {"domain":"globex.com","name":"Bob Jones"}
  ]' \
  --wait-until-finished
```

Provide a `linkedinUrl`, **or** both `domain` and `name` (a domain or a name alone errors). Misses cost 0.

### Pattern C — Company search with lookalike seeds

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"searchCompanies","config":{}}' \
  --data '{
    "lookalikeDomains": ["stripe.com", "adyen.com"],
    "industry": {"industry_or": ["Financial Services"]},
    "employeeSize": {"min_employee_count": 50, "max_employee_count": 1000},
    "limit": 50
  }' \
  --wait-until-finished
```

Billed **per returned record** — `limit` is your budget cap; size the pool first per [`../references/cost-discipline.md`](../references/cost-discipline.md).

### Pattern D — People search (filters salesNavigator can't express)

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"searchPeople","config":{}}' \
  --data '{
    "jobRole": {"title_or": ["VP Engineering"], "seniority_or": ["VP"]},
    "personLocation": {"location_or": ["United States"]},
    "industry": {"industry_or": ["Software"]},
    "employeeSize": {"min_employee_count": 200},
    "limit": 25
  }' \
  --wait-until-finished
```

## Filter shape — read before building a search

`searchPeople` / `searchCompanies` filters are **nested groups**, not a flat map. Each group is one config key holding suffixed sub-keys:

- **Person groups** (`searchPeople` only): `peopleInfo` (`full_name_or`, `linkedin_url_or`, …), `personLocation`, `jobRole` (`title_or`, `previous_title_or`, `seniority_or`, `department_or`), `currentAndPastCompany`, `experience`, `skills`, `education`, `languageSkills`, `certification`, `profileBadge`, `personKeywords`, `personSocialMedia`, `socialMediaFollowers`.
- **Company groups** (both actions): `companyInfo` (`domain_or`, `name_or`, `linkedin_url_or`, …), `industry`, `companyLocation`, `companyKeywords`, `productAndServices`, `companyType`, `technologies`, `naics`, `employeeSize` (`min_employee_count`/`max_employee_count`), `annualRevenue`, `funding` (`funding_type`, `min_total_funding`/`max_total_funding`), `operationLanguage`, `locationCount`, `foundedYear`, `companySocialMedia`, `employeeRole`, `employeeByDepartment`, `headcountGrowth`.

Conventions inside a group:

- **`_or` includes, `_not` excludes.** e.g. `{"jobRole": {"title_or": ["CTO"], "seniority_not": ["Entry"]}}`.
- **Single value or array** — every `_or`/`_not` key accepts a string or an array of strings.
- **Enum-backed fields come from autocompletes** — `industry`, `seniority`, `department`, `funding_type`, and language values must be valid enum members; resolve them via the integration's autocompletes: `listIndustries`, `listSeniorities`, `listDepartmentsAndFunctions`, `listCompanyDepartments`, `listFundingTypes`, `listLanguages`.
- **Numeric ranges are numbers**, not strings — `min_employee_count: 50` (contrast the old proxycurl shape, which took stringified numbers).

## Common pitfalls

- **`searchPeople` company filters key on AI-Ark company IDs.** `currentAndPastCompany.current_company_id_or` wants AI Ark's own company IDs — get them from a `searchCompanies` call first, don't pass a domain there (use `companyInfo.domain_or` for domain-based company matching).
- **`enrichPerson.id` is an AI-Ark person ID**, not a generic one — it comes from a prior `searchPeople` result. With no `id`, pass `linkedinUrl`.
- **Search bills per returned record.** `limit` (default 10, max 100) is the cap; a stray high limit paginates and bills every row. The 0.01/0.05 rate is per *result*, not per call.
- **`findMobilePhone` is mobile-only** and needs a `linkedinUrl` or a full `domain` + `name` pair — it won't resolve from a name alone.
- **Rate limit: 300 calls/minute** (spread) — large batches stretch out; fine for enrich, plan for it on big searches.
- **Flat filter maps express nothing.** `{"title": "CTO"}` at the top level is ignored — it must be `{"jobRole": {"title_or": "CTO"}}`.

## Anti-patterns

- **Running `enrichPerson` and a separate email-finder.** `enrichPerson` already returns a verified email at 0.1 and bills 0 on a miss — don't chain `FullEnrich.findEmail` (1) behind it unless it came back empty.
- **Reaching for the 3–7 credit phone tier by default.** With a LinkedIn URL in hand, `findMobilePhone` (0.5) is the first stop; escalate to `prospeo`/`FullEnrich`/`waterfall` only on a miss and only when a landline/DID is acceptable.
- **Personality analysis at scale "for color".** `analyzePersonality` earns its 0.05 on qualified, about-to-be-contacted leads feeding the WRITE step — not on a raw sourced list.

## Position in the waterfall

- `enrichPerson` — **ENRICH + CONTACT (person)** for URL-in-hand rows: profile + verified email at 0.1, ahead of `linkedin.enrichProfile` (0.25, no email) and the pricier `waterfall.enrichContact` (2) / `FullEnrich.findEmail` (1) chain.
- `findMobilePhone` — **new cheapest phone rung** (0.5) ahead of `prospeo.findPhone` (3); mobile-only, so keep the higher tiers for landline/DID fallback.
- `searchCompanies` / `searchPeople` — **SOURCE** (0.01 / 0.05 per record): `searchCompanies` is the cheapest account search in the stack and the lookalike path; `searchPeople` covers the filters `salesNavigator` can't express (education, skills, tenure, past company).
- `reverseLookup` — **niche**: email/phone → profile, beside `FullEnrich.reverseEmailLookup` (2, email → LinkedIn URL).
- `analyzePersonality` — **WRITE/personalization input**, outside the credits spine's find-and-verify path.

## Recurring use

- **Scheduled search:** `searchCompanies` / `searchPeople` fit a weekly sourcing tool (persona/company searches → weekly; cadence table: [`../recipes/save-as-play.md`](../recipes/save-as-play.md)) — but they bill 0.01/0.05 **per returned record on every run**, so dedup results against the workspace model (`cargo.matchBusiness` / `matchProspect`) before any paid downstream node.
- **In-play gate:** `enrichPerson` runs only where `email` is still empty; `findMobilePhone` only where the phone column is empty. Misses bill 0, but a hit on an already-filled row is pure re-spend.
- **Stable data:** profiles and emails don't decay week to week — never schedule blanket re-enrichment; `analyzePersonality` belongs in a play's WRITE step on newly qualified rows, not on a timer (see anti-patterns).

## Action shape

`{"kind":"connector","integrationSlug":"aiArk","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.** For top-level `action execute` / `execute-batch`, inputs go in `--data` (single) or `--records` (batch), **not** in the action `config`.
