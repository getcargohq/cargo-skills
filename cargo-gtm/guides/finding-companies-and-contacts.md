# Finding companies and contacts

How to source accounts and people on Cargo. Covers the full sourcing decision tree, provider-by-provider strengths, and the parallel patterns that work at scale.

## Decision tree

```
Goal → which sourcing path?

Looking for COMPANIES matching ICP criteria (industry, size, geo, …)?
  ├─ Cheapest at scale (0.05 cred/record):    salesNavigator.searchAccounts
  ├─ Need rich filters / structured query:    peopleDataLabs.queryCompanies (3 cred)
  ├─ Tech-stack or hiring intent:             theirStack.searchCompanies / searchTechnologies / searchJobs (0.5 cred)
  ├─ Local / SMB / storefront (Maps-style):   serper.searchPlaces (1 cred)
  ├─ Specific domain → details:               cargo.matchBusiness (0.5 cred) → cargo.enrichBusinessFirmographics
  └─ Already have a domain list?              skip sourcing — go straight to enrichment

Looking for PEOPLE at companies?
  ├─ Cheapest at scale (0.02 cred/record):    salesNavigator.searchLeads
  ├─ Rich filters / large database:           peopleDataLabs.searchPeople / queryPeople (3 cred)
  ├─ LinkedIn-anchored:                       linkedin.findProfileUrl + linkedin.enrichProfile (0.25 cred)
  ├─ "Find people I know who can intro":      theSwarm.searchWarmIntrosToCompany / Person (2 cred)
  └─ Visitor de-anonymization:                snitcher.searchSessions (0 cred) → cargo.matchProspect

Looking for INVESTOR-BACKED companies?
  └─ peopleDataLabs.queryCompanies with investor/funding filter
     (then salesNavigator.searchLeads at each portfolio company)
```

## Companies-first rule

When the user asks for "contacts at companies matching X," **always** discover the company set first, then find people at each company. Reasoning:

- Broad people-search queries return noisy results when the company filter is weak.
- A two-step (companies → people) flow lets you cap the per-company contact count (e.g. 3 prospects per account) cleanly.
- Per-company contact searches parallelize naturally via `action execute-batch` — fan out one `searchLeads` per company in the source set.

## Provider strengths at a glance

| Provider | Best for | Cost (credits) |
|---|---|---|
| **salesNavigator** | At-scale lead/account search, LinkedIn-native filters | 0.02 (lead) / 0.05 (account) |
| **peopleDataLabs** | Structured queries (`queryPeople` / `queryCompanies`), heavy filtering, backfill when other sources miss | 3 (flat) |
| **theirStack** | Tech-stack signals, jobs-posted signals, "everyone hiring for role X" | 0.5 |
| **cargo** native | `matchBusiness` / `matchProspect` for dedup; `fetchProspects` / `fetchBusinesses` for catalog browsing | 0.5 |
| **icypeas** | Cheapest people/company find when minimal filters work | 0.02 |
| **firecrawl** | Web search + scrape when no structured provider has the data | 0.05 |
| **serper** | Google Maps-style search for local SMBs / storefronts | 1 |
| **theSwarm** | Warm-intro paths to a target account or contact | 2 |
| **snitcher** | Anonymous website visitor identification | 0 (free credits-tier) |

For full provider details, see the per-provider playbooks under `../provider-playbooks/`.

## Cheapest path patterns

### Pattern A — TAM list at scale (>500 companies)

```bash
# Source — cheapest large-scale account search
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchAccounts","config":{}}' \
  --records '[{"filters":{"industry":["fintech"],"countries":["US"],"sizeMin":50,"sizeMax":500}}]' \
  --wait-until-finished
```

If salesNavigator filters don't cover the criteria you need, fall back to peopleDataLabs. Use `searchCompanies` (3) when criteria fit cargo's `{conjonction, groups, conditions}` filter shape; drop to `queryCompanies` (3) when you need a PDL **SQL** query (required for array-membership like investor name).

### Pattern B — Contact discovery at known companies

```bash
# Fan out one searchLeads per company
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads","config":{}}' \
  --records "$(jq -c '[.companies[] | {filters:{accountId:.linkedinId,titles:["CTO","VP Engineering"]}}]' /tmp/companies.json)" \
  --wait-until-finished
```

Cap titles tightly — broad title filters dilute results.

### Pattern C — Domain → company detail

When you already have a domain list and need firmographics:

```bash
# Match against cargo's catalog first (cheapest, most reliable for known companies)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchBusiness","config":{}}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished

# Then enrich the matches
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichBusinessFirmographics","config":{}}' \
  --records '<matched output from previous step>' \
  --wait-until-finished
```

### Pattern D — Tech-stack-driven sourcing

```bash
# Find companies running a specific stack
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchCompanies","config":{}}' \
  --data '{"technologies":["snowflake","dbt"],"locations":["United States"]}' \
  --wait-until-finished

# Or "everyone hiring for role X" (intent signal)
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchJobs","config":{}}' \
  --data '{"job_titles":["Head of RevOps"],"posted_at_max_age_days":30}' \
  --wait-until-finished
```

### Pattern E — Investor portfolio sourcing

```bash
# Step 1 — query companies by investor (peopleDataLabs is the reliable source)
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"queryCompanies","config":{}}' \
  --data '{"query":"SELECT * FROM company WHERE summary.investors LIKE %Sequoia%"}' \
  --wait-until-finished > /tmp/portfolio.json

# Step 2 — fan out searchLeads per portfolio company (Pattern B above)
```

## Parallel execution

For any source list with >10 items, use `action execute-batch` with `--records`. The platform fans out automatically and respects rate limits per provider. For very large runs (>500), pass via `batch create --workflow-uuid` with a saved tool — see [`../../cargo-orchestration/references/polling.md`](../../cargo-orchestration/references/polling.md) for polling strategies.

## When the cheapest source returns garbage

Two failure modes for sourcing:

1. **Filter mismatch** — provider doesn't expose the filter you need (e.g. salesNavigator can't filter by funding round). Move to a richer provider (`peopleDataLabs.queryCompanies`).
2. **Coverage gap** — provider doesn't have data for the niche (e.g. local SMBs aren't well-covered by salesNavigator). Move to a niche provider (`serper.searchPlaces` for SMBs, `theirStack.searchCompanies` for tech-driven).

If the user's request can't be served at all, file a `workspaceManagement report` describing the gap.
