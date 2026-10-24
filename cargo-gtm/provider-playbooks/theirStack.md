---
provider: theirStack
category: enrichment (tech-stack + hiring-intent signals)
last-reviewed: 2026-04-27
---

# theirStack (Their Stack)

Tech-stack and jobs-posted intent signals. **Three credits-based actions at 0.5 credits**: `searchJobs` and `searchCompanies` bill **0.5 per returned item** (job or company), `searchTechnologies` bills 0.5 per call. They cover the "find companies by what they use or what they're hiring for" pattern. Cargo's primary intent-signal provider for technographics-driven outreach.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `searchTechnologies` | 0.5 per call | `fields, limit` | Find what technologies a company uses (`fields.company_domain` or `company_name`). |
| `searchJobs` | 0.5 per job returned | `fields, companyFields, limit` | Find currently-posted jobs matching role / location / company filters. **Hiring-intent signal.** |
| `searchCompanies` | 0.5 per company returned | `fields, jobFields, techFields, limit` | Find companies by tech stack and/or job-posting filters combined. |

## What it's for

- ✅ **"Everyone hiring for role X"** — `searchJobs` with title and posting-window filters → list of companies actively recruiting that role.
- ✅ **"Companies running tech stack Y"** — `searchTechnologies` with stack filter → list of companies using a specific framework, infra, or SaaS.
- ✅ **Combined intent + tech-stack** — `searchCompanies` with `fields.company_technology_slug_or` and `jobFields` → companies running stack Y AND hiring for role X.
- ❌ **Generic firmographic search** — for "fintech in US, 50-500 headcount" without intent signals, salesNavigator (0.2) or `aiArk.searchCompanies` (0.01) is cheaper per company. Use theirStack only when the intent signal is the primary filter.

## Patterns

### Pattern A — Hiring-intent sourcing

```bash
# "Find every company hiring a Head of RevOps in the last 30 days"
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchJobs"}' \
  --data '{
    "fields": {
      "job_title_or": ["Head of RevOps", "VP RevOps", "Director of RevOps"],
      "posted_at_max_age_days": 30,
      "job_country_code_or": ["US"]
    },
    "companyFields": {
      "min_employee_count": 50,
      "max_employee_count": 500
    },
    "limit": 200
  }' \
  --wait-until-finished
```

Billed 0.5 per job returned, so `limit: 200` can cost up to 100 credits. Each job carries the company that posted it (`company_object`). Dedup on company to get the unique account list.

### Pattern B — Tech-stack-driven sourcing

```bash
# "Find every company using Snowflake AND dbt"
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchCompanies"}' \
  --data '{
    "fields": {
      "company_technology_slug_and": ["snowflake", "dbt"],
      "industry_id_or": ["4"],
      "min_employee_count": 100
    },
    "limit": 500
  }' \
  --wait-until-finished
```

### Pattern C — Combined "hiring AND running stack"

```bash
# "Find every B2B SaaS hiring a data engineer AND already using Snowflake"
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchCompanies"}' \
  --data '{
    "fields": {"company_technology_slug_or": ["snowflake"], "industry_id_or": ["4"]},
    "jobFields": {"job_title_or": ["Data Engineer"], "posted_at_max_age_days": 60},
    "limit": 200
  }' \
  --wait-until-finished
```

This is the unique strength of theirStack — combined tech-stack AND hiring-intent in one call.

## Common pitfalls

- **`searchTechnologies` returns one company's technologies, not company lists.** Each row carries `technology.slug`; plug those slugs into `searchCompanies` `fields.company_technology_slug_or` (any) or `_and` (all). `industry_id_or` takes theirStack's industry ids as strings (`"4"` is Software Development), and `job_country_code_or` / `company_country_code_or` take ISO codes (`"US"`).
- **Don't over-filter.** Combining 5+ filters can collapse the result set to zero. Start broad (1–2 filters), inspect counts, then narrow.
- **Posting-window matters.** `posted_at_max_age_days` defaults loose; for "currently hiring" intent, use 30 or 60 days.

## Anti-patterns

- **Free-text technology names.** `company_technology_slug_or` wants theirStack's canonical slugs (case sensitive): resolve them with the `listTechnologies` autocomplete or read `technology.slug` from `searchTechnologies`. A misspelled filter key is refused by `action execute` / `execute-batch` (`Unknown field: companyFields.company_domains`), but inside a workflow node it is still dropped silently, so the search runs unfiltered and bills per row. Guessing (`"Snowflake"` vs `"snowflake"` vs `"snowflake-db"`) silently narrows results.
- **theirStack for plain firmographics.** No intent signal in the filter → salesNavigator (0.2) is 2.5× cheaper and `aiArk.searchCompanies` (0.01) 50×. theirStack earns its cost only when the job-posting or tech-stack signal IS the filter.
- **Skipping the count check.** Start with 1–2 filters and a small `limit`, read the result count, then narrow — over-filtered queries return zero and the credits for the probe calls add up.

## Position in the waterfall

**Primary intent-signal source** (rung 1 for hiring/tech-stack-driven sourcing); falls to `builtwith` for per-domain tech detail. Funding and investor filters are native here: `min_funding_usd`, `funding_stage_or`, `last_funding_round_date_gte`, `company_investors_or` and `company_investors_partial_match_or` in `fields` (`companyFields` on `searchJobs`).

## Action shape

`{"kind":"connector","integrationSlug":"theirStack","actionSlug":"<slug>"}`. **No `connectorUuid` in `config`.**

## When to combine with the enrichment chain

After sourcing with theirStack, **enrich per company** rather than running theirStack on every record. The pattern:

1. `theirStack.searchCompanies` → 500 companies matching intent (250 credits).
2. Dedupe against the Companies model with a `storage query execute` on `domain` (free).
3. `aiArk.enrichCompany` → firmographics on the new ones (5 credits).
4. `builtwith.getDomainSummary` → stack detail (free), escalating to `enrichDomain` (1) only on ambiguous rows.

Total: ~255 credits for 500 fully-enriched companies with intent signal, plus 1 per row that needs the paid stack detail. Cheaper than running peopleDataLabs (3 credits/record × 3 actions = 4,500 credits).

## Recurring use

Hiring intent decays in days — theirStack is **built for the monitor shape, not the one-off pull**.

- **Scheduled pull:** re-run `searchJobs` / `searchCompanies` on the daily hiring-intent default, with `posted_at_max_age_days` matched to the cadence (daily → 1–2 days) so each run bills only postings that appeared since the last one, never the same window twice. Cadence table: [`../recipes/save-as-play.md`](../recipes/save-as-play.md).
- **In-play gate:** dedup discovered companies against the Companies model with a free `storage query execute` on `domain` (step 2 of the pattern above) before any paid enrichment — a company re-posting the same role must not re-enter the enrich chain.
- **Postings expire; stacks don't.** `searchTechnologies`-derived tech-stack fields are slow-moving — re-pull them on demand for a batch, not on the daily intent cadence.
