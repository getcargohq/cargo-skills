# Recipe — Find companies by tech-stack or hiring intent

Use this skill when the user wants to find or prioritize companies based on **what they use** (tech stack) or **what they're hiring for** (role intent). These are two of the strongest leading indicators in B2B GTM.

**Trigger phrases:**
- *"Find every company using Snowflake AND dbt."*
- *"Show me everyone hiring a Head of RevOps in the last 30 days."*
- *"List companies running React + AWS that just hired a data engineer."*
- *"Which of our target accounts started using Stripe in the last 6 months?"*

## Three flavors

### Flavor A — Tech-stack sourcing

"Find every company using X."

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchCompanies","config":{}}' \
  --data '{
    "techFields": {"technologies": ["snowflake", "dbt"]},
    "fields": {"industries": ["software"], "headcountMin": 100},
    "limit": 500
  }' \
  --wait-until-finished
```

### Flavor B — Hiring-intent sourcing

"Find every company hiring for role X."

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchJobs","config":{}}' \
  --data '{
    "fields": {
      "job_titles": ["Head of RevOps", "VP RevOps"],
      "posted_at_max_age_days": 30
    },
    "companyFields": {"employeeCounts": ["50-200","200-500"]},
    "limit": 200
  }' \
  --wait-until-finished
```

Result includes both job postings and the companies that posted them. Dedup on company to get the unique account list.

### Flavor C — Combined "running stack AND hiring"

"Find every company running Snowflake AND hiring a data engineer in the last 60 days."

```bash
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

This is theirStack's unique strength — combined tech-stack + hiring-intent in one call.

## Per-company tech validation

After sourcing with theirStack, validate the technographics on each company with cargo native:

```bash
# 1. Match the sourced companies to cargo
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchBusiness","config":{}}' \
  --records "$(jq -c '[.results[] | {domain}]' /tmp/sourced.json)" \
  --wait-until-finished

# 2. Pull cargo's technographics view
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichBusinessTechnographics","config":{}}' \
  --records "$(jq -c '[.results[] | select(.business_id) | {business_id}]' /tmp/matched.json)" \
  --wait-until-finished
```

cargo's technographics action provides a richer view (technology categories, adoption confidence, recency) than theirStack alone. Use both when high-confidence is required.

## Discovering canonical technology / role slugs

theirStack's filters expect canonical slugs (e.g. `"snowflake"`, not `"Snowflake Inc."`).

```bash
# Discover canonical slugs before search
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchTechnologies","config":{}}' \
  --data '{"fields": {"keywords": "snowflake"}, "limit": 10}' \
  --wait-until-finished
```

Use the returned `slug` values in `searchCompanies.techFields.technologies`.

## Recurring tech-intent monitoring (play)

For continuous monitoring (e.g. weekly scan for "new companies hiring my buyer"):
1. Trigger: weekly cron.
2. Action: `theirStack.searchJobs` with `posted_at_max_age_days: 7`.
3. Dedup against last week's results.
4. Output: write new companies to a "Fresh Hiring Intent" segment.

For setting up a play / scheduled tool, see `../../cargo-orchestration/references/plays.md`.

## Credit budget

| Action | Cost per call |
|---|---|
| `theirStack.searchTechnologies` | 0.5 |
| `theirStack.searchJobs` | 0.5 |
| `theirStack.searchCompanies` | 0.5 |
| `cargo.matchBusiness` | 0.5 per record |
| `cargo.enrichBusinessTechnographics` | 1 per record |

Note: theirStack actions are **per-call**, not per-record-returned. One call returning 500 companies = 0.5 credits. Cargo enrichments are per-record.

For a 500-company tech-intent scan with cargo validation: 0.5 (theirStack) + 250 (matchBusiness × 500) + 500 (enrichTechnographics × 500) = ~750 credits.

## When the intent doesn't show up in theirStack

- **Stack X isn't in theirStack's catalog**: use `cargo.enrichBusinessTechnographics` directly on a known account list — cargo's tech catalog is broader for some niches.
- **Job posting on a niche board**: theirStack covers major boards (LinkedIn, Indeed, etc.); for niche/industry boards, fall back to `firecrawl.crawl` on the board URL.
- **Self-reported intent (e.g. case studies)**: scrape with `firecrawl.scrape` + LLM extract via `anthropic.instruct`.

## Action shape

`{"kind":"connector","integrationSlug":"theirStack","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**

## Output retrieval

For batch runs, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>`.
