# Stage → cheapest credits-based action map

Canonical reference for picking the cheapest credits-based action per GTM stage across the full 120-integration cargo catalog. Use this when the priority-stack default doesn't have what you need.

Prices are credits/record. "Priority?" marks providers in the priority stack (salesNavigator / cargo / aiArk / waterfall / FullEnrich / apolloio / theirStack / peopleDataLabs).

## Sourcing — Search people

| Provider | Action | Cost | Priority? | Notes |
|---|---|---|---|---|
| salesNavigator | searchLeads | 0.02 | ✅ | LinkedIn-anchored. Default at-scale. |
| icypeas | findPeople | 0.02 |   | Cheapest non-LinkedIn source. |
| aiArk | searchPeople | 0.05 | ✅ | Rich filters (education, skills, tenure, seniority, past company). Per returned record. |
| firecrawl | search | 0.05 |   | Web search; use when no structured provider has the data. |
| linkup | search | 0.5 |   | Web search with structured answers. |
| contactOut | search | 1 |   | Mid-tier when other sources miss. |
| oceanio | searchPeople | 1 |   | Mid-tier. |
| peopleDataLabs | searchPeople / queryPeople | 3 | ✅ | Heavyweight. `searchPeople` uses cargo's `{conjonction, groups, conditions}` filter; `queryPeople` takes a PDL **SQL string**. |
| waterfall | searchProspects | 3 | ✅ | Multi-source; useful when LinkedIn isn't enough. |

## Sourcing — Search companies

| Provider | Action | Cost | Priority? | Notes |
|---|---|---|---|---|
| aiArk | searchCompanies | 0.01 | ✅ | **Cheapest in catalog.** Per returned record; supports `lookalikeDomains` (≤5 seeds). |
| icypeas | findCompanies | 0.02 |   | Cheapest non-lookalike. |
| salesNavigator | searchAccounts | 0.05 | ✅ | LinkedIn-anchored. Default at-scale. |
| theirStack | searchCompanies | 0.5 | ✅ | Tech-stack + hiring-intent filter. |
| oceanio | searchCompanies | 1 |   | Mid-tier. |
| peopleDataLabs | searchCompanies / queryCompanies | 3 | ✅ | `searchCompanies` uses cargo's `{conjonction, groups, conditions}` filter shape; `queryCompanies` takes a PDL **SQL string**. Investor/funding filters require the SQL variant. |

## Sourcing — Local SMBs

| Provider | Action | Cost | Notes |
|---|---|---|---|
| serper | searchPlaces | 1 | Google Maps-style. Default for SMB / storefront / service-area. |
| firecrawl | search | 0.05 | Web search fallback. |

## Enrich — Person

| Provider | Action | Cost | Priority? | Notes |
|---|---|---|---|---|
| aiArk | enrichPerson | 0.1 | ✅ | **Default in priority stack when a LinkedIn URL is in hand.** LinkedIn URL → full profile **+ verified email**; bills 0 on no-email. Cheapest URL-anchored enrich that also returns an email. |
| contactOut | enrich | 0–3 |   | Variable cost depending on data returned. |
| linkedin | enrichProfile | 0.25 |   | LinkedIn-anchored (no email). |
| prospeo | enrichLinkedin | 0.5 |   | Cheapest LinkedIn URL → details. |
| linkedin | enrichProfileFromName | 0.5 |   | Name+company → LinkedIn details. |
| apolloio | enrichPerson | 1 (**3** with `revealPhoneNumber`) | ✅ | Niche-coverage rung — promote per-batch only when a pilot shows Apollo hits where cargo/waterfall miss. |
| cargo | enrichProspectDetails | 2 | ✅ | After matchProspect. Default in priority stack. |
| waterfall | enrichContact | 2 | ✅ | Multi-source contact enrichment. |
| peopleDataLabs | enrichPerson | 3 | ✅ | Heavyweight backfill. |

## Enrich — Company

| Provider | Action | Cost | Priority? | Notes |
|---|---|---|---|---|
| companyEnrich | enrichByDomain | 0.25 |   | Cheapest by domain. |
| linkedin | enrichCompany | 0.25 |   | LinkedIn ID-based. |
| linkedin | enrichCompanyFromDomain | 0.5 |   | Domain → LinkedIn-anchored details. |
| cargo | enrichBusinessFirmographics | 0.5 | ✅ | After matchBusiness. Default in priority stack. |
| apolloio | enrichOrganization | 1 | ✅ | Apollo-anchored; the niche-coverage rung when cargo's match misses. |
| oceanio | enrichCompany | 1 |   | Mid-tier. |
| reverseContact | enrichCompanyFromLinkedin | 1 |   | Niche: LinkedIn URL → company. |
| waterfall | enrichCompany | 1 | ✅ | Multi-source. |
| peopleDataLabs | enrichCompany | 3 | ✅ | Heavyweight backfill. |

## Find email

| Provider | Action | Cost | Priority? | Notes |
|---|---|---|---|---|
| icypeas | findEmail | 0.1 |   | Cheapest. Use as cheap-fallback. |
| findyMail | findEmail | 0.5 |   | Mid-tier. |
| hunter | findEmail | 0.5 |   | Mid-tier; different underlying source. |
| leadMagic | findEmail | 0.5 |   | Mid-tier. |
| prospeo | findEmail | 0.5 |   | Mid-tier. |
| FullEnrich | findEmail | 1 | ✅ | **Default in priority stack** — best hit rate. |
| dropcontact | findEmail | 1 |   | French data tier. |
| datagma | findEmail | 1 |   | Alt mid-tier. |
| enrichCrm | findEmail | 1 |   | CRM-friendly fallback. |
| enrowio | findEmail | 1 |   | Alt mid-tier. |

> **Check step 3 before paying here.** `aiArk.enrichPerson` (0.1, Enrich — Person above) already returns a verified email from a LinkedIn URL and bills 0 when it finds none — run this stage on the residue it left empty, not on the whole list.

## Verify email

| Provider | Action | Cost | Priority? | Notes |
|---|---|---|---|---|
| icypeas | verifyEmail | 0.01 |   | **Cheapest in catalog.** Use for very large verifies. |
| kitt | verifyEmail | 0.05 |   |   |
| enrichley | verify | 0.1 |   |   |
| enrowio | verifyEmail | 0.1 |   |   |
| prospeo | verifyEmail | 0.1 |   |   |
| waterfall | verifyEmail | 0.1 | ✅ | **Default in priority stack** — multi-source. |
| zeroBounce | verifyEmail | 0.1 |   |   |
| neverBounce | verifyEmail | 0.2 |   |   |
| findyMail | verifyEmail | 0.25 |   |   |
| bouncer | verifyEmail | 0.3 |   |   |
| hunter | verifyEmail | 1 |   | Most expensive — avoid unless other tier is failing. |

## Find phone

| Provider | Action | Cost | Priority? | Notes |
|---|---|---|---|---|
| aiArk | findMobilePhone | 0.5 | ✅ | **Cheapest.** Mobile-only; needs a LinkedIn URL or domain+name. Bills 0 on miss. First stop with a URL in hand. |
| prospeo | findPhone | 3 |   | Cheapest landline/DID; escalate from aiArk on a mobile miss. |
| apolloio | enrichPerson (`revealPhoneNumber: true`) | 3 | ✅ | Phone bundled into the person enrich (1 → 3) — only worth it when you were enriching with Apollo anyway. |
| forager | findPhone | 5 |   | Mid-tier. |
| findyMail | findPhone | 5 |   | Mid-tier. |
| FullEnrich | findPhone | 6 | ✅ | Better hit rate; escalate from prospeo. |
| waterfall | findPhone | 7 | ✅ | Multi-source; last-resort priority stack. |
| FullEnrich | findPhoneAndEmail | 7 | ✅ | Combined call. No discount over running both. |
| datagma | findPhone | 8 |   |   |
| cleon1 | findPhoneFromLinkedin | 15 |   | Premium; LinkedIn-anchored. |

## LinkedIn URL lookup

| Provider | Action | Cost | Notes |
|---|---|---|---|
| linkedin | findProfileUrl | 0.25 | Default. See `recipes/linkedin-url-lookup.md` for validation pattern. |
| linkedin | enrichProfile | 0.25 | Validation step after findProfileUrl. |
| FullEnrich | reverseEmailLookup | 2 | Email → LinkedIn URL. Unique action. |

## Job change signal

| Provider | Action | Cost | Notes |
|---|---|---|---|
| waterfall | detectJobChange | 3 | **Only credits-based job-change action in entire catalog.** Cargo-unique strength. |

## Funding signal

| Provider | Action | Cost | Notes |
|---|---|---|---|
| cargo | enrichBusinessFundingAndAcquisitions | 0.5 | Cheapest. |
| enrichCrm | getFunding | 1 | Alternative. |

## Tech-stack signal

| Provider | Action | Cost | Notes |
|---|---|---|---|
| cargo | enrichBusinessTechnographics | 1 | Cargo-native. |
| theirStack | searchTechnologies | 0.5 | Catalog-style lookup. |

## Hiring intent

| Provider | Action | Cost | Notes |
|---|---|---|---|
| theirStack | searchJobs | 0.5 | Default. |

## Warm intros

| Provider | Action | Cost | Notes |
|---|---|---|---|
| theSwarm | searchWarmIntrosToCompany | 2 | Find warm-intro paths to a company. |
| theSwarm | searchWarmIntrosToPerson | 2 | Find warm-intro paths to a specific person. |

## Visitor identification

| Provider | Action | Cost | Notes |
|---|---|---|---|
| snitcher | searchSessions | 0 | Free credits-tier. De-anonymize site visitors. |

## Web research

| Provider | Action | Cost | Priority? | Notes |
|---|---|---|---|---|
| parallel | extract | 0.025 **per URL** | ✅ | **Cheapest page read in the catalog.** Takes an `objective` to steer extraction. |
| serper | search | 0.05 (fixed) |   | Google results, **fixed per query for up to 100** — raise `limit`, never the query count. |
| firecrawl | scrape / search / crawl | 0.05 **per item** |   | Reach for `crawl` when you need a whole site rather than a URL list. |
| parallel | createTask | 0.125 (`lite`) | ✅ | **Unique.** Agentic research filling a caller-supplied `outputSchema`. Ladder runs to 60 (`ultra8x`); `processor` is required, so the tier is always deliberate. |
| parallel | search | 0.125 fixed **+ 0.025/item** |   | Objective-steered ranked search. |
| exa | search | 0.175 fixed **+ 0.025/item** |   | The only rung with a **`category` filter** (`company`, `news`, `financial report`, …) and publication-date bounds. `searchType: "deep"` raises the fixed part to 0.3. |
| linkup | search | 0.5 standard / 2 deep |   | Web search with answers. |
| linkup | instruct | 1 |   | Sourced or schema-structured answers in one call. |

**Corrected 2026-08-15**: this table priced `serper.search` at **1**. It is **0.05**, verified against the live integration catalog, and the 20x error was steering agents away from the cheapest search rung. `provider-playbooks/serper.md` had it right throughout.

Picking between them: **known URL → `parallel.extract`. Plain keyword query → `serper.search`. Needs a document-type or date filter → `exa.search`. Needs structured output → `parallel.createTask` at `lite`.** Reach for `linkup.instruct` only when a prose sourced answer is genuinely what you want, since it is 8x `createTask` at `lite`.

## LLM (instruct)

| Provider | Action | Cost (cheapest model) | Notes |
|---|---|---|---|
| openAi | instruct | 0.006 (nano) | Cheapest at-scale; gpt-5-nano. |
| gemini | instruct | 0.01 (Flash) | Cheap large-context. |
| anthropic | instruct | 0.2 (Haiku) | Default for high-quality reasoning + structured output. |
| perplexity | instruct | 0.3 (Sonar) | Web-grounded research with citations. |

## Notes on this map

- All 145 credits-based actions documented. Free CRUD actions (sequencer / CRM upserts, list/get/delete) not shown — they don't consume credits.
- Costs are per-record at the cheapest config. Some actions have variable cost by config (e.g., `contactOut.enrich` returns 0/1/2/3 credits depending on data returned).
- Priority stack: see `../SKILL.md` for the canonical 8-provider priority list and `../provider-playbooks/` for per-provider deep dives.
