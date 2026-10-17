# Finding companies and contacts

How to source accounts and people on Cargo. Covers the full sourcing decision tree, provider-by-provider strengths, and the parallel patterns that work at scale.

## Decision tree

```
Goal → which sourcing path?

Looking for COMPANIES matching ICP criteria (industry, size, geo, …)?
  ├─ Free (0 cred):                          FullEnrich.searchCompanies — industry, headcount, HQ, tech, keywords
  ├─ Lookalikes / cheap at scale (0.01):      aiArk.searchCompanies — lookalikes from ≤5 seed domains
  ├─ LinkedIn-native filters (0.2 cred):      salesNavigator.searchAccounts
  ├─ Need rich filters / structured query:    peopleDataLabs.queryCompanies (3 cred)
  ├─ Tech-stack or hiring intent:             theirStack.searchCompanies / searchTechnologies / searchJobs (0.5 cred)
  ├─ Local / SMB / storefront (Maps-style):   serper.searchPlaces (0.05 cred)
  ├─ Specific domain → details:               FullEnrich.lookupCompany (0) or aiArk.enrichCompany (0.01 cred)
  └─ Already have a domain list?              skip sourcing — go straight to enrichment

Looking for PEOPLE at companies?
  ├─ Free (0 cred):                          FullEnrich.searchPeople — title, seniority, function, skills, tenure, past company, employer filters
  ├─ Cheap at scale (0.05 cred/record):       aiArk.searchPeople — also education, skills, tenure, past company
  ├─ LinkedIn-native filters (0.2 cred):      salesNavigator.searchLeads
  ├─ Rich filters / large database:           peopleDataLabs.searchPeople / queryPeople (3 cred)
  ├─ LinkedIn-anchored:                       linkedin.findProfileUrl + linkedin.enrichProfile (0.25 cred)
  ├─ "Find people I know who can intro":      theSwarm.searchWarmIntrosToCompany / Person (2 cred)
  └─ Visitor de-anon (identifies a COMPANY):  snitcher.searchSessions (0 cred) → salesNavigator.searchLeads there

Looking for INVESTOR-BACKED companies?
  └─ theirStack.searchCompanies with fields.company_investors_partial_match_or
     (0.5 per company; PDL has no investor field), then salesNavigator.searchLeads
     at each portfolio company
```

## Companies-first rule

When the user asks for "contacts at companies matching X," **always** discover the company set first, then find people at each company. Reasoning:

- Broad people-search queries return noisy results when the company filter is weak.
- A two-step (companies → people) flow lets you cap the per-company contact count (e.g. 3 prospects per account) cleanly.
- Per-company contact searches parallelize naturally via `action execute-batch` — fan out one `searchLeads` per company in the source set.

## Provider strengths at a glance

| Provider | Best for | Cost (credits) |
|---|---|---|
| **salesNavigator** | At-scale lead/account search, LinkedIn-native filters | 0.2 (lead or account) |
| **FullEnrich** | Free people and company search (`searchPeople`, `searchCompanies`), free single lookups, and `fetchPeople` / `fetchCompanies` extractors into a model | 0 |
| **aiArk** | Cheapest company search + lookalike seeds; people filters on education / skills / tenure / past company | 0.01 (company) / 0.05 (person) |
| **peopleDataLabs** | Structured queries (`queryPeople` / `queryCompanies`), heavy filtering, backfill when other sources miss | 3 (flat) |
| **theirStack** | Tech-stack signals, jobs-posted signals, "everyone hiring for role X" | 0.5 |
| **builtwith** | Tech detection on a domain you already have; `getDomainSummary` is free | 0 / 1 |
| **icypeas** | Cheapest people/company find when minimal filters work | 0.02 per 100 records |
| **firecrawl** | Web search + scrape when no structured provider has the data | 0.05 |
| **serper** | Google Maps-style search for local SMBs / storefronts | 0.05 |
| **theSwarm** | Warm-intro paths to a target account or contact | 2 |
| **snitcher** | Anonymous website visitor identification | 0 (free credits-tier) |

For full provider details, see the per-provider playbooks under `../provider-playbooks/`.

## Cheapest path patterns

### Pattern A — TAM list at scale (>500 companies)

```bash
# Source: LinkedIn-native account search (codes are strings: "43" Financial Services,
# "103644278" United States, headcount "D" 51-200 / "E" 201-500)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchAccounts"}' \
  --records '[{"industryCodes":["43"],"headquarterLocationIds":["103644278"],"companyHeadcounts":["D","E"],"limit":500}]' \
  --wait-until-finished
```

`--wait-until-finished` prints the batch object, not rows. Fetch the rows with `cargo-ai orchestration batch download --uuid <batch-uuid>` (a signed CSV URL; a search's result array lands in one `cargo` column). Each account carries `sales_navigator_company_id`, the id Pattern B filters on.

If salesNavigator filters don't cover the criteria you need, fall back to peopleDataLabs. Use `searchCompanies` (3) when criteria fit cargo's `{conjonction, groups, conditions}` filter shape; drop to `queryCompanies` (3) when you need a PDL **SQL** query (array membership, complex OR-of-AND). PDL has no investor field: investor filters go to `theirStack.searchCompanies` (Pattern E).

### Pattern B — Contact discovery at known companies

```bash
# Fan out one searchLeads per company
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads"}' \
  --records "$(jq -c '[.companies[] | {company:{currentCompanyIds:[.sales_navigator_company_id]},role:{titleKeywords:["CTO","VP Engineering"]},limit:3}]' /tmp/companies.json)" \
  --wait-until-finished
```

Cap titles tightly — broad title filters dilute results.

### Pattern C — Domain → company detail

When you already have a domain list and need firmographics:

```bash
# Cheapest company enrich in the catalog — domain or LinkedIn URL, no match step
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichCompany"}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished

# Rows that came back thin — fuller field set at 0.25
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"companyEnrich","actionSlug":"enrichByDomain"}' \
  --records '<rows from the previous step with empty firmographics>' \
  --wait-until-finished
```

### Pattern D — Tech-stack-driven sourcing

```bash
# Find companies running a specific stack
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchCompanies"}' \
  --data '{"fields":{"company_technology_slug_and":["snowflake","dbt"],"company_country_code_or":["US"]},"limit":100}' \
  --wait-until-finished

# Or "everyone hiring for role X" (intent signal)
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchJobs"}' \
  --data '{"fields":{"job_title_or":["Head of RevOps"],"posted_at_max_age_days":30},"limit":100}' \
  --wait-until-finished
```

### Pattern E — Investor portfolio sourcing

```bash
# Step 1: companies by investor (theirStack carries investors; PDL has no investor field)
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchCompanies"}' \
  --data '{"fields":{"company_investors_partial_match_or":["Sequoia"]},"limit":100}' \
  --wait-until-finished > /tmp/portfolio.json

# Step 2 — fan out searchLeads per portfolio company (Pattern B above)
```

## Parallel execution

For any source list with >10 items, use `action execute-batch` with `--records`. The platform fans out automatically and respects rate limits per provider. For very large runs (>500), pass via `batch create --workflow-uuid` with a saved tool — see [`../../cargo-orchestration/references/polling.md`](../../cargo-orchestration/references/polling.md) for polling strategies.

## When the cheapest source returns garbage

Two failure modes for sourcing:

1. **Filter mismatch** — provider doesn't expose the filter you need (e.g. salesNavigator can't filter by funding round). Move to a richer provider (`theirStack.searchCompanies` for funding and investor filters, `peopleDataLabs.queryCompanies` for SQL).
2. **Coverage gap** — provider doesn't have data for the niche (e.g. local SMBs aren't well-covered by salesNavigator). Move to a niche provider (`serper.searchPlaces` for SMBs, `theirStack.searchCompanies` for tech-driven).

If the user's request can't be served at all, file a `workspaceManagement report` describing the gap.
