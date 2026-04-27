# Recipe — Prospecting (find → enrich → verify → sync)

**Use when**: the user states an end-to-end sourcing goal — find people matching a description, enrich them, verify emails, and prepare them for outreach. Cargo's flagship pipeline.

**Trigger phrases**:
- *"Find me 5 fintech CTOs in NYC and verify their emails."*
- *"Build me a list of seed-stage SaaS founders in the US."*
- *"Source 200 RevOps leaders at companies hiring data engineers."*
- *"Enrich these 100 domains and find a contact at each."*

For sourcing-only / TAM list builds, see [`build-tam.md`](build-tam.md). For investor-portfolio outbound, see [`portfolio-prospecting.md`](portfolio-prospecting.md). For the writing-outreach phase that follows this recipe, see [`../guides/writing-outreach.md`](../guides/writing-outreach.md).

## Pipeline spine

```
1. SOURCE    → salesNavigator.searchLeads / searchAccounts            (0.02–0.05/record)
2. DEDUPE    → cargo.matchProspect / cargo.matchBusiness              (0.5/record)
3. ENRICH    → cargo.enrichProspectDetails + …Firmographics
               + waterfall.enrichContact / enrichCompany              (0.5–2/record)
4. SIGNAL    → cargo.enrichBusinessFundingAndAcquisitions
               + theirStack.searchJobs                                (0.5/record)
5. CONTACT   → FullEnrich.findEmail (fallback peopleDataLabs)         (1–3/record)
6. VERIFY    → waterfall.verifyEmail                                  (0.1/record)
7. WRITEBACK → segment write / CRM upsert / CSV export                (free)
```

Adapt by phase: drop steps that aren't relevant. Pure sourcing → step 1 only. "Enrich list I already have" → steps 2–6.

## Discovery sequence (run before any pipeline)

```bash
# 1. Confirm authentication
cargo-ai whoami

# 2. Confirm priority providers are connected
for slug in salesNavigator FullEnrich waterfall theirStack cargo peopleDataLabs; do
  cargo-ai connection connector list --integration-slug "$slug" \
    | jq -e '.connectors | length > 0' > /dev/null \
    && echo "✓ $slug" \
    || echo "✗ $slug (NOT CONNECTED — recipe will fall back)"
done

# 3. Find the target model (Companies / Contacts) for write-back
cargo-ai storage model list

# 4. (optional) Find an existing segment to enrich, instead of fresh sourcing
cargo-ai segmentation segment list
```

---

## P1 — Mini-pipeline (10 prospects, end-to-end)

**Use when**: validating the full pipeline on a small sample, or when the user only needs ~10 prospects.

**User**: *"Find me 10 fintech CTOs in NYC, enrich, verify their emails."*

```bash
# Step 1 — SOURCE: cheapest at-scale lead search
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads","config":{}}' \
  --data '{
    "keywords": "CTO",
    "company": {"industries": [43]},
    "personal": {"locations": ["New York City Metropolitan Area"]},
    "limit": 10
  }' \
  --wait-until-finished > /tmp/p1-leads.json

# Step 2 — DEDUPE: resolve each lead to a cargo prospect_id
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchProspect","config":{}}' \
  --records "$(jq -c '[.results[] | {full_name, company_name, linkedin: .linkedinUrl}]' /tmp/p1-leads.json)" \
  --wait-until-finished > /tmp/p1-matched.json

# Step 3a — ENRICH (prospect details)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichProspectDetails","config":{}}' \
  --records "$(jq -c '[.results[] | select(.prospect_id) | {prospect_id}]' /tmp/p1-matched.json)" \
  --wait-until-finished > /tmp/p1-prospect-enriched.json

# Step 3b — ENRICH (firmographics on each contact's company)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchBusiness","config":{}}' \
  --records "$(jq -c '[.results[] | {domain: .companyDomain}]' /tmp/p1-leads.json)" \
  --wait-until-finished > /tmp/p1-business-matched.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichBusinessFirmographics","config":{}}' \
  --records "$(jq -c '[.results[] | select(.business_id) | {business_id}]' /tmp/p1-business-matched.json)" \
  --wait-until-finished > /tmp/p1-firmo.json

# Step 5 — CONTACT: find email for each prospect
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findEmail","config":{}}' \
  --records "$(jq -c '[.results[] | {firstName: .firstName, lastName: .lastName, domainName: .companyDomain}]' /tmp/p1-leads.json)" \
  --wait-until-finished > /tmp/p1-emails.json

# Step 6 — VERIFY each found email
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"verifyEmail","config":{}}' \
  --records "$(jq -c '[.results[] | select(.email) | {email}]' /tmp/p1-emails.json)" \
  --wait-until-finished > /tmp/p1-verified.json

# Step 7 — Coalesce + summary
jq -s '[.[0].results, .[1].results, .[2].results, .[3].results]
       | flatten
       | group_by(.input.full_name // .input.firstName)
       | map(reduce .[] as $r ({}; . * $r))' \
  /tmp/p1-leads.json /tmp/p1-prospect-enriched.json /tmp/p1-emails.json /tmp/p1-verified.json
```

**Credit budget**: ~10 leads × (0.02 + 0.5 + 2 + 0.5 + 1 + 0.1) = ~41 credits.

---

## P2 — Full GTM run (50–500 prospects)

**Use when**: the user wants a real prospecting list with enrichment, verified emails, and segment write-back. Switches from inline-wait to async + polling.

**User**: *"Build me a list of 200 Heads of RevOps at SaaS companies hiring data engineers, get their verified emails."*

### Step 1 — Source companies via tech-intent (theirStack jobs)

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchJobs","config":{}}' \
  --data '{
    "fields": {"job_titles": ["Data Engineer"], "posted_at_max_age_days": 60},
    "companyFields": {"industries": ["software", "saas"], "employeeCounts": ["50-200","200-500"]},
    "limit": 100
  }' \
  --wait-until-finished > /tmp/p2-companies.json
```

### Step 2 — Dedup + enrich firmographics on the source companies

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchBusiness","config":{}}' \
  --records "$(jq -c '[.results[].company | {domain}]' /tmp/p2-companies.json)" \
  --wait-until-finished > /tmp/p2-business-matched.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichBusinessFirmographics","config":{}}' \
  --records "$(jq -c '[.results[] | select(.business_id) | {business_id}]' /tmp/p2-business-matched.json)" \
  --wait-until-finished > /tmp/p2-firmo.json
```

### Step 3 — Find Heads of RevOps at each company (fan-out searchLeads per company)

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads","config":{}}' \
  --records "$(jq -c '[.results[].company | {keywords: "Head of RevOps", company: {linkedinIds: [.linkedinId]}, limit: 3}]' /tmp/p2-companies.json)" \
  --wait-until-finished > /tmp/p2-leads.json
```

### Step 4 — Match each lead, enrich prospect details

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchProspect","config":{}}' \
  --records "$(jq -c '[.results[].leads[] | {full_name, company_name, linkedin: .linkedinUrl}]' /tmp/p2-leads.json)" \
  --wait-until-finished > /tmp/p2-prospect-matched.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichProspectDetails","config":{}}' \
  --records "$(jq -c '[.results[] | select(.prospect_id) | {prospect_id}]' /tmp/p2-prospect-matched.json)" \
  --wait-until-finished > /tmp/p2-prospect-enriched.json
```

### Step 5 — Find emails (FullEnrich)

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findEmail","config":{}}' \
  --records "$(jq -c '[.results[].leads[] | {firstName, lastName, domainName: .companyDomain}]' /tmp/p2-leads.json)" \
  --wait-until-finished > /tmp/p2-emails.json
```

### Step 6 — Verify emails (waterfall)

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"verifyEmail","config":{}}' \
  --records "$(jq -c '[.results[] | select(.email) | {email}]' /tmp/p2-emails.json)" \
  --wait-until-finished > /tmp/p2-verified.json
```

### Step 7 — Write back to a segment

If a Contacts model exists, upsert via `cargo-ai storage` patterns — see [`../../cargo-storage/SKILL.md`](../../cargo-storage/SKILL.md). For CRM push, defer to a future CRM-sync recipe.

**Credit budget** (200 leads, ~95 unique companies):
- theirStack searchJobs: 0.5
- cargo.matchBusiness × 95: 47.5
- cargo.enrichBusinessFirmographics × 95: 47.5
- salesNavigator.searchLeads × 95: ~5.7 (≈ 0.02 × 3 × 95)
- cargo.matchProspect × 200: 100
- cargo.enrichProspectDetails × 200: 400
- FullEnrich.findEmail × 200: 200
- waterfall.verifyEmail × 200: 20
- **Total: ~821 credits for 200 fully-enriched + verified prospects** (~4 cred/prospect).

---

## P3 — Backfill mode (existing segment)

**Use when**: the user already has a list of contacts in a segment / model and wants to fill missing emails/phones/firmographics. No new sourcing.

**User**: *"Enrich the leads in our 'New Inbound' segment — fill missing emails."*

```bash
# 1. Discover the model + fetch the segment
cargo-ai storage model list  # find the Contacts model UUID
MODEL_UUID=...

cargo-ai segmentation segment fetch \
  --model-uuid "$MODEL_UUID" \
  --filter '{"conjonction":"and","groups":[{"conjonction":"and","conditions":[
    {"kind":"string","columnSlug":"lifecycle_stage","operator":"is","values":["new_inbound"]}
  ]}]}' > /tmp/p3-segment.json

# 2. Filter to rows MISSING email
jq -c '[.records[] | select(.email == null or .email == "")]' /tmp/p3-segment.json > /tmp/p3-missing-email.json

# 3. Try cargo first (cheapest; works on already-known prospects)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchProspect","config":{}}' \
  --records "$(jq -c '[.[] | {full_name, company_name, linkedin}]' /tmp/p3-missing-email.json)" \
  --wait-until-finished > /tmp/p3-cargo-matched.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichProspectDetails","config":{}}' \
  --records "$(jq -c '[.results[] | select(.prospect_id) | {prospect_id}]' /tmp/p3-cargo-matched.json)" \
  --wait-until-finished > /tmp/p3-cargo-enriched.json

# 4. For rows still missing email after cargo, escalate to FullEnrich
jq -s '[.[0][], .[1].results[]] | group_by(.full_name) | map(reduce .[] as $r ({}; . * $r)) | map(select(.email == null or .email == ""))' \
  /tmp/p3-missing-email.json /tmp/p3-cargo-enriched.json > /tmp/p3-still-missing.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findEmail","config":{}}' \
  --records "$(jq -c '[.[] | {firstName, lastName, domainName}]' /tmp/p3-still-missing.json)" \
  --wait-until-finished > /tmp/p3-fullenrich.json

# 5. For rows still missing after FullEnrich, escalate to peopleDataLabs (heavyweight)
jq -s '[.[0][], .[1].results[]] | group_by(.firstName + .lastName) | map(reduce .[] as $r ({}; . * $r)) | map(select(.email == null or .email == ""))' \
  /tmp/p3-still-missing.json /tmp/p3-fullenrich.json > /tmp/p3-final-missing.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"enrichPerson","config":{}}' \
  --records "$(jq -c '[.[] | {parameters: {first_name: .firstName, last_name: .lastName, company: .companyName}}]' /tmp/p3-final-missing.json)" \
  --wait-until-finished > /tmp/p3-pdl.json

# 6. Verify all newly-found emails
jq -s '[.[].results[] | select(.email)] | unique_by(.email)' /tmp/p3-fullenrich.json /tmp/p3-pdl.json > /tmp/p3-emails-to-verify.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"verifyEmail","config":{}}' \
  --records "$(jq -c '[.[] | {email}]' /tmp/p3-emails-to-verify.json)" \
  --wait-until-finished > /tmp/p3-verified.json
```

**Credit budget** (200 contacts missing email; assumes 60% hit on cargo, 25% on FullEnrich, 10% on PDL, 5% unresolvable):
- cargo.matchProspect × 200: 100
- cargo.enrichProspectDetails × 200: 400
- FullEnrich.findEmail × 80: 80
- peopleDataLabs.enrichPerson × 30: 90
- waterfall.verifyEmail × 190: 19
- **Total: ~689 credits for 190 verified emails** (~3.6 cred/email).

The waterfall pattern saves ~50% vs running peopleDataLabs on everyone (which would be 600 credits just for enrich).

---

## Output retrieval

After any batch finishes, retrieve enriched data with **`cargo-ai orchestration run download-outputs`** (not `run download`). See [`../references/output-retrieval.md`](../references/output-retrieval.md).

## Polling

Recipes use `--wait-until-finished` for runs ≤ 50 records. For larger runs, switch to async + polling per [`../../cargo-orchestration/references/polling.md`](../../cargo-orchestration/references/polling.md).

## Credits accounting

After every recipe run, surface the cost:

```bash
cargo-ai billing usage get-metrics \
  --from <run-date> --to <today> \
  --group-by integration_slug
```

## Alternatives

When the priority stack misses the user's criteria, see [`../references/alternatives.md`](../references/alternatives.md) for non-priority provider chains.

## Action shape rules

`{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`** — see [`../../cargo-orchestration/references/actions.md`](../../cargo-orchestration/references/actions.md). Cross-node interpolation: `{{nodes.<slug>.<field>}}`.

## When stuck — file a workspace report

See [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md) (Reports section).
