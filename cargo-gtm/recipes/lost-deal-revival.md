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
| `price` / `budget` / `no_budget` | Company raised a fresh round (`enrichCrm.getFunding`, compared against the deal's close date). |
| `wrong_time` / `timing` | A re-org or new exec hire (`salesNavigator.searchLeads` with `role.seniorityLevels: ["300", "310"]` (VP, CXO) and `recentUpdates.changedJobs`). |
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
    {"kind":"date","columnSlug":"closed_at","operator":"lowerThan","value":"'"$CUTOFF"'"}
  ]}]}' > /tmp/lost-deals.json
```

`CUTOFF` is the ISO date 90 days ago (e.g. `2026-07-18`): date conditions take an absolute `value` with `is`, `isNot`, `greaterThan`, `lowerThan` or `between`; there is no relative `olderThan` operator.

The 90-day floor avoids re-touching deals while they're still mentally fresh with the buyer. Adjust to match the workspace's cooling convention.

### Step 2 — Branch by `lost_reason`

```bash
jq -c '[.records[] | select(.lost_reason == "champion_left" or .lost_reason == "no_decision_maker")]' /tmp/lost-deals.json > /tmp/lost-champion.json
jq -c '[.records[] | select(.lost_reason == "price" or .lost_reason == "budget" or .lost_reason == "no_budget")]' /tmp/lost-deals.json > /tmp/lost-budget.json
jq -c '[.records[] | select(.lost_reason == "wrong_time" or .lost_reason == "timing")]' /tmp/lost-deals.json > /tmp/lost-timing.json
```

### Step 3a — Champion-left branch: detect job changes

`execute-batch --wait-until-finished` prints the batch object, not rows. Rows come from `batch download`: a signed CSV of each input record's columns plus every output key as `cargo_<key>` (nested objects as dotted columns, e.g. `cargo_person.company_name`). This helper turns it into JSON for jq:

```bash
batch_rows() {
  curl -fsSL "$(cargo-ai orchestration batch download --uuid "$1" | jq -r .url)" \
    | python3 -c 'import csv,json,sys; json.dump(list(csv.DictReader(sys.stdin)), sys.stdout)'
}
```

```bash
# deal_id rides along in each record so it comes back as a CSV column; the
# action ignores it
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"detectJobChange"}' \
  --records "$(jq -c '[.[] | {
    deal_id,
    professional_email: .primary_contact_email,
    contact_linkedin: .primary_contact_linkedin,
    company_domain: .account_domain
  }]' /tmp/lost-champion.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/champion-changes.json

# Keep moved rows (job_change_status is lowercase) — the contact is at a new
# (target) company, given under person.*
jq -c '[.[] | select(.cargo_job_change_status == "moved")]' /tmp/champion-changes.json > /tmp/revive-champion.json
```

### Step 3b — Budget branch: detect fresh funding

There is no credits-based since-timestamp event feed (`explorium.fetchBusinessEvents`
with `timestamp_from` is one, on the user's own Explorium key — see
[`funding-watch.md`](funding-watch.md) Pattern B), so "fresh round" is a
**diff**: pull current funding data, then keep the accounts whose latest round
post-dates the deal's close date.

```bash
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"enrichCrm","actionSlug":"getFunding"}' \
  --records "$(jq -c '[.[] | {domain: .account_domain}]' /tmp/lost-budget.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/budget-funding.json

# Keep deals where a funding round closed AFTER the original deal lost, and
# carry deal_id through — step 4 merges on it and getFunding does not return it.
# The input `domain` column comes back alongside cargo_lastFundingDate.
jq -c --slurpfile lost /tmp/lost-budget.json '
  ($lost[0] | map({key: .account_domain, value: .}) | from_entries) as $deal
  | [ .[]
      | . as $f
      | select(($f.cargo_lastFundingDate // "") != "")
      | $deal[$f.domain]
      | select($f.cargo_lastFundingDate > (.closed_at // "9999"))
      | {deal_id, account_domain: $f.domain, lastFundingDate: $f.cargo_lastFundingDate} ]
' /tmp/budget-funding.json > /tmp/revive-budget.json
```

### Step 3c — Timing branch: detect new exec hires at the account

searchLeads has no domain filter: it scopes to a company by its LinkedIn company id (`company.currentCompanyIds`). This assumes the deal carries it as `account_linkedin_id`; when it doesn't, resolve it first with `linkedin.enrichCompanyFromDomain` (0.5, returns `company_id`).

```bash
# Codes are LinkedIn's, as strings: seniority "300" VP, "310" CXO;
# functions "25" Sales, "18" Operations, "8" Engineering
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads"}' \
  --records "$(jq -c '[.[] | select(.account_linkedin_id) | {
    deal_id, account_domain,
    company: {currentCompanyIds: [.account_linkedin_id]},
    role: {seniorityLevels: ["300", "310"], functions: ["25", "18", "8"]},
    recentUpdates: {changedJobs: true},
    limit: 5
  }]' /tmp/lost-timing.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/timing-execs.json

# Keep accounts with at least one fresh exec hire. The leads array lands in
# one `cargo` column as JSON; recently_hired marks the new joiners
jq -c '[.[] | (.cargo // "" | if . == "" then [] else fromjson end | map(select(.recently_hired == true))) as $l
        | select($l | length > 0) | {deal_id, account_domain, leads: $l}]' \
  /tmp/timing-execs.json > /tmp/revive-timing.json
```

Adjust the function list to match where your buyer typically sits (other function codes: "15" Marketing, "13" Information Technology; resolve a name with the salesNavigator `listFunctions` autocomplete). Names like `"Sales"` match nothing.

### Step 4 — Merge into a single revive segment

```bash
# `inputs` is a generator, not an array — slurp it before indexing.
jq -c -n '[inputs] as $in
  | ([$in[0][] | {deal_id: .deal_id, account_domain: .company_domain, revival: "champion_changed",
                   details: {company_name: .["cargo_person.company_name"], company_domain: .["cargo_person.company_domain"], title: .["cargo_person.title"]}}] +
     [$in[1][] | {deal_id: .deal_id, account_domain: .account_domain, revival: "fresh_funding", details: {lastFundingDate: .lastFundingDate}}] +
     [$in[2][] | {deal_id: .deal_id, account_domain: .account_domain, revival: "new_exec", details: .leads[0]}])
' /tmp/revive-champion.json /tmp/revive-budget.json /tmp/revive-timing.json > /tmp/lost-revival.json
```

### Step 5 — Hand off to outreach activation

Pass `/tmp/lost-revival.json` to [`outreach-activation.md`](outreach-activation.md). The `revival` field becomes the `signal_summary` input to the personalization prompt — *"They lost on budget, but just raised a $40M Series B"* writes much better cold-email copy than a generic signal.

## Recurring scan (cron / play)

For ongoing revival:

1. Trigger: monthly cron (lost deals don't churn signals fast enough for weekly).
2. Source: Closed-Lost deals segment with `closed_at` more than 90 days ago.
3. Nodes: branch by `lost_reason` → run matching detector → union → write to "Lost — revival candidates" segment.

For play setup, see [`../../cargo-orchestration/references/examples/plays.md`](../../cargo-orchestration/references/examples/plays.md).

## Credit budget

For a 300-deal Closed-Lost cohort, scanned monthly:

| Branch | Per record | Records (assumed 1/3 each) | Subtotal |
|---|---|---|---|
| `waterfall.detectJobChange` | 3 | 100 | 300 |
| `enrichCrm.getFunding` | 1 | 100 | 100 |
| `salesNavigator.searchLeads` | 0.2 per lead returned (`limit: 5`, ≤ 1 per account) | 100 | ≤ 100 |
| **Total monthly** | — | 300 | **≤ 500** |

Much cheaper than the broader [`re-engagement.md`](re-engagement.md) scan because each branch only runs on the relevant subset.

## Action shape

Every action follows: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>"}`. **No `connectorUuid` in `config`** — see [`../../cargo-orchestration/references/examples/actions.md`](../../cargo-orchestration/references/examples/actions.md).

## Output retrieval

For batch runs, use `cargo-ai orchestration batch download --uuid <batch-uuid>` (the `batch_rows` helper above): an ad-hoc `execute-batch` has no workflow, so `run download-outputs --workflow-uuid` does not apply. See [`../references/output-retrieval.md`](../references/output-retrieval.md).

## Related

- [`re-engagement.md`](re-engagement.md) — broader: any stale contact, not specifically Closed-Lost deals.
- [`icp-discovery.md`](icp-discovery.md) — upstream: surfaces *why* deals are being lost (Closed-Won vs Closed-Lost diff), which informs the lost-reason categorization here.
- [`outreach-activation.md`](outreach-activation.md) — downstream: turns the revival segment into send-ready outreach.
