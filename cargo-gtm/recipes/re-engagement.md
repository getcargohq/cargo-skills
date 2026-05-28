# Recipe — Re-engage stale contacts when a fresh signal fires

Use this recipe when the user wants to systematically wake up cold contacts — old prospects, unresponsive leads, dormant opportunities — but only when a meaningful signal makes outreach worthwhile. The recipe polls cold contacts against the three highest-intent signal sources and re-engages only on a hit.

**Trigger phrases:**

- *"Resurrect cold leads when something changes at their company."*
- *"Re-engage contacts in the stale segment if they moved jobs or their company raised."*
- *"Build a recurring scan that wakes up old prospects on real signals."*
- *"Find old contacts worth reaching out to again."*

## Why this recipe exists

Most stale contacts will stay stale — outreach to them is wasted credits and damages sender reputation. But ~5–10% of any stale list develops a fresh trigger in any given quarter. Those are the contacts to act on. This recipe filters mechanically so the user only sees revive-worthy rows.

Three signals dominate B2B revival timing:

1. **Job change** (`waterfall.detectJobChange`) — the contact moved to a new company. Their old relationship is now warm context for a new account.
2. **Fresh funding / acquisition** (`cargo.fetchBusinessEvents`) — fresh budget, new initiatives, willingness to evaluate.
3. **New tech stack or hiring pattern** (`theirStack.searchTechnologies` / `searchJobs`) — they're solving a problem your product addresses.

## Recipe

### Step 1 — Define the stale segment

A "stale contact" is one with no engagement for ≥ 180 days, not currently a customer, not currently in an active opportunity.

```bash
cargo-ai storage model list  # find the Contacts model UUID
MODEL_UUID=...

cargo-ai segmentation segment fetch \
  --model-uuid "$MODEL_UUID" \
  --filter '{"conjonction":"and","groups":[{"conjonction":"and","conditions":[
    {"kind":"date","columnSlug":"last_activity_at","operator":"olderThan","values":["180d"]},
    {"kind":"string","columnSlug":"lifecycle_stage","operator":"isNot","values":["customer","opportunity"]}
  ]}]}' > /tmp/stale.json
```

Adjust the threshold (`180d` → `365d` for very large lists) and exclusions to match the workspace's CRM lifecycle conventions.

### Step 2 — Check for job changes

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"detectJobChange","config":{}}' \
  --records "$(jq -c '[.records[] | {
    professional_email: .email,
    contact_linkedin: .linkedin_url,
    company_domain: .company_domain
  }]' /tmp/stale.json)" \
  --wait-until-finished > /tmp/job-changes.json
```

`MOVED` rows are immediate revive candidates — the contact is at a new company, the old relationship is warm, and previous deal blockers (price, feature gap, internal politics) no longer apply.

### Step 3 — Check company-level events (funding / acquisition)

```bash
# Match contact's company → cargo business_id, then fetch events
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchBusiness","config":{}}' \
  --records "$(jq -c '[.records[] | {domain: .company_domain}]' /tmp/stale.json)" \
  --wait-until-finished > /tmp/matched.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"fetchBusinessEvents","config":{}}' \
  --records "$(jq -c '[.results[] | select(.business_id) | {business_id, event_types: ["funding","acquisition"], since: "90d"}]' /tmp/matched.json)" \
  --wait-until-finished > /tmp/events.json
```

### Step 4 — (Optional) Check tech-stack / hiring intent

For contacts at companies where a tech signal is your strongest qualifier:

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchTechnologies","config":{}}' \
  --records "$(jq -c '[.records[] | {company_domain: .company_domain, technologies: ["snowflake","databricks"]}]' /tmp/stale.json)" \
  --wait-until-finished > /tmp/tech.json
```

Only run this step when the workspace's ICP has a strong tech-stack correlation. Otherwise skip — it adds credits with low marginal hit rate.

### Step 5 — Union into "revive candidates"

```bash
jq -c -n '
  ([inputs[0].results[] | select(.status == "MOVED") | {email, signal: "job_change", details: .new_company}] +
   [inputs[1].results[] | select((.events // []) | length > 0) | {email, signal: "company_event", details: .events[0]}] +
   [inputs[2].results[] | select(.matches // false) | {email, signal: "tech_match", details: .technologies}])
  | group_by(.email) | map({email: .[0].email, signals: map(.signal), details: map(.details)})
' /tmp/job-changes.json /tmp/events.json /tmp/tech.json > /tmp/revive-candidates.json
```

Contacts with **2+ signals** are highest priority — surface them first.

### Step 6 — Hand off to outreach activation

Pass the revive segment to [`outreach-activation.md`](outreach-activation.md) — it handles enrichment, verification, LLM personalization, and sequencer push.

## Recurring scan (cron / play)

For continuous revival:

1. Trigger: weekly cron.
2. Source: the saved "Stale contacts" segment.
3. Nodes: detectJobChange + fetchBusinessEvents + (optional) searchTechnologies → union → write to "Revive candidates" segment.
4. Downstream: a separate play watches the "Revive candidates" segment and triggers `outreach-activation` on new members.

For play setup, see [`../../cargo-orchestration/references/examples/plays.md`](../../cargo-orchestration/references/examples/plays.md).

## Credit budget

For a 1,000-contact stale segment, scanned weekly:

| Step | Per record | 1,000 contacts |
|---|---|---|
| `waterfall.detectJobChange` | 3 | 3,000 |
| `cargo.matchBusiness` | 0.1 | 100 |
| `cargo.fetchBusinessEvents` | 0.5 | 500 |
| `theirStack.searchTechnologies` (optional) | 1 | 1,000 |
| **Total weekly (without tech)** | **3.6** | **3,600** |
| **Total weekly (with tech)** | **4.6** | **4,600** |

Filter aggressively before the scan — only include contacts where revival is actually actionable (had real engagement once, valid email, ICP-fit company). Pre-filter a 10,000-contact list down to 1,000 before scanning, not after.

## Action shape

Every action follows: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`** — see [`../../cargo-orchestration/references/examples/actions.md`](../../cargo-orchestration/references/examples/actions.md).

## Output retrieval

For batch runs, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>`. See [`../references/output-retrieval.md`](../references/output-retrieval.md).

## Related

- [`job-change-monitoring.md`](job-change-monitoring.md) — narrower: just job changes, applied to any segment (not specifically stale).
- [`lost-deal-revival.md`](lost-deal-revival.md) — narrower: scoped specifically to Closed-Lost CRM deals, branches on `lost_reason`.
- [`outreach-activation.md`](outreach-activation.md) — downstream: turns the revive segment into send-ready outreach.
