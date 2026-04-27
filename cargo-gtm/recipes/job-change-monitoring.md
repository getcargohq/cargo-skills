# Recipe — Detect job changes in a contact segment

Use this skill when the user wants to detect job changes among a list of contacts. **The only provider in cargo's 120-integration catalog with a credits-based job-change action is `waterfall.detectJobChange`** — this skill exists to make that capability discoverable and reusable.

**Trigger phrases:**
- *"Has anyone in our customer list changed jobs?"*
- *"Show me which contacts in the New Inbound segment have moved companies."*
- *"Track job changes for our top accounts."*
- *"Find all our champions who left their company."*

## Why this skill exists

Job change is one of the highest-intent signals in B2B GTM:
- **MOVED contacts at target accounts** → re-engage at the new company; the relationship is warm.
- **MOVED contacts at customer accounts** → renewal / churn risk; the original champion is gone.
- **MOVED prospects in old segments** → trigger fresh outreach; previous reasons not to buy may no longer apply.

`waterfall.detectJobChange` returns one of: `MOVED`, `LEFT`, `NO_CHANGE`, `UNKNOWN` — plus updated person info when `MOVED`.

## Recipe

### Step 1 — Pull the contact segment

```bash
cargo-ai storage model list  # find the Contacts model UUID
MODEL_UUID=...

cargo-ai segmentation segment fetch \
  --model-uuid "$MODEL_UUID" \
  --filter '{"conjonction":"and","groups":[{"conjonction":"and","conditions":[
    {"kind":"string","columnSlug":"lifecycle_stage","operator":"is","values":["customer","champion"]}
  ]}]}' > /tmp/contacts.json
```

Adjust the filter to match the segment the user wants to monitor.

### Step 2 — Detect job changes

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"detectJobChange","config":{}}' \
  --records "$(jq -c '[.records[] | {
    professional_email: .email,
    contact_linkedin: .linkedin_url,
    company_domain: .company_domain
  }]' /tmp/contacts.json)" \
  --wait-until-finished > /tmp/job-changes.json
```

**Identifier strategy:** pass as many identifiers as you have. Best coverage: `contact_linkedin` + `company_domain`. Email-only inputs often return `UNKNOWN`.

### Step 3 — Filter to MOVED contacts

```bash
jq -c '[.results[] | select(.status == "MOVED")]' /tmp/job-changes.json > /tmp/moved.json
```

The `MOVED` rows include the **new** company and (sometimes) the new title. Use these to:
- Update the contact's `current_company` column in the cargo Contacts model.
- Surface as a "Job Changes — Last 30 Days" segment for outbound timing.
- Write a Slack notification per MOVED row.

### Step 4 — (Optional) Write back to the model

If a `current_company` or `last_job_change_at` column exists on the Contacts model:

```bash
# Use cargo-ai storage / segment patterns to upsert.
# See ../../cargo-storage/SKILL.md.
```

For pushing the MOVED set to a CRM (HubSpot custom property, Salesforce field), compose ad hoc with `hubspot.upsertRecords` / `salesforce.upsert` — discover the action via `cargo-ai connection integration get hubspot` and run it via `orchestration action execute-batch`.

## Recurring monitoring (cron / play)

For continuous monitoring (e.g. weekly job-change scan), build a play:
1. Trigger: weekly cron.
2. Source: a saved segment of contacts to monitor.
3. Action node: `waterfall.detectJobChange`.
4. Output: write `MOVED` rows to a "Job Changes — Recent" segment.

For setting up a play / scheduled tool, see `../../cargo-orchestration/references/plays.md`.

## Credit budget

`waterfall.detectJobChange` is 3 credits per record. Run sparingly:

| Volume | Cost |
|---|---|
| 100 contacts | 300 credits |
| 500 contacts | 1,500 credits |
| 1,000 contacts | 3,000 credits |

For weekly monitoring on a 1,000-contact segment: ~12,000 credits/month. Filter aggressively before running — only monitor segments where job changes are actionable (champions, customers, high-priority prospects).

## Action shape

`{"kind":"connector","integrationSlug":"waterfall","actionSlug":"detectJobChange","config":{}}`. **No `connectorUuid` in `config`.**

Per-record inputs (any combination):
- `professional_email` — work email.
- `personal_email` — alternative.
- `company_domain` — improves matching accuracy.
- `company_linkedin` — LinkedIn company URL.
- `contact_linkedin` — **highest-coverage identifier when combined with `company_domain`**.

Pass as many as you have. More identifiers = better coverage.

## Output retrieval

For batch runs, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>` to retrieve results. See [`../references/output-retrieval.md`](../references/output-retrieval.md).

## Cargo-unique strength

No other provider in the cargo catalog has a credits-based job-change action. `waterfall.detectJobChange` is unique. This skill is one of the differentiators when comparing cargo's outcome catalog to peer GTM platforms.
