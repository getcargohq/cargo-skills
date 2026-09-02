# Recipe — Find companies by tech-stack or hiring intent

Use this recipe when the user wants to find or prioritize companies based on **what they use** (tech stack) or **what they're hiring for** (role intent). These are two of the strongest leading indicators in B2B GTM.

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
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchCompanies"}' \
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
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchJobs"}' \
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
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchCompanies"}' \
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

After sourcing with theirStack, validate the technographics on each company with
builtwith — **free first, paid on the residue**:

```bash
# 1. Free stack summary for every sourced domain — costs nothing
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"builtwith","actionSlug":"getDomainSummary"}' \
  --records "$(jq -c '[.results[] | {domain}]' /tmp/sourced.json)" \
  --wait-until-finished > /tmp/stack-summary.json

# 2. Full detail only where the free summary didn't settle the question
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"builtwith","actionSlug":"enrichDomain"}' \
  --records '<rows from /tmp/stack-summary.json the summary left ambiguous>' \
  --wait-until-finished
```

`enrichDomain` gives the richer view (technology categories, versions, spend
signals) than theirStack alone. Use both when high-confidence is required — but
never before the free summary has cut the list down.

## Discovering canonical technology / role slugs

theirStack's filters expect canonical slugs (e.g. `"snowflake"`, not `"Snowflake Inc."`).

```bash
# Discover canonical slugs before search
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchTechnologies"}' \
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

To make this recurring, follow [`save-as-play.md`](save-as-play.md) — it walks the tool-vs-play choice, the cadence defaults per signal, and the recurring-cost approval. Play mechanics: [`../../cargo-orchestration/references/examples/plays.md`](../../cargo-orchestration/references/examples/plays.md).

## Credit budget

| Action | Cost per call |
|---|---|
| `theirStack.searchTechnologies` | 0.5 |
| `theirStack.searchJobs` | 0.5 |
| `theirStack.searchCompanies` | 0.5 |
| `builtwith.getDomainSummary` | **0** per record |
| `builtwith.enrichDomain` | 1 per record |

Note: theirStack actions are **per-call**, not per-record-returned. One call returning 500 companies = 0.5 credits. builtwith is per-record.

For a 500-company tech-intent scan with validation: 0.5 (theirStack) + 0 (`getDomainSummary` × 500) + 1 per row that actually needs `enrichDomain`. If a fifth of the list escalates, that is ~100 credits, not 500 — which is the whole point of running the free summary first.

## When the intent doesn't show up in theirStack

- **Stack X isn't in theirStack's catalog**: run `builtwith.getDomainSummary` (free) directly on a known account list, and escalate the ambiguous rows to `builtwith.enrichDomain` (1) — builtwith detects from the site itself rather than from a curated catalog, so its coverage is broader for niche tools.
- **Job posting on a niche board**: theirStack covers major boards (LinkedIn, Indeed, etc.); for niche/industry boards, fall back to `firecrawl.crawl` on the board URL.
- **Self-reported intent (e.g. case studies)**: scrape with `firecrawl.scrape` + LLM extract via `anthropic.instruct`.

## Action shape

`{"kind":"connector","integrationSlug":"theirStack","actionSlug":"<slug>"}`. **No `connectorUuid` in `config`.**

## Output retrieval

For batch runs, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>`.
