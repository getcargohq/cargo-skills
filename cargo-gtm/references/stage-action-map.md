# Stage → cheapest credits-based action map

Canonical reference for picking the cheapest credits-based action per GTM stage across the full 136-integration cargo catalog. Use this when the priority-stack default doesn't have what you need.

Prices are credits/record. "Priority?" marks providers in the priority stack (salesNavigator / aiArk / waterfall / FullEnrich / apolloio / theirStack / peopleDataLabs).

This map is **curated** — the cheapest few rungs per stage, with the routing judgement attached. For the complete machine-generated list of all 176 credits-based actions, including per-config pricing, see [`credits-cost-table.md`](credits-cost-table.md).

**Size before you spend.** `aiArk.countPeople` and `aiArk.countCompanies` cost **0** and return how many records a filter matches without retrieving them. Run the count, quote it, then decide whether to pay for the search.

## Sourcing — Search people

| Provider | Action | Cost | Priority? | Notes |
|---|---|---|---|---|
| aiArk | countPeople | **0** | ✅ | Not a source — counts matches for a filter. Run this first. |
| apolloio | searchPeople | 0 / **1** per person | ✅ | **0 with `shouldEnrich: false`** (identity only), 1 when it enriches. Cheapest way to test whether Apollo has the audience at all. |
| salesNavigator | searchLeads | 0.02 | ✅ | LinkedIn-anchored. Default at-scale. |
| icypeas | findPeople | 0.02 |   | Cheapest non-LinkedIn source. |
| aiArk | searchPeople | 0.05 | ✅ | Rich filters (education, skills, tenure, seniority, past company). Per returned record. |
| firecrawl | search | 0.05 |   | Web search; use when no structured provider has the data. |
| linkup | search | 0.5 |   | Web search with structured answers. |
| contactOut | search | 1 / item (**3** with `revealInfo: true`) |   | Mid-tier when other sources miss. |
| oceanio | searchPeople | 1 |   | Mid-tier. |
| proxycurl | search | 1 / item |   | Last resort. Unique filters: profile free-text (`headline`, `summary`, `*_job_description`), `linkedin_groups`/`interests`/`languages`, an **absolute** role-start date, and `public_identifier_not_in_list`. Education/skills/tenure/funding are `aiArk.searchPeople` at 0.05 — 20x cheaper. See [`../provider-playbooks/proxycurl.md`](../provider-playbooks/proxycurl.md). |
| peopleDataLabs | searchPeople / queryPeople | 3 | ✅ | Heavyweight. `searchPeople` uses cargo's `{conjonction, groups, conditions}` filter; `queryPeople` takes a PDL **SQL string**. |
| waterfall | searchProspects | 3 | ✅ | Multi-source; useful when LinkedIn isn't enough. |

## Sourcing — Search companies

| Provider | Action | Cost | Priority? | Notes |
|---|---|---|---|---|
| aiArk | countCompanies | **0** | ✅ | Not a source — counts matches for a filter. Run this first. |
| aiArk | searchCompanies | 0.01 | ✅ | **Cheapest in catalog.** Per returned record; supports `lookalikeDomains` (≤5 seeds). |
| apolloio | searchOrganizations | 0.01 / organization | ✅ | Ties aiArk on price. Firmographic, funding, technology and hiring filters. |
| icypeas | findCompanies | 0.02 |   | Cheapest non-lookalike. |
| salesNavigator | searchAccounts | 0.05 | ✅ | LinkedIn-anchored. Default at-scale. |
| theirStack | searchCompanies | 0.5 | ✅ | Tech-stack + hiring-intent filter. |
| oceanio | searchCompanies | 1 |   | Mid-tier. |
| peopleDataLabs | searchCompanies / queryCompanies | 3 | ✅ | `searchCompanies` uses cargo's `{conjonction, groups, conditions}` filter shape; `queryCompanies` takes a PDL **SQL string**. Investor/funding filters require the SQL variant. |

## Sourcing — Local SMBs

| Provider | Action | Cost | Notes |
|---|---|---|---|
| serper | searchPlaces | 0.05 | Google Maps-style, **fixed per query**. Default for SMB / storefront / service-area. |
| firecrawl | search | 0.05 | Web search fallback; same price, unstructured results. |

## Enrich — Person

| Provider | Action | Cost | Priority? | Notes |
|---|---|---|---|---|
| aiArk | enrichPerson | 0.1 | ✅ | **Default in priority stack when a LinkedIn URL is in hand.** LinkedIn URL → full profile **+ verified email**; bills 0 on no-email. Cheapest URL-anchored enrich that also returns an email. |
| contactOut | enrich | 0–3 |   | Variable cost depending on data returned. |
| linkedin | enrichProfile | 0.25 |   | LinkedIn-anchored (no email). |
| prospeo | enrichLinkedin | 0.5 |   | Cheapest LinkedIn URL → details. |
| linkedin | enrichProfileFromName | 0.5 |   | Name+company → LinkedIn details. |
| apolloio | enrichPerson | 1 (**9** with `revealPhoneNumber`) | ✅ | Niche-coverage rung — promote per-batch only when a pilot shows Apollo hits where aiArk/waterfall miss. The phone flag is **9x**, not a small uplift. |
| waterfall | enrichContact | 2 | ✅ | Multi-source contact enrichment. |
| peopleDataLabs | enrichPerson | 3 | ✅ | Heavyweight backfill. |
| datagma | enrichPerson | 8 |   | LinkedIn URL or work email → profile. Priced as a phone rung; use only when cheaper rungs miss. |

**From an email rather than a URL:** `aiArk.reverseLookup` (0.05) is the cheapest, then `companyEnrich.lookupPerson` (0.25, resolves the company from the domain), then `contactOut.enrich` (0–3 by config), then `datagma.enrichPersonFromPersonalEmail` (2, the only rung that takes a **personal** address — non-EU only).

## Enrich — Company

| Provider | Action | Cost | Priority? | Notes |
|---|---|---|---|---|
| aiArk | enrichCompany | 0.01 | ✅ | **Cheapest in catalog.** Firmographics from a domain or LinkedIn URL. |
| companyEnrich | enrichByDomain | 0.25 |   | Fuller field set than aiArk when 0.01 comes back thin. |
| companyEnrich | getWorkforce | 0.25 |   | Historical headcount **by department** — a growth signal nothing else in the catalog returns. |
| linkedin | enrichCompany | 0.25 |   | LinkedIn ID-based. |
| prospeo | enrichCompany | 0.5 |   | Alt mid-tier. |
| linkedin | enrichCompanyFromDomain | 0.5 |   | Domain → LinkedIn-anchored details. |
| apolloio | enrichOrganization | 1 | ✅ | Apollo-anchored; the niche-coverage rung when the cheaper rungs miss. |
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
| forager | findPhone | 5 |   | Mid-tier. |
| findyMail | findPhone | 5 |   | Mid-tier. |
| FullEnrich | findPhone | 6 | ✅ | Better hit rate; escalate from prospeo. |
| waterfall | findPhone | 7 | ✅ | Multi-source; last-resort priority stack. |
| FullEnrich | findPhoneAndEmail | 7 | ✅ | Combined call. No discount over running both. |
| datagma | findPhone | 8 |   |   |
| apolloio | enrichPerson (`revealPhoneNumber: true`) | **9** | ✅ | Phone bundled into the person enrich (1 → 9). Rarely the right call: at 9 it is dearer than every dedicated phone rung except cleon1. |
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
| enrichCrm | getFunding | 1 | Only credits-based funding action in the catalog. |

## Tech-stack signal

| Provider | Action | Cost | Notes |
|---|---|---|---|
| builtwith | getDomainSummary | **0** | Free tier — technology-group *counts* for a domain. Enough to bucket accounts before paying for detail. |
| theirStack | searchTechnologies | 0.5 | Catalog-style lookup. |
| builtwith | enrichDomain | 1 | Full stack + metadata for one domain. |

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

## LinkedIn audience extraction

Everything here is **0.05 per item returned** and needs a LinkedIn URL in hand. They read an audience that already engaged with something, which is a cheaper and warmer starting point than a cold title search.

| Provider | Action | Cost | Notes |
|---|---|---|---|
| linkedin | extractEventAttendees | 0.05 / item | Attendees of a LinkedIn event. |
| linkedin | searchPostComments / searchPostReactions | 0.05 / item | Who engaged with a specific post. |
| linkedin | extractProfilePostActivity / extractProfileCommentActivity / extractProfileReactionActivity | 0.05 / item | What one person has been posting, commenting on, reacting to. |
| linkedin | extractFollowers / extractPageFollowers | 0.05 / item | A profile's or page's followers. |
| linkedin | extractProfileViewers / extractCompanyViewers | 0.05 / item | Who viewed the profile / company page. |
| linkedin | extractCompanyEmployeesInsights | 0.25 | Aggregate view of a company's employees. |
| linkedin | extractSimilarCompanies | 0.25 | Lookalikes from LinkedIn's own graph. |

These act through a real LinkedIn identity — the engagement actions (`connectProfile`, `commentPost`, `messageProfile`, all 0.25) are rate-and-conduct sensitive and must never be batch-blasted. See [`../provider-playbooks/linkedin.md`](../provider-playbooks/linkedin.md) and [`acceptable-use.md`](acceptable-use.md) §2.

## Social profiles (non-LinkedIn)

| Provider | Action | Cost | Notes |
|---|---|---|---|
| x | `getUserProfile` / `getUserPosts` / `getFollowers` / `getPostLikers` / `searchPosts` … (14 actions) | 0.02 | Everything X. Cheapest social rung in the catalog. |
| brightData | `scrapeInstagramProfile` / `scrapeTikTokProfile` / `scrapeFacebookProfile` / `scrapeFacebookPagePosts` / `scrapeYouTubeChannel` | 0.1 | **Only** coverage for these four platforms. One profile URL in, profile out. |
| brightData | `scrapeTwitterProfile` | 0.1 | 5x `x.getUserProfile` for less. Fallback only. |

Consumer platforms: read **brand, creator and agency accounts as company records**. Building person records from a named individual's personal social profile is a consumer-targeting refusal under [`acceptable-use.md`](acceptable-use.md) §2 — see [`../provider-playbooks/brightData.md`](../provider-playbooks/brightData.md).

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

**Corrected 2026-08-20**, all verified against the live catalog: `serper.searchPlaces` was priced at **1**, the same 20x error as `search` above, missed in the previous pass — it is **0.05**. `apolloio.enrichPerson` with `revealPhoneNumber` was priced at **3**; it is **9**. `anthropic.instruct`'s cheapest rung was labelled 0.2 (Haiku); Haiku 3.5 is **0.05** and 0.2 is Sonnet. `prospeo.verifyEmail` was listed at 0.1 and **no longer exists** in the catalog. `aiArk.enrichCompany` (**0.01**, the cheapest company enrich there is) was missing from Enrich — Company entirely.

Picking between them: **known URL → `parallel.extract`. Plain keyword query → `serper.search`. Needs a document-type or date filter → `exa.search`. Needs structured output → `parallel.createTask` at `lite`.** Reach for `linkup.instruct` only when a prose sourced answer is genuinely what you want, since it is 8x `createTask` at `lite`.

## LLM (instruct)

| Provider | Action | Cost (cheapest model) | Notes |
|---|---|---|---|
| openAi | instruct | 0.006 (gpt-5-nano) | Cheapest at-scale. Ladder to 0.5 (gpt-4o). |
| gemini | instruct | 0.01 (1.5/2.0 Flash) | Cheap large-context. Ladder to 0.25 (3.6 Flash). |
| anthropic | instruct | 0.05 (Haiku 3.5) | **0.2 for Sonnet**, 2 for Opus, 4 for Fable 5. Default for high-quality reasoning + structured output. |
| perplexity | instruct | 0.3 (Sonar, `searchContextSize: low`) | Web-grounded research with citations. Ladder to 1 (sonar-pro, high). |

Prices are **per 1k tokens**, not per record. On openAi, gemini and anthropic, `advancedSettings.withWebSearch: true` adds a **0.4 flat charge per call** on top — cheap per token, expensive per row in a batch. Per-model pricing is in [`credits-cost-table.md`](credits-cost-table.md).

## Notes on this map

- This map is curated, not exhaustive: it carries the cheapest rungs per stage plus the routing judgement. The complete list of all **176** credits-based actions is generated from the live catalog into [`credits-cost-table.md`](credits-cost-table.md) — regenerate it from `cargo-ai orchestration action list --kind connector` and `--kind native`, which return a `credits` array on every billed action. The other 337 catalog actions (sequencer / CRM upserts, list/get/delete) carry no provider price and appear in neither — though every node execution still bills 0.01 credits.
- Costs are per-record at the cheapest config. Some actions have variable cost by config (e.g., `contactOut.enrich` returns 0/1/2/3 credits depending on data returned).
- Priority stack: see `../SKILL.md` for the canonical 8-provider priority list and `../provider-playbooks/` for per-provider deep dives.
