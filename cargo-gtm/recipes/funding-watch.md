# Recipe — Track recently-funded companies for outbound timing

Use this skill when the user wants to identify or monitor companies that recently raised funding. Funding events are one of the strongest outbound-timing signals — a fresh round means budget, hiring, and a willingness to evaluate new tools.

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

# 2. Match each domain to a cargo business_id (required for the funding action)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchBusiness","config":{}}' \
  --records "$(jq -c '[.records[] | {domain}]' /tmp/targets.json)" \
  --wait-until-finished > /tmp/matched.json

# 3. Pull funding + acquisition events
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichBusinessFundingAndAcquisitions","config":{}}' \
  --records "$(jq -c '[.results[] | select(.business_id) | {business_id}]' /tmp/matched.json)" \
  --wait-until-finished > /tmp/funding.json

# 4. Filter to recent rounds (last 90 days)
jq -c '[.results[]
  | select(.funding_rounds[]? | (.announced_date // "") > "'$(date -v-90d -u +%Y-%m-%d 2>/dev/null || date -d "90 days ago" -u +%Y-%m-%d)'")]' \
  /tmp/funding.json > /tmp/recent-funded.json
```

### Pattern B — Monitor a known company for new events (event-driven)

```bash
# Get all events of type "funding" or "acquisition" for one or many businesses
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"fetchBusinessEvents","config":{}}' \
  --records '[
    {"business_id":"<uuid>","event_types":["funding","acquisition"],"timestamp_from":"2026-03-01T00:00:00Z"}
  ]' \
  --wait-until-finished
```

`fetchBusinessEvents` returns events of various types — pass `event_types` to scope. Common types include `funding`, `acquisition`, `hiring`, `linkedin_post`. Useful for "what happened at this company recently?" queries beyond funding.

### Pattern C — Recurring funding watch (play)

For continuous monitoring (e.g. daily scan of target accounts):
1. Trigger: daily cron.
2. Source: a saved segment of target accounts.
3. Action: `cargo.enrichBusinessFundingAndAcquisitions` or `cargo.fetchBusinessEvents` with `timestamp_from = yesterday`.
4. Output: write rows where new events found to a "Recently Funded" signal segment.
5. Optional: post Slack notification per new funding event.

For setting up a play / scheduled tool, see `../../cargo-orchestration/references/plays.md`.

## Credit budget

| Pattern | Cost per record |
|---|---|
| `cargo.matchBusiness` | 0.5 |
| `cargo.enrichBusinessFundingAndAcquisitions` | 0.5 |
| `cargo.fetchBusinessEvents` | 0.5 |

500 target accounts × (0.5 match + 0.5 funding) = 500 credits per scan. Daily cron over 30 days = 15,000 credits.

For long-running monitoring, prefer `fetchBusinessEvents` with `timestamp_from` set to "since last scan" — cheaper than re-pulling full funding history each time.

## Surfacing the signal

The output of this skill is a list of company records with funding events. Useful next steps:

- **Outbound timing**: hand the list to a sequencer (lemlist / lgm / instantly) for a fresh-funding-triggered campaign — discover the launch action via `cargo-ai connection integration get lemlist` and run via `orchestration action execute-batch`.
- **CRM enrichment**: write a `last_funding_round_at` column on the Companies model, push to HubSpot via `hubspot.upsertRecords` (compose ad hoc — see [`build-tam.md`](build-tam.md) for the CRM-push pattern).
- **Sales notification**: post to Slack when a tier-1 account hits a funding milestone. Use `slack` connector or `http.call` for webhook patterns.

## Action shape

`{"kind":"connector","integrationSlug":"cargo","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`** — single workspace cargo connector resolves automatically.

## Output retrieval

For batch runs, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>`.

## Alternative provider

`enrichCrm.getFunding` (1 credit) is an alternative if cargo's match misses a private company. Generally cargo native has wider coverage for venture-backed startups; escalate to enrichCrm for fallback only.

## When stuck — file a workspace report

If a target company has known recent funding but `cargo.enrichBusinessFundingAndAcquisitions` returns empty: file a `cargo-ai workspaceManagement report create` with the domain so cargo can verify catalog coverage.
