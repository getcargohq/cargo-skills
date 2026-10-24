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
#    /tmp/funding.json is the batch object; the rows are the batch download CSV,
#    where the output field lastFundingDate arrives as cargo_lastFundingDate.
URL=$(cargo-ai orchestration batch download --uuid "$(jq -r .batch.uuid /tmp/funding.json)" | jq -r .url)
curl -fsSL "$URL" \
  | python3 -c 'import csv,json,sys; json.dump(list(csv.DictReader(sys.stdin)), sys.stdout)' \
  | jq -c --arg cutoff "$(date -v-90d -u +%Y-%m-%d 2>/dev/null || date -d '90 days ago' -u +%Y-%m-%d)" \
      '[.[] | select(.cargo_lastFundingDate > $cutoff)]' > /tmp/recent-funded.json
```

### Pattern B — Detect a *new* event on a known company (diff, not feed)

No credits-based action returns a since-timestamp event feed. (With the user's own
Explorium key, `explorium.fetchBusinessEvents` does — `event_types: ["new_funding_round"]`
plus `timestamp_from`, keyed on an Explorium `business_id` from `explorium.matchBusiness` —
and the `listenBusinessEvents` extractor pushes the same events as they happen, once the
connector has its Partner ID. That bills the user's Explorium plan, not Cargo credits.)
Without one, a "new round" is detected
by **diffing a fresh pull against what the Companies model already stores**, which
is why `last_funding_round_at` has to be a column before the watch is worth running:

This pattern stands alone — it does not depend on Pattern A's files.

```bash
# 1. The domains to watch, and the dates the workspace already holds for them.
#    Both sides of the diff come from the same model, so they always align.
cargo-ai storage query execute \
  "SELECT domain, last_funding_round_at FROM default.companies WHERE icp_tier IN ('tier-1','tier-2')" \
  > /tmp/known-funding.json

# 2. Re-pull funding for exactly those domains
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"getFunding"}' \
  --records "$(jq -c '[.rows[] | {domain}]' /tmp/known-funding.json)" \
  --wait-until-finished > /tmp/fresh.json

# 3. Keep only rows whose latest round post-dates the stored value.
#    getFunding declares no output schema (get-output-schema answers
#    actionHasNoOutput); its date field is lastFundingDate, which the batch
#    download CSV carries as cargo_lastFundingDate next to the input domain.
URL=$(cargo-ai orchestration batch download --uuid "$(jq -r .batch.uuid /tmp/fresh.json)" | jq -r .url)
curl -fsSL "$URL" \
  | python3 -c 'import csv,json,sys; json.dump(list(csv.DictReader(sys.stdin)), sys.stdout)' \
  | jq -c --slurpfile known /tmp/known-funding.json '
  ($known[0].rows
     | map({key: .domain, value: (.last_funding_round_at // "")})
     | from_entries) as $stored
  | [ .[] | select(.cargo_lastFundingDate > ($stored[.domain] // "")) ]
' > /tmp/new-rounds.json
```

A row with no stored date compares against `""` and always passes, which is the
right behaviour on first run and the reason step 4 must write `last_funding_round_at`
back — otherwise every run is a first run.

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

Because there is no credits-based since-timestamp feed (Explorium, above, is own-key), cadence is the only cost dial. Default to **weekly**, and gate the node on `last_funding_round_at` so an account that raised recently is skipped until the window reopens.

## Surfacing the signal

The output of this recipe is a list of company records with funding events. Offer the user 2–3 of the moves below, **grounded in the rows just produced** (counts, balance, per-unit cost, a default pick — the next-step shape in [`../SKILL.md`](../SKILL.md) §4), never as a generic menu:

- **Outbound timing**: hand the list to a sequencer (lemlist / lgm / instantly) for a fresh-funding-triggered campaign — discover the launch action via `cargo-ai connection integration get lemlist` and run via `orchestration action execute-batch`.
- **CRM enrichment**: write a `last_funding_round_at` column on the Companies model, push to HubSpot via `hubspot.upsertRecords` (compose ad hoc — see [`build-tam.md`](build-tam.md) for the CRM-push pattern).
- **Sales notification**: post to Slack when a tier-1 account hits a funding milestone. Use `slack` connector or `http.call` for webhook patterns.

## Action shape

`{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"getFunding"}`. **No `connectorUuid` in `config`** — the single workspace connector resolves automatically.

## Output retrieval

For `execute-batch` runs, use `cargo-ai orchestration batch download --uuid <batch-uuid>` (signed CSV URL, as above). For a saved play, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>`.

## Alternative provider

`getFunding` is the only credits-based funding action in the catalog. Where it misses, `companyEnrich.enrichByDomain` (0.25) carries a coarser funding block, `peopleDataLabs.queryCompanies` (3 per company, PDL SQL) can filter on round fields (`latest_funding_stage`, `last_funding_date`) directly, and investor filters go to `theirStack.searchCompanies` (`fields.company_investors_partial_match_or`, 0.5 per company; PDL has no investor field) — see [`portfolio-prospecting.md`](portfolio-prospecting.md).

## When stuck — file a workspace report

If a target company has known recent funding but `enrichCrm.getFunding` returns empty: file a `cargo-ai workspaceManagement report create` with the domain so the coverage gap is on record.
