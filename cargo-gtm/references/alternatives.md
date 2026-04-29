# Alternative provider chains

When the priority stack (salesNavigator / cargo / waterfall / FullEnrich / theirStack / peopleDataLabs) can't serve the user's criteria, swap in providers from the long tail.

For every alternative, see [`stage-action-map.md`](stage-action-map.md) for the cheapest credits-based action per stage across the full 120-integration catalog.

## When to swap providers

Only swap when:

1. **Filter mismatch**: priority provider doesn't expose the filter you need (e.g., salesNavigator can't filter by funding round → escalate to peopleDataLabs.queryCompanies).
2. **Coverage gap**: priority provider doesn't have data for the niche (e.g., local SMBs aren't well-covered by salesNavigator → escalate to serper.searchPlaces).
3. **Premium quality required**: cheap email/phone finders missed → FullEnrich was already the priority answer; further escalation goes to multi-source like waterfall.findPhone (7 credits).

Default rule: **don't swap to chase 2× cheaper if hit-rate drops 30%**. The total credit spend across a chain is dominated by misses (re-running across stages), not by the per-call cost.

## Sourcing alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| At-scale lead search | salesNavigator.searchLeads (0.02) | icypeas.findPeople (0.02) | When LinkedIn coverage is thin (e.g., privacy-focused industries). |
| At-scale account search | salesNavigator.searchAccounts (0.05) | peopleDataLabs.searchCompanies (3) for cargo-filter shape, or queryCompanies (3) for SQL | When salesNavigator's filters miss (funding, investor, complex bool). |
| Tech-intent sourcing | theirStack.searchJobs / searchCompanies (0.5) | (no priority alternative — theirStack IS priority) | n/a |
| SMB / local | (none in priority — priority skips SMB) | serper.searchPlaces (1), firecrawl.scrape (0.05) | Always for local/storefront. |
| Visitor de-anonymization | (none — niche) | snitcher.searchSessions (0) | Always for visitor ID — free credits-tier. |
| Warm-intro sourcing | (none — niche) | theSwarm.searchWarmIntrosToCompany (2) | When the goal is intros, not pure prospecting. |

## Person enrichment alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| Person enrichment (default) | cargo.enrichProspectDetails (2) | linkedin.enrichProfile (0.25) | When you only need LinkedIn-anchored details and have the URL. |
|   |   | apolloio.enrichPerson (1, 3) | When Apollo coverage is stronger for the niche. |
|   |   | hunter.enrichPerson (1) | Cheap mid-tier alternative. |
| Reverse email → person | (none in priority) | FullEnrich.reverseEmailLookup (2) | Always for email → LinkedIn. |
| Person backfill (heavyweight) | peopleDataLabs.enrichPerson (3) | (none cheaper for heavyweight) | n/a |

## Company enrichment alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| Company firmographics | cargo.enrichBusinessFirmographics (0.5) | companyEnrich.enrichByDomain (0.25) | Cheaper, but less rich. Only when budget critical. |
|   |   | linkedin.enrichCompany (0.25) | When LinkedIn-anchored details are sufficient. |
|   |   | apolloio.enrichOrganization (1) | When cargo's match misses + LinkedIn doesn't have it. |
| Company technographics | cargo.enrichBusinessTechnographics (1) | theirStack.searchTechnologies (0.5) | When you want catalog-style "show me the tech list" rather than per-company enrichment. |

## Find email alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| Find email (default) | FullEnrich.findEmail (1) | hunter.findEmail (0.5) | When budget critical AND okay with lower hit rate. |
|   |   | icypeas.findEmail (0.1) | Cheap last-resort for very large lists. |
|   |   | findyMail.findEmail (0.5) | Mid-tier alternative; sometimes finds what hunter misses. |
|   |   | leadMagic.findEmail (0.5) | Mid-tier alternative. |
|   |   | dropcontact.findEmail (1) | Better for French/EU data. |
|   |   | datagma.findEmail (1) | Alt mid-tier. |

## Verify email alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| Verify email | waterfall.verifyEmail (0.1) | icypeas.verifyEmail (0.01) | When verifying very large lists (10× cheaper). |
|   |   | zeroBounce.verifyEmail (0.1) | Equivalent cost; different underlying provider. |
|   |   | kitt.verifyEmail (0.05) | Cheaper alternative. |

## Find phone alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| Find phone (default) | FullEnrich.findPhone (6) | prospeo.findPhone (3) | Cheaper first stop; escalate to FullEnrich on miss. |
|   |   | forager.findPhone (5) | Mid-tier. |
|   |   | findyMail.findPhone (5) | Mid-tier. |
|   |   | cleon1.findPhoneFromLinkedin (15) | Premium; only for high-value leads where standard sources fail. |

## LinkedIn URL alternatives

| Goal | Priority | Alternative | When to swap |
|---|---|---|---|
| Resolve LinkedIn from name+company | linkedin.findProfileUrl (0.25) | (no cheaper credible alternative) | n/a |
| Resolve LinkedIn from email | FullEnrich.reverseEmailLookup (2) | (no cheaper credible alternative) | n/a |

## When the priority stack genuinely can't serve the goal

Examples:
- "Find every TikTok creator with > 10k followers" — no priority provider has this; need apify.* or specialized scrapers.
- "Get GitHub stars over time for a list of repos" — github connector + custom enrichment.
- "Find every company that uses Stripe Atlas" — niche; might require custom scraping via firecrawl.

For these: defer to [`../SKILL.md`](../SKILL.md) and its [`../agents/execution-plan-creator.md`](../agents/execution-plan-creator.md), which builds a custom chain citing the right long-tail providers.

## Always escalate to a workspace report

If the priority stack misses AND no documented alternative covers the gap, file a `cargo-ai workspaceManagement report create` describing the missing capability. See [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md) (Reports section).
