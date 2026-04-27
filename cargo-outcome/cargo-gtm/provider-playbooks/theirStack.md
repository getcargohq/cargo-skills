---
provider: theirStack
category: enrichment (tech-stack + hiring-intent signals)
last-reviewed: 2026-04-27
---

# theirStack (Their Stack)

Tech-stack and jobs-posted intent signals. **Three credits-based actions, all 0.5 credits each**, covering the "find companies by what they use or what they're hiring for" pattern. Cargo's primary intent-signal provider for technographics-driven outreach.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `searchTechnologies` | 0.5 | `fields, limit` | Find what technologies a set of companies / domains uses. |
| `searchJobs` | 0.5 | `fields, companyFields, limit` | Find currently-posted jobs matching role / location / company filters. **Hiring-intent signal.** |
| `searchCompanies` | 0.5 | `fields, jobFields, techFields, limit` | Find companies by tech stack and/or job-posting filters combined. |

## What it's for

- ✅ **"Everyone hiring for role X"** — `searchJobs` with title and posting-window filters → list of companies actively recruiting that role.
- ✅ **"Companies running tech stack Y"** — `searchTechnologies` with stack filter → list of companies using a specific framework, infra, or SaaS.
- ✅ **Combined intent + tech-stack** — `searchCompanies` with both `jobFields` and `techFields` → companies running stack Y AND hiring for role X.
- ❌ **Generic firmographic search** — for "fintech in US, 50-500 headcount" without intent signals, salesNavigator (0.05) is 10× cheaper. Use theirStack only when the intent signal is the primary filter.

## Patterns

### Pattern A — Hiring-intent sourcing

```bash
# "Find every company hiring a Head of RevOps in the last 30 days"
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchJobs","config":{}}' \
  --data '{
    "fields": {
      "job_titles": ["Head of RevOps", "VP RevOps", "Director of RevOps"],
      "posted_at_max_age_days": 30,
      "locations": ["United States"]
    },
    "companyFields": {
      "employeeCounts": ["50-200", "200-500"]
    },
    "limit": 200
  }' \
  --wait-until-finished
```

Result includes both job postings and the companies that posted them. Dedup on company to get the unique account list.

### Pattern B — Tech-stack-driven sourcing

```bash
# "Find every company using Snowflake AND dbt"
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchCompanies","config":{}}' \
  --data '{
    "techFields": {
      "technologies": ["snowflake", "dbt"]
    },
    "fields": {
      "industries": ["software", "saas"],
      "headcountMin": 100
    },
    "limit": 500
  }' \
  --wait-until-finished
```

### Pattern C — Combined "hiring AND running stack"

```bash
# "Find every B2B SaaS hiring a data engineer AND already using Snowflake"
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchCompanies","config":{}}' \
  --data '{
    "techFields": {"technologies": ["snowflake"]},
    "jobFields": {"job_titles": ["Data Engineer"], "posted_at_max_age_days": 60},
    "fields": {"industries": ["software"]},
    "limit": 200
  }' \
  --wait-until-finished
```

This is the unique strength of theirStack — combined tech-stack AND hiring-intent in one call.

## Common pitfalls

- **`searchTechnologies` returns technology metadata, not company lists.** Use it to discover canonical technology slugs, then plug those into `searchCompanies.techFields.technologies`.
- **Don't over-filter.** Combining 5+ filters can collapse the result set to zero. Start broad (1–2 filters), inspect counts, then narrow.
- **Posting-window matters.** `posted_at_max_age_days` defaults loose; for "currently hiring" intent, use 30 or 60 days.

## Action shape

`{"kind":"connector","integrationSlug":"theirStack","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**

## When to combine with cargo native

After sourcing with theirStack, **enrich with cargo** rather than running theirStack on every record. The pattern:

1. `theirStack.searchCompanies` → 500 companies matching intent (250 credits).
2. `cargo.matchBusiness` → match each to cargo catalog (250 credits).
3. `cargo.enrichBusinessFirmographics` + `cargo.enrichBusinessTechnographics` → fill firmographic/tech detail (750 credits combined).

Total: ~1,250 credits for 500 fully-enriched companies with intent signal. Cheaper than running peopleDataLabs (3 credits/record × 3 actions = 4,500 credits).
