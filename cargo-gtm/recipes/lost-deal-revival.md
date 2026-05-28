# Recipe — Revive Closed-Lost deals when the original blocker is gone

Use this recipe when the user wants to systematically revisit **Closed-Lost CRM deals** and only re-engage the ones where the *original lost-reason* is no longer relevant. Tighter scope than [`re-engagement.md`](re-engagement.md): input is explicitly Closed-Lost deals from the CRM (HubSpot, Salesforce, etc.), and the scan branches on `lost_reason`.

**Trigger phrases:**

- *"Revisit Closed-Lost deals where the champion left."*
- *"Find lost deals worth reopening — anyone who lost on budget but just got funded?"*
- *"Replay our Closed-Lost pipeline against current signals."*
- *"Which lost deals are revivable this quarter?"*

## Why this recipe exists

Most Closed-Lost deals stay lost. But specific lost-reason categories have specific revival triggers:

| `lost_reason` | Revival trigger |
|---|---|
| `champion_left` / `no_decision_maker` | Original contact moved to a new company (`waterfall.detectJobChange`) — warm intro at the new account. |
| `price` / `budget` / `no_budget` | Company raised a fresh round (`cargo.fetchBusinessEvents`). |
| `wrong_time` / `timing` | A re-org or new exec hire (`salesNavigator.searchLeads` with `seniority: ["VP+", "C-Level"]` filter, joined date < 90d). |
| `feature_gap` / `missing_feature` | Manual — replay based on your product release date vs. deal close date. |
| `competitor_won` | Annual revisit at renewal time — check competitor satisfaction signals if available. |

The recipe runs each branch only against deals with the matching reason, keeping credit spend bounded.

## Recipe

### Step 1 — Pull Closed-Lost deals from the CRM

```bash
cargo-ai storage model list  # find the Deals / Opportunities model UUID
DEALS_MODEL=...

cargo-ai segmentation segment fetch \
  --model-uuid "$DEALS_MODEL" \
  --filter '{"conjonction":"and","groups":[{"conjonction":"and","conditions":[
    {"kind":"string","columnSlug":"stage","operator":"is","values":["Closed Lost"]},
    {"kind":"date","columnSlug":"closed_at","operator":"olderThan","values":["90d"]}
  ]}]}' > /tmp/lost-deals.json
```

The 90-day floor avoids re-touching deals while they're still mentally fresh with the buyer. Adjust to match the workspace's cooling convention.

### Step 2 — Branch by `lost_reason`

```bash
jq -c '[.records[] | select(.lost_reason == "champion_left" or .lost_reason == "no_decision_maker")]' /tmp/lost-deals.json > /tmp/lost-champion.json
jq -c '[.records[] | select(.lost_reason == "price" or .lost_reason == "budget" or .lost_reason == "no_budget")]' /tmp/lost-deals.json > /tmp/lost-budget.json
jq -c '[.records[] | select(.lost_reason == "wrong_time" or .lost_reason == "timing")]' /tmp/lost-deals.json > /tmp/lost-timing.json
```

### Step 3a — Champion-left branch: detect job changes

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"detectJobChange","config":{}}' \
  --records "$(jq -c '[.[] | {
    professional_email: .primary_contact_email,
    contact_linkedin: .primary_contact_linkedin,
    company_domain: .account_domain
  }]' /tmp/lost-champion.json)" \
  --wait-until-finished > /tmp/champion-changes.json

# Keep MOVED rows — the contact is at a new (target) company
jq -c '[.results[] | select(.status == "MOVED")]' /tmp/champion-changes.json > /tmp/revive-champion.json
```

### Step 3b — Budget branch: detect fresh funding

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchBusiness","config":{}}' \
  --records "$(jq -c '[.[] | {domain: .account_domain}]' /tmp/lost-budget.json)" \
  --wait-until-finished > /tmp/budget-matched.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"fetchBusinessEvents","config":{}}' \
  --records "$(jq -c '[.results[] | select(.business_id) | {business_id, event_types: ["funding"], since: "180d"}]' /tmp/budget-matched.json)" \
  --wait-until-finished > /tmp/budget-events.json

# Keep deals where a funding round closed AFTER the original deal lost
jq -c '[.results[] | select((.events // []) | length > 0)]' /tmp/budget-events.json > /tmp/revive-budget.json
```

### Step 3c — Timing branch: detect new exec hires at the account

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads","config":{}}' \
  --records "$(jq -c '[.[] | {
    company_domain: .account_domain,
    seniority: ["VP+", "C-Level"],
    function: ["Sales","Revenue Operations","Engineering"],
    joined_within_days: 90
  }]' /tmp/lost-timing.json)" \
  --wait-until-finished > /tmp/timing-execs.json

# Keep accounts with at least one fresh exec hire
jq -c '[.results[] | select((.leads // []) | length > 0)]' /tmp/timing-execs.json > /tmp/revive-timing.json
```

Adjust the function list to match where your buyer typically sits.

### Step 4 — Merge into a single revive segment

```bash
jq -c -n '
  ([inputs[0][] | {deal_id: .deal_id, account_domain: .company_domain, revival: "champion_changed", details: .new_company}] +
   [inputs[1][] | {deal_id: .deal_id, account_domain: .domain, revival: "fresh_funding", details: .events[0]}] +
   [inputs[2][] | {deal_id: .deal_id, account_domain: .company_domain, revival: "new_exec", details: .leads[0]}])
' /tmp/revive-champion.json /tmp/revive-budget.json /tmp/revive-timing.json > /tmp/lost-revival.json
```

### Step 5 — Hand off to outreach activation

Pass `/tmp/lost-revival.json` to [`outreach-activation.md`](outreach-activation.md). The `revival` field becomes the `signal_summary` input to the personalization prompt — *"They lost on budget, but just raised a $40M Series B"* writes much better cold-email copy than a generic signal.

## Recurring scan (cron / play)

For ongoing revival:

1. Trigger: monthly cron (lost deals don't churn signals fast enough for weekly).
2. Source: Closed-Lost deals segment with `closed_at older than 90d`.
3. Nodes: branch by `lost_reason` → run matching detector → union → write to "Lost — revival candidates" segment.

For play setup, see [`../../cargo-orchestration/references/examples/plays.md`](../../cargo-orchestration/references/examples/plays.md).

## Credit budget

For a 300-deal Closed-Lost cohort, scanned monthly:

| Branch | Per record | Records (assumed 1/3 each) | Subtotal |
|---|---|---|---|
| `waterfall.detectJobChange` | 3 | 100 | 300 |
| `cargo.matchBusiness` + `fetchBusinessEvents` | 0.6 | 100 | 60 |
| `salesNavigator.searchLeads` | 2 | 100 | 200 |
| **Total monthly** | — | 300 | **560** |

Much cheaper than the broader [`re-engagement.md`](re-engagement.md) scan because each branch only runs on the relevant subset.

## Action shape

Every action follows: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`** — see [`../../cargo-orchestration/references/examples/actions.md`](../../cargo-orchestration/references/examples/actions.md).

## Output retrieval

For batch runs, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>`. See [`../references/output-retrieval.md`](../references/output-retrieval.md).

## Related

- [`re-engagement.md`](re-engagement.md) — broader: any stale contact, not specifically Closed-Lost deals.
- [`icp-discovery.md`](icp-discovery.md) — upstream: surfaces *why* deals are being lost (Closed-Won vs Closed-Lost diff), which informs the lost-reason categorization here.
- [`outreach-activation.md`](outreach-activation.md) — downstream: turns the revival segment into send-ready outreach.
