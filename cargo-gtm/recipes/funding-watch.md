# Recipe — Track recently-funded companies for outbound timing

Use this recipe when the user wants to identify or monitor companies that recently raised funding. Funding events are one of the strongest outbound-timing signals — a fresh round means budget, hiring, and a willingness to evaluate new tools.

**Trigger phrases:**
- *"Find every fintech that raised in the last 90 days."*
- *"Which of our target accounts just got funded?"*
- *"Alert me when a company in my segment raises Series B or later."*
- *"Build a 'recently funded' segment for outbound."*

## Recipe

### Pattern A — Surface recent fundraises across a target segment

```bash
# 1. Pull the target accounts
cargo-ai storage model list  # find the Companies model UUID
MODEL_UUID=...

cargo-ai segmentation segment fetch \
  --model-uuid "$MODEL_UUID" \
  --filter '{"conjonction":"and","groups":[{"conjonction":"and","conditions":[
    {"kind":"string","columnSlug":"icp_tier","operator":"is","values":["tier-1","tier-2"]}
  ]}]}' > /tmp/targets.json

# 2. Pull funding + acquisition data — keyed on domain, no match step
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"getFunding"}' \
  --records "$(jq -c '[.records[] | {domain}]' /tmp/targets.json)" \
  --wait-until-finished > /tmp/funding.json

# 3. Filter to recent rounds (last 90 days)
jq -c '[.results[]
  | select(.funding_rounds[]? | (.announced_date // "") > "'$(date -v-90d -u +%Y-%m-%d 2>/dev/null || date -d "90 days ago" -u +%Y-%m-%d)'")]' \
  /tmp/funding.json > /tmp/recent-funded.json
```

### Pattern B — Detect a *new* event on a known company (diff, not feed)

There is no since-timestamp event feed in the catalog. A "new round" is detected
by **diffing a fresh pull against what the Companies model already stores**, which
is why `last_funding_round_at` has to be a column before the watch is worth running:

```bash
# Re-pull, then keep only rows whose latest round post-dates the stored value
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"getFunding"}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished > /tmp/fresh.json

# Confirm the output field name first (free, runs nothing):
#   cargo-ai orchestration action get-output-schema \
#     --action '{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"getFunding","config":{}}'
jq -c --slurpfile stored /tmp/targets.json '
  ($stored[0].records
     | map({key: .domain, value: (.last_funding_round_at // "")})
     | from_entries) as $known
  | [ .results[] | select(.lastFundingDate > ($known[.domain] // "")) ]
' /tmp/fresh.json > /tmp/new-rounds.json
```

The diff is free; the re-pull is not. That is the cost shape the cadence below is
sized against.

### Pattern C — Recurring funding watch (play)

For continuous monitoring (e.g. weekly scan of target accounts):
1. Trigger: weekly cron.
2. Source: a saved segment of target accounts.
3. Action: `enrichCrm.getFunding`, gated to rows whose `last_funding_round_at` is older than the refresh window.
4. Output: write rows whose latest round post-dates the stored value to a "Recently Funded" signal segment.
5. Optional: post Slack notification per new funding event.

To make this recurring, follow [`save-as-play.md`](save-as-play.md) — it walks the tool-vs-play choice, the cadence defaults per signal, and the recurring-cost approval. Play mechanics: [`../../cargo-orchestration/references/examples/plays.md`](../../cargo-orchestration/references/examples/plays.md).

## Credit budget

| Pattern | Cost per record |
|---|---|
| `enrichCrm.getFunding` | 1 |

500 target accounts × 1 = 500 credits per scan. A **daily** cron over 30 days is 15,000 credits, and it is almost always wrong: rounds are announced on a scale of months, so the pull re-bills unchanged data 29 days out of 30.

Because there is no since-timestamp feed, cadence is the only cost dial. Default to **weekly**, and gate the node on `last_funding_round_at` so an account that raised recently is skipped until the window reopens.

## Surfacing the signal

The output of this recipe is a list of company records with funding events. Offer the user 2–3 of the moves below, **grounded in the rows just produced** (counts, balance, per-unit cost, a default pick — the next-step shape in [`../SKILL.md`](../SKILL.md) §4), never as a generic menu:

- **Outbound timing**: hand the list to a sequencer (lemlist / lgm / instantly) for a fresh-funding-triggered campaign — discover the launch action via `cargo-ai connection integration get lemlist` and run via `orchestration action execute-batch`.
- **CRM enrichment**: write a `last_funding_round_at` column on the Companies model, push to HubSpot via `hubspot.upsertRecords` (compose ad hoc — see [`build-tam.md`](build-tam.md) for the CRM-push pattern).
- **Sales notification**: post to Slack when a tier-1 account hits a funding milestone. Use `slack` connector or `http.call` for webhook patterns.

## Action shape

`{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"getFunding"}`. **No `connectorUuid` in `config`** — the single workspace connector resolves automatically.

## Output retrieval

For batch runs, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>`.

## Alternative provider

`getFunding` is the only credits-based funding action in the catalog. Where it misses, `companyEnrich.enrichByDomain` (0.25) carries a coarser funding block, and `peopleDataLabs.queryCompanies` (3, PDL SQL) can filter on investor and round fields directly — see [`portfolio-prospecting.md`](portfolio-prospecting.md).

## When stuck — file a workspace report

If a target company has known recent funding but `enrichCrm.getFunding` returns empty: file a `cargo-ai workspaceManagement report create` with the domain so the coverage gap is on record.
