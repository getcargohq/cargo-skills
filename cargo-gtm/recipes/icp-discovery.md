# Recipe — Surface ICP signals from Closed-Won vs Closed-Lost

Use this skill when the user wants to **discover their real ICP from conversion data**, not from gut feel. The skill pulls Closed-Won and Closed-Lost segments via `storage query execute`, enriches both with the same firmographic and tech signals, and surfaces the features that differ most between them. Output: a ranked list of "high-fit signals" the user can use to filter prospecting.

**Trigger phrases:**
- *"What does our ideal customer look like?"*
- *"Find the patterns in our Closed-Won deals."*
- *"Why do we win against some prospects and lose against others?"*
- *"What ICP signals should we be filtering on?"*

## Why this is its own skill

Most prospecting skills are forward-looking ("find me X" / "enrich Y"). ICP discovery is **backward-looking** — analyze what worked, then turn the patterns into filters. It exercises:

- Storage (`cargo-ai storage query execute`) to pull Won/Lost segments.
- Cargo native enrichments (`enrichBusinessFirmographics`, `…Technographics`, `…FundingAndAcquisitions`) to fill comparison signals.
- LLM analysis (`anthropic.instruct`) to surface non-obvious patterns.

## Recipe

### Step 1 — Identify the deal model and pull segments

```bash
# Find the model holding deals (usually a Deals or Opportunities model in the workspace)
cargo-ai storage model list
cargo-ai storage dataset list

# Optional — fetch the DDL for column types and SQL dialect
cargo-ai storage model get-ddl <deals-model-uuid>
```

Pull both segments via `storage query execute` (tables are referenced as `<datasetSlug>.<modelSlug>` and rewritten to the underlying storage table under the hood):

```bash
# Closed-Won deals + their associated companies
cargo-ai storage query execute "
  SELECT d.uuid as deal_uuid, c.uuid as company_uuid, c.domain, c.name
  FROM default.deals d
  JOIN default.companies c ON d.company_uuid = c.uuid
  WHERE d.stage = 'closed-won'
  AND d.closed_at >= CURRENT_DATE - INTERVAL '12 months'
" > /tmp/won.json

# Closed-Lost deals + their associated companies
cargo-ai storage query execute "
  SELECT d.uuid as deal_uuid, c.uuid as company_uuid, c.domain, c.name
  FROM default.deals d
  JOIN default.companies c ON d.company_uuid = c.uuid
  WHERE d.stage = 'closed-lost'
  AND d.closed_at >= CURRENT_DATE - INTERVAL '12 months'
" > /tmp/lost.json
```

(Swap `default` for the user's dataset slug if it differs, and adjust the stage filter to match the user's pipeline stage labels.)

### Step 2 — Match each company to cargo

```bash
for src in won lost; do
  cargo-ai orchestration action execute-batch \
    --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchBusiness","config":{}}' \
    --records "$(jq -c '[.[] | {domain}]' /tmp/$src.json)" \
    --wait-until-finished > /tmp/$src-matched.json
done
```

### Step 3 — Enrich both segments with the SAME signals

Run the same enrichments on both segments so the diff is apples-to-apples:

```bash
for src in won lost; do
  for action in enrichBusinessFirmographics enrichBusinessTechnographics enrichBusinessFundingAndAcquisitions enrichBusinessFinancialMetrics; do
    cargo-ai orchestration action execute-batch \
      --action "$(jq -nc --arg a "$action" '{kind:"connector",integrationSlug:"cargo",actionSlug:$a,config:{}}')" \
      --records "$(jq -c '[.results[] | select(.business_id) | {business_id}]' /tmp/$src-matched.json)" \
      --wait-until-finished > /tmp/$src-$action.json
  done
done
```

### Step 4 — Diff feature distributions

For each feature (industry, size band, tech, funding stage, …), compute the % of Won vs % of Lost showing that feature, then sort by absolute difference. Largest deltas = strongest ICP signals.

This is best done in Python or via `anthropic.instruct` with structured output:

```bash
# Concatenate enrichment results into a structured comparison input
jq -s '{
  won: [.[0].results[], .[1].results[], .[2].results[], .[3].results[]] | group_by(.business_id) | map(reduce .[] as $r ({}; . * $r)),
  lost: [.[4].results[], .[5].results[], .[6].results[], .[7].results[]] | group_by(.business_id) | map(reduce .[] as $r ({}; . * $r))
}' \
  /tmp/won-enrichBusinessFirmographics.json \
  /tmp/won-enrichBusinessTechnographics.json \
  /tmp/won-enrichBusinessFundingAndAcquisitions.json \
  /tmp/won-enrichBusinessFinancialMetrics.json \
  /tmp/lost-enrichBusinessFirmographics.json \
  /tmp/lost-enrichBusinessTechnographics.json \
  /tmp/lost-enrichBusinessFundingAndAcquisitions.json \
  /tmp/lost-enrichBusinessFinancialMetrics.json > /tmp/comparison.json

# Use anthropic to surface differentiating signals
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"anthropic","actionSlug":"instruct","config":{}}' \
  --data '{
    "model": "claude-sonnet-4-6",
    "prompt": "Two arrays: Closed-Won companies and Closed-Lost companies. Compare feature distributions and surface the top 10 signals that differentiate Won from Lost. Return JSON: [{signal, won_rate, lost_rate, difference_pct, why_it_matters}]. Data: <paste /tmp/comparison.json>",
    "output": {"type": "jsonSchema", "jsonSchema": {"type": "array", "items": {"type": "object"}}}
  }' \
  --wait-until-finished
```

For deal sets > 100 records, do the diff in Python directly — LLM is more reliable for pattern *interpretation* on small samples than for *aggregation* on large ones.

### Step 5 — Validate signals (optional)

For each surfaced signal, validate by running it as a filter against the Won segment and checking hit rate:

```bash
# Example: signal is "uses Snowflake" → query storage + cargo technographics
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchTechnologies","config":{}}' \
  --data '{"fields":{"keywords":"snowflake"},"limit":1}' \
  --wait-until-finished
```

If the technology is in theirStack's catalog and the Won-rate is significantly higher than Lost-rate, lock the signal in for prospecting.

### Step 6 — Encode signals as ICP filters

Take the top 5–10 signals and translate them into filter syntax for prospecting providers:
- Industry / size / geo → `salesNavigator.searchAccounts` filters.
- Tech stack → `theirStack.searchCompanies.techFields.technologies`.
- Funding range → `peopleDataLabs.queryCompanies` ES query.

Hand the encoded filters to `cargo-tam-build` to build the next prospecting list.

## Credit budget

| Step | Cost per Won/Lost record | Records (assume 100 each) | Subtotal |
|---|---|---|---|
| matchBusiness | 0.5 | 200 | 100 |
| enrichBusinessFirmographics | 0.5 | 200 | 100 |
| enrichBusinessTechnographics | 1 | 200 | 200 |
| enrichBusinessFundingAndAcquisitions | 0.5 | 200 | 100 |
| enrichBusinessFinancialMetrics | 0.5 | 200 | 100 |
| anthropic.instruct (Sonnet, one call) | ~2 | 1 | 2 |
| **Total** | | | **~602 credits for full Won/Lost analysis on 200 deals** |

The skill is one-shot — run it once when the user wants to refine ICP, then use the output to drive prospecting going forward. Re-run quarterly to capture pipeline drift.

## Required inputs

Before executing, the agent needs:
1. The Deals / Opportunities model UUID (from `cargo-ai storage model list`).
2. The closed-won / closed-lost stage labels in the user's pipeline (often `closed-won` / `closed-lost` but may be `won` / `lost` / `unqualified`, etc.).
3. The lookback window (default: 12 months).

If any are missing, ask **once** before running — don't guess on the SQL.

## Action shape

`{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**

## Output retrieval

For batch enrichments, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>`.

## Output deliverable

The skill's final output is a markdown table the agent presents to the user:

```
Top differentiating ICP signals (Won vs Lost):

| # | Signal | Won rate | Lost rate | Δ | Notes |
|---|--------|---------:|----------:|--:|-------|
| 1 | Headcount 50-200 | 78% | 22% | +56pp | Smaller mid-market converts better |
| 2 | Uses Snowflake | 64% | 18% | +46pp | Data-mature stack signal |
| 3 | Series B+ | 71% | 35% | +36pp | Funded pipeline = budget |
| ... | | | | | |
```

Plus a follow-up suggestion: "Want me to run `/cargo-tam-build` with these signals as the filter?"

## When stuck — file a workspace report

If `storage query execute` fails or the deal model schema is unfamiliar, file via `cargo-ai workspaceManagement report create`. See [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md).
