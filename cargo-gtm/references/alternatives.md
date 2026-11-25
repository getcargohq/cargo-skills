# Alternative provider chains

When the priority stack (salesNavigator / aiArk / waterfall / FullEnrich / apolloio / theirStack / peopleDataLabs) can't serve the user's criteria, swap in providers from the long tail.

For every alternative, see [`stage-action-map.md`](stage-action-map.md) for the cheapest credits-based action per stage across the full 136-integration catalog.

## When to swap providers

Only swap when:

1. **Filter mismatch**: priority provider doesn't expose the filter you need (e.g., salesNavigator can't filter by funding round → escalate to peopleDataLabs.queryCompanies).
2. **Coverage gap**: priority provider doesn't have data for the niche (e.g., local SMBs aren't well-covered by salesNavigator → escalate to serper.searchPlaces).
3. **Premium quality required**: on email and phone the default is already Cargo's native waterfall tools (Find email, Find phone), which walk several providers; a single provider below is not an upgrade over them.

**Email, phone and LinkedIn-from-email are not swapped for cost or habit.** They default to the native tools in [`../SKILL.md`](../SKILL.md#contact-data-cargos-native-tools-first-mandatory-default); the single-provider rows below apply only when the user names a provider, explicitly asks for the cheapest path, the tool is missing from the workspace, or the row lacks the tool's input. Say which.

Default rule: **don't swap to chase 2× cheaper if hit-rate drops 30%**. The total credit spend across a chain is dominated by misses (re-running across stages), not by the per-call cost.

## Sourcing alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| At-scale lead search | FullEnrich.searchPeople (**0**) **or** salesNavigator.searchLeads (0.2) | icypeas.findPeople (0.02 per 100 records) | When LinkedIn coverage is thin (e.g., privacy-focused industries). |
| At-scale account search | FullEnrich.searchCompanies (**0**), salesNavigator.searchAccounts (0.2) **or** aiArk.searchCompanies (0.01) | oceanio.searchCompanies (1) | aiArk is 20× cheaper and takes lookalike seeds (≤5 domains), oceanio when the filter is technographic / web-traffic shaped. |
|   |   | peopleDataLabs.searchCompanies (3) for cargo-filter shape, or queryCompanies (3) for SQL | When salesNavigator's filters miss (funding, complex bool). PDL has no investor field: investor sourcing goes to `theirStack.searchCompanies` (`company_investors_partial_match_or`). |
| Tech-intent sourcing | theirStack.searchJobs / searchCompanies (0.5 per returned item) | (no priority alternative — theirStack IS priority) | n/a |
| SMB / local | (none in priority — priority skips SMB) | serper.searchPlaces (0.05), firecrawl.scrape (0.05 / item) | Always for local/storefront. |
| Visitor de-anonymization | (none — niche) | snitcher.searchSessions (0) | Always for visitor ID — free credits-tier. |
| Warm-intro sourcing | (none — niche) | theSwarm.searchWarmIntrosToCompany (2) | When the goal is intros, not pure prospecting. |

## Person enrichment alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| Person enrichment (LinkedIn URL in hand) | aiArk.enrichPerson (0.1) | linkedin.enrichProfile (0.25) | When LinkedIn-anchored details are enough. Either way the email comes from the Find email tool. |
|   |   | prospeo.enrichLinkedin (0.5) | Second opinion on a URL-anchored miss. |
| Person enrichment (name + company) | waterfall.enrichContact (2) | apolloio.enrichPerson (1, **9** with phone reveal, priority) | The niche-coverage rung — promote per-batch when a pilot shows Apollo hits where aiArk/waterfall miss (investor-backed, portfolio niches). |
|   |   | hunter.enrichPerson (1) | Cheap mid-tier alternative. |
| Reverse email → person | Find LinkedIn URL from email tool, `find_linkedin_url_from_personal_email` (1–3) | aiArk.reverseLookup (0.05) / FullEnrich.reverseEmailLookup (1) | Exception only (named provider, cheapest path asked for, tool missing). |
| Person backfill (heavyweight) | peopleDataLabs.enrichPerson (3) | (none cheaper for heavyweight) | n/a |

## Company enrichment alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| Company firmographics | aiArk.enrichCompany (0.01) | companyEnrich.enrichByDomain (0.25) | Fuller field set. Promote whenever 0.01 comes back thin. |
|   |   | linkedin.enrichCompany (0.25) | When LinkedIn-anchored details are sufficient. |
|   |   | apolloio.enrichOrganization (1, priority) | The niche-coverage rung — when the cheaper rungs miss and LinkedIn doesn't have it. |
| Company technographics | builtwith.getDomainSummary (**0**) | theirStack.searchTechnologies (0.5) | When you want catalog-style "show me the tech list" rather than per-domain detection. |
|   |   | builtwith.enrichDomain (1) | Full stack detail on the rows the free summary left ambiguous. |

## Find email alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| Find email (name + domain, or LinkedIn URL) | Find email tool, `email_waterfall` (1.1–4) | aiArk.enrichPerson (0.1, LinkedIn URL) | Exception only: the user named AI Ark or asked for the cheapest path. Run finders below on its residue. |
|   |   | FullEnrich.findEmail (1) | Exception only: named provider, cheapest path, or tool missing. |
|   |   | hunter.findEmail (0.5) | Cheapest-path ladders, lower hit rate. |
|   |   | icypeas.findEmail (0.1) | Cheap last-resort for very large lists. |
|   |   | findyMail.findEmail (0.5) | Mid-tier alternative; sometimes finds what hunter misses. |
|   |   | leadMagic.findEmail (0.5) | Mid-tier alternative. |
|   |   | dropcontact.findEmail (1) | Better for French/EU data. |
|   |   | datagma.findEmail (1) | Alt mid-tier. |

## Verify email alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| Verify email (an email you brought in; Find email output is already verified) | Verify email tool, `email_validator` (0.2) | waterfall.verifyEmail (0.1) | Exception only: named provider or cheapest path asked for. |
|   |   | icypeas.verifyEmail (0.01) | When the user asked for the cheapest path on a very large list. |
|   |   | zeroBounce.verifyEmail (0.1) | Equivalent cost; different underlying provider. |
|   |   | kitt.verifyEmail (0.05) | Cheaper alternative. |

## Find phone alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| Find phone (explicit request only) | Find phone tool, `phone_waterfall` (3–7, LinkedIn URL in) | aiArk.findMobilePhone (0.5) | Exception only: named provider or cheapest path asked for. Mobile-only. |
|   |   | prospeo.findPhone (3) | Landline/DID; exception only. |
| Find phone, no LinkedIn URL obtainable | (the tool needs one) | FullEnrich.findPhone (6) | Takes name + domain; the "input missing" exception. |
|   |   | forager.findPhone (5) | Mid-tier. |
|   |   | findyMail.findPhone (5) | Mid-tier. |
|   |   | cleon1.findPhoneFromLinkedin (15) | Premium; only for high-value leads where standard sources fail. |

## LinkedIn URL alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| Resolve LinkedIn from name+company | linkedin.findProfileUrl (0.25) | (no cheaper credible alternative) | n/a |
| Resolve LinkedIn from email | Find LinkedIn URL from email tool, `find_linkedin_url_from_personal_email` (1–3) | FullEnrich.reverseEmailLookup (1) | Exception only. |

## When the priority stack genuinely can't serve the goal

Examples:
- "Find every TikTok creator with > 10k followers" — no priority provider has this; need apify.* or specialized scrapers.
- "Get GitHub stars over time for a list of repos" — github connector + custom enrichment.
- "Find every company that uses Stripe Atlas" — niche; might require custom scraping via firecrawl.

For these: defer to [`../SKILL.md`](../SKILL.md) and its [`../agents/execution-plan-creator.md`](../agents/execution-plan-creator.md), which builds a custom chain citing the right long-tail providers.

## Always escalate to a workspace report

If the priority stack misses AND no documented alternative covers the gap, file a `cargo-ai workspaceManagement report create` describing the missing capability. See [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md) (Reports section).
