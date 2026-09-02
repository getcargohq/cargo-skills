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
2. DEDUPE    → match against the workspace's own Contacts / Companies models
               on linkedin_url / domain (storage SQL or a segment filter)  (free)
3. ENRICH    → LinkedIn URL in hand? aiArk.enrichPerson (0.1) FIRST — profile + verified email
               aiArk.enrichCompany (0.01) for firmographics
               + waterfall.enrichContact / enrichCompany              (1–2/record)
               + apolloio.enrichPerson / enrichOrganization on the residue (1/record)
4. SIGNAL    → enrichCrm.getFunding                                   (1/record)
               + theirStack.searchJobs                                (0.5/record)
5. CONTACT   → FullEnrich.findEmail on rows step 3 left without an email
               (fallback peopleDataLabs)                              (1–3/record)
6. VERIFY    → waterfall.verifyEmail                                  (0.1/record)
7. WRITEBACK → segment write / CRM upsert / CSV export                (free)
```

Adapt by phase: drop steps that aren't relevant. Pure sourcing → step 1 only. "Enrich list I already have" → steps 2–6.

**QA gates (free, local — [`../references/contact-accuracy.md`](../references/contact-accuracy.md)):** run `scripts/validate-emails.ts` on the step-5 output *before* paying for step 6 (culls invalid/disposable/duplicate emails from the verify batch), and `scripts/contact-accuracy-audit.ts` on the merged output *before* step 7 — only `audit_action: SEND` rows go to write-back; report the audit counts in the receipt.

## Discovery sequence (run before any pipeline)

```bash
# 1. Confirm authentication
cargo-ai whoami

# 2. Confirm priority providers are connected
for slug in salesNavigator FullEnrich waterfall theirStack enrichCrm peopleDataLabs; do
  cargo-ai connection connector list --integration-slug "$slug" \
    | jq -e '.connectors | length > 0' > /dev/null \
    && echo "✓ $slug" \
    || echo "✗ $slug (NOT CONNECTED — recipe will fall back)"
done
# aiArk and apolloio (the other two priority providers) are deliberately not in
# this loop: their credits-based actions run on cargo's managed connection, so an
# empty `connector list` doesn't mean unavailable. apolloio's other nine actions
# (searches, contact CRUD, sequences) DO need your own Apollo API key connector.

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
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads"}' \
  --data '{
    "keywords": "CTO",
    "company": {"industries": [43]},
    "personal": {"locations": ["New York City Metropolitan Area"]},
    "limit": 10
  }' \
  --wait-until-finished > /tmp/p1-leads.json

# Step 2 — DEDUPE: drop leads the workspace already holds (free, no paid action)
cargo-ai storage query execute \
  "SELECT linkedin_url FROM default.contacts WHERE linkedin_url IS NOT NULL" \
  > /tmp/p1-known.json

jq -c --slurpfile known /tmp/p1-known.json \
  '[.results[] | select(.linkedinUrl as $u
      | ($known[0].rows // [] | map(.linkedin_url)) | index($u) | not)]' \
  /tmp/p1-leads.json > /tmp/p1-new.json

# Step 3a — ENRICH (person): searchLeads returns a LinkedIn URL, so this is the
# cheapest rung — full profile plus a verified email, billing 0 on no-email
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichPerson"}' \
  --records "$(jq -c '[.[] | {linkedinUrl}]' /tmp/p1-new.json)" \
  --wait-until-finished > /tmp/p1-prospect-enriched.json

# Step 3b — ENRICH (firmographics on each contact's company)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichCompany"}' \
  --records "$(jq -c '[.[] | {domain: .companyDomain}]' /tmp/p1-new.json)" \
  --wait-until-finished > /tmp/p1-firmo.json

# Step 5 — CONTACT: find email ONLY for the rows step 3a left without one
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findEmail"}' \
  --records "$(jq -c '[.results[] | select((.email // "") == "")
                       | {firstName, lastName, domainName: .companyDomain}]' /tmp/p1-prospect-enriched.json)" \
  --wait-until-finished > /tmp/p1-emails.json

# Step 6 — VERIFY each found email
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"verifyEmail"}' \
  --records "$(jq -c '[.results[] | select(.email) | {email}]' /tmp/p1-emails.json)" \
  --wait-until-finished > /tmp/p1-verified.json

# Step 7 — Coalesce + summary
jq -s '[.[0].results, .[1].results, .[2].results, .[3].results]
       | flatten
       | group_by(.input.full_name // .input.firstName)
       | map(reduce .[] as $r ({}; . * $r))' \
  /tmp/p1-leads.json /tmp/p1-prospect-enriched.json /tmp/p1-emails.json /tmp/p1-verified.json
```

**Credit budget**: ~10 leads × (0.02 + 0 + 0.1 + 0.01 + 1 + 0.1) = ~12 credits. Step 5 (`FullEnrich.findEmail`, 1/record) only runs on the rows step 3a left without an email — `aiArk.enrichPerson` usually returns one, so the real figure lands under this.

---

## P2 — Full GTM run (50–500 prospects)

**Use when**: the user wants a real prospecting list with enrichment, verified emails, and segment write-back. Switches from inline-wait to async + polling.

**User**: *"Build me a list of 200 Heads of RevOps at SaaS companies hiring data engineers, get their verified emails."*

### Step 1 — Source companies via tech-intent (theirStack jobs)

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchJobs"}' \
  --data '{
    "fields": {"job_titles": ["Data Engineer"], "posted_at_max_age_days": 60},
    "companyFields": {"industries": ["software", "saas"], "employeeCounts": ["50-200","200-500"]},
    "limit": 100
  }' \
  --wait-until-finished > /tmp/p2-companies.json
```

### Step 2 — Dedup + enrich firmographics on the source companies

```bash
# Dedupe is a free storage read — companies the workspace already holds don't
# need re-enriching
cargo-ai storage query execute \
  "SELECT domain FROM default.companies" > /tmp/p2-known.json

jq -c --slurpfile known /tmp/p2-known.json \
  '[.results[].company | select(.domain as $d
      | ($known[0].rows // [] | map(.domain)) | index($d) | not)]' \
  /tmp/p2-companies.json > /tmp/p2-new-companies.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichCompany"}' \
  --records "$(jq -c '[.[] | {domain}]' /tmp/p2-new-companies.json)" \
  --wait-until-finished > /tmp/p2-firmo.json
```

### Step 3 — Find Heads of RevOps at each company (fan-out searchLeads per company)

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads"}' \
  --records "$(jq -c '[.results[].company | {keywords: "Head of RevOps", company: {linkedinIds: [.linkedinId]}, limit: 3}]' /tmp/p2-companies.json)" \
  --wait-until-finished > /tmp/p2-leads.json
```

### Step 4 — Enrich each lead from its LinkedIn URL

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichPerson"}' \
  --records "$(jq -c '[.results[].leads[] | {linkedinUrl}]' /tmp/p2-leads.json)" \
  --wait-until-finished > /tmp/p2-prospect-enriched.json
```

`enrichPerson` returns the verified email alongside the profile and bills 0 when
it finds none, so step 5 below only pays for the residue it left empty.

### Step 5 — Find emails (FullEnrich)

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findEmail"}' \
  --records "$(jq -c '[.results[].leads[] | {firstName, lastName, domainName: .companyDomain}]' /tmp/p2-leads.json)" \
  --wait-until-finished > /tmp/p2-emails.json
```

### Step 6 — Verify emails (free cull, then waterfall)

```bash
# 6a. FREE pre-cull — stamp every row with email_risk/recommendation
#     (QA scripts: ../references/contact-accuracy.md; Node >= 22.18;
#     execute-batch output is accepted directly — no unwrapping needed)
node <skill-dir>/scripts/validate-emails.ts --input /tmp/p2-emails.json --json > /tmp/p2-culled.json

# 6b. Paid verification on the SURVIVORS ONLY — the cull is what saves the
#     credits, so the verify batch must be built from its output, never from
#     the original list
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"verifyEmail"}' \
  --records "$(jq -c '[.[] | select(.recommendation != "skip") | {email}]' /tmp/p2-culled.json)" \
  --wait-until-finished > /tmp/p2-verified.json
```

### Step 6.5 — Merge, then audit before handoff (free)

Join the verification statuses back onto the culled rows (the audit must see **every** row with its real status — never pre-filter to `valid` first, or the VERIFY/REMOVE verdicts and their counts are lost), then stamp each row:

```bash
# Merge: attach each row's verification status by email — join on the
# LOWERCASED address (verify results may re-case it; a missed join leaves
# emailStatus empty and the row degrades to VERIFY). Read .email_status
# (waterfall.verifyEmail output schema) — not .status.
jq -c --slurpfile ver /tmp/p2-verified.json '
  ($ver[0].results | map({key: (.email | ascii_downcase), value: .email_status}) | from_entries) as $st
  | map(. + {emailStatus: ($st[(.email // "" | ascii_downcase)] // "")})
' /tmp/p2-culled.json > /tmp/p2-merged.json

# Audit: SEND / VERIFY / REVIEW / REMOVE per row; summary counts go in the receipt
node <skill-dir>/scripts/contact-accuracy-audit.ts --input /tmp/p2-merged.json --json > /tmp/p2-final.json

# Only SEND rows proceed to Step 7
jq '[.[] | select(.audit_action == "SEND")]' /tmp/p2-final.json > /tmp/p2-send.json
```

### Step 7 — Write back to a segment

If a Contacts model exists, upsert via `cargo-ai storage` patterns — see [`../../cargo-storage/SKILL.md`](../../cargo-storage/SKILL.md). For CRM push, defer to a future CRM-sync recipe.

**Credit budget** (200 leads, ~95 unique companies):
- theirStack searchJobs: 0.5
- dedupe against the Companies model: 0
- aiArk.enrichCompany × 95: ~1
- salesNavigator.searchLeads × 95: ~5.7 (≈ 0.02 × 3 × 95)
- aiArk.enrichPerson × 200: 20
- FullEnrich.findEmail × 60 (the rows aiArk left without an email): 60
- waterfall.verifyEmail × 200: 20
- **Total: ~107 credits for 200 fully-enriched + verified prospects** (~0.5 cred/prospect).

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

# 3. Try aiArk first on the rows that carry a LinkedIn URL (0.1, bills 0 on no-email)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichPerson"}' \
  --records "$(jq -c '[.[] | select(.linkedin) | {linkedinUrl: .linkedin}]' /tmp/p3-missing-email.json)" \
  --wait-until-finished > /tmp/p3-aiark-enriched.json

# 4. For rows still missing email, escalate to FullEnrich
jq -s '[.[0][], .[1].results[]] | group_by(.full_name) | map(reduce .[] as $r ({}; . * $r)) | map(select(.email == null or .email == ""))' \
  /tmp/p3-missing-email.json /tmp/p3-aiark-enriched.json > /tmp/p3-still-missing.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"findEmail"}' \
  --records "$(jq -c '[.[] | {firstName, lastName, domainName}]' /tmp/p3-still-missing.json)" \
  --wait-until-finished > /tmp/p3-fullenrich.json

# 5. For rows still missing after FullEnrich, escalate to peopleDataLabs (heavyweight)
jq -s '[.[0][], .[1].results[]] | group_by(.firstName + .lastName) | map(reduce .[] as $r ({}; . * $r)) | map(select(.email == null or .email == ""))' \
  /tmp/p3-still-missing.json /tmp/p3-fullenrich.json > /tmp/p3-final-missing.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"enrichPerson"}' \
  --records "$(jq -c '[.[] | {parameters: {first_name: .firstName, last_name: .lastName, company: .companyName}}]' /tmp/p3-final-missing.json)" \
  --wait-until-finished > /tmp/p3-pdl.json

# 6. Verify all newly-found emails
jq -s '[.[].results[] | select(.email)] | unique_by(.email)' /tmp/p3-fullenrich.json /tmp/p3-pdl.json > /tmp/p3-emails-to-verify.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"verifyEmail"}' \
  --records "$(jq -c '[.[] | {email}]' /tmp/p3-emails-to-verify.json)" \
  --wait-until-finished > /tmp/p3-verified.json
```

**Credit budget** (200 contacts missing email; assumes 60% hit on aiArk, 25% on FullEnrich, 10% on PDL, 5% unresolvable):
- aiArk.enrichPerson × 200: 20 (and 0 on the 40% that return no email)
- FullEnrich.findEmail × 80: 80
- peopleDataLabs.enrichPerson × 30: 90
- waterfall.verifyEmail × 190: 19
- **Total: ~209 credits for 190 verified emails** (~1.1 cred/email).

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

`{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>"}`. **No `connectorUuid` in `config`** — see [`../../cargo-orchestration/references/examples/actions.md`](../../cargo-orchestration/references/examples/actions.md). Cross-node interpolation: `{{nodes.<slug>.<field>}}`.

## When stuck — file a workspace report

See [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md) (Reports section).
