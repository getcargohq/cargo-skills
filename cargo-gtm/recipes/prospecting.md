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
1. SOURCE    → salesNavigator.searchLeads / searchAccounts            (0.2/record)
               free first pass? FullEnrich.searchPeople / searchCompanies (0/record)
2. DEDUPE    → match against the workspace's own Contacts / Companies models
               on linkedin_url / domain (storage SQL or a segment filter)  (free)
3. ENRICH    → LinkedIn URL in hand? aiArk.enrichPerson (0.1) for the profile, when the goal needs one
               aiArk.enrichCompany (0.01) for firmographics
               + waterfall.enrichContact / enrichCompany              (1–2/record)
               + apolloio.enrichPerson / enrichOrganization on the residue (1/record)
4. SIGNAL    → enrichCrm.getFunding                                   (1/record)
               + theirStack.searchJobs                                (0.5/job returned)
5. CONTACT   → Find email tool {"kind":"tool","templateSlug":"email_waterfall"}
               on every row: linkedinUrl, or firstName + lastName + companyDomain (1.1–4/hit)
6. VERIFY    → none for Find email's output (verified before it returns);
               Verify email tool (email_validator) only for emails brought in (0.2/record)
7. WRITEBACK → segment write / CRM upsert / CSV export                (free)
```

Adapt by phase: drop steps that aren't relevant. Pure sourcing → step 1 only. "Enrich list I already have" → steps 2–6.

**Step 5 is the native Find email tool by default**, not a single provider and not the email a step 3 profile call happens to return. It is Cargo's maintained waterfall with verification built in, and it covers far more than any one provider. Hand-build a provider ladder only when the user names a provider, explicitly asks for the cheapest path, or the tool is missing from the workspace, and say which: [`../SKILL.md`](../SKILL.md#contact-data-cargos-native-tools-first-mandatory-default).

**QA gates (free, local — [`../references/contact-accuracy.md`](../references/contact-accuracy.md)):** run `scripts/validate-emails.ts` on any imported emails *before* paying for step 6 (culls invalid/disposable/duplicate emails from the verify batch), and `scripts/contact-accuracy-audit.ts` on the merged output *before* step 7 — only `audit_action: SEND` rows go to write-back; report the audit counts in the receipt.

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
# execute-batch --wait-until-finished prints the batch object, not rows. Rows
# come from batch download: a signed CSV of each input record's columns plus
# every output key as cargo_<key> (nested objects as dotted columns). A record
# whose run returned nothing keeps its input columns only.
batch_rows() {
  curl -fsSL "$(cargo-ai orchestration batch download --uuid "$1" | jq -r .url)" \
    | python3 -c 'import csv,json,sys; json.dump(list(csv.DictReader(sys.stdin)), sys.stdout)'
}

# Step 1 — SOURCE: cheapest at-scale lead search. Codes are LinkedIn's, as
# strings: industryCodes "43" = Financial Services, geoCodes "103644278" =
# United States (the geo list is country-level, so narrow to NYC on the
# returned `location`). A direct run's output is at .runContext.action.
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads"}' \
  --data '{
    "keywords": "CTO",
    "personal": {"industryCodes": ["43"], "geoCodes": ["103644278"]},
    "limit": 10
  }' \
  --wait-until-finished | jq '.runContext.action // []' > /tmp/p1-leads.json

# Step 2 — DEDUPE: drop leads the workspace already holds (free, no paid action)
cargo-ai storage query execute \
  "SELECT linkedin_url FROM default.contacts WHERE linkedin_url IS NOT NULL" \
  > /tmp/p1-known.json

jq -c --slurpfile known /tmp/p1-known.json \
  '[.[] | select(.linkedin_profile_url as $u
      | ($known[0].rows // [] | map(.linkedin_url)) | index($u) | not)]' \
  /tmp/p1-leads.json > /tmp/p1-new.json

# Step 3 — ENRICH (firmographics on each contact's company). searchLeads
# returns no domain, only the company's LinkedIn id
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichCompany"}' \
  --records "$(jq -c '[.[] | select(.sales_navigator_company_id) | {linkedinUrl: ("https://www.linkedin.com/company/" + .sales_navigator_company_id)}] | unique' /tmp/p1-new.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/p1-firmo.json

# Step 5 — CONTACT: the native Find email tool on every lead. searchLeads
# returns a LinkedIn URL, which is all the tool needs. Name columns ride
# along in each record so they come back in the CSV.
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","templateSlug":"email_waterfall"}' \
  --records "$(jq -c '[.[] | {linkedinUrl: .linkedin_profile_url, first_name, last_name, company_name}]' /tmp/p1-new.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/p1-emails.json

# Step 6 — no paid verify: Find email returns only addresses that passed
# zeroBounce as valid, so a non-empty cargo_email is already verified.
# Step 7 — Coalesce + summary: one row per lead, keyed on the LinkedIn URL
jq '[.[] | {first_name, last_name, company_name, linkedinUrl,
            email: (.cargo_email // ""),
            email_status: (if (.cargo_email // "") != "" then "valid" else "" end)}]' \
  /tmp/p1-emails.json
```

**Credit budget**: ~10 leads × (0.2 + 0 + 0.01 + 1.1 to 4) = ~14 to 43 credits. Find email bills 1.1 when its first provider settles the address and more when it has to walk further; a row nobody covers costs close to nothing. Quote the sample's receipt, not this range.

**Exception, the user asked for the cheapest path:** run `aiArk.enrichPerson` (0.1) on the LinkedIn URLs first, then Find email or `FullEnrich.findEmail` (1) only on the rows it left without an email, then verify the single-provider emails with the Verify email tool. Say that this trades coverage for credits.

---

## P2 — Full GTM run (50–500 prospects)

**Use when**: the user wants a real prospecting list with enrichment, verified emails, and segment write-back. Switches from inline-wait to async + polling.

**User**: *"Build me a list of 200 Heads of RevOps at SaaS companies hiring data engineers, get their verified emails."*

### Step 1 — Source companies via tech-intent (theirStack jobs)

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchJobs"}' \
  --data '{
    "fields": {"job_title_or": ["Data Engineer"], "posted_at_max_age_days": 60},
    "companyFields": {"industry_id_or": ["4"], "min_employee_count": 50, "max_employee_count": 500},
    "limit": 100
  }' \
  --wait-until-finished | jq '.runContext.action // []' > /tmp/p2-companies.json
```

`industry_id_or` takes theirStack industry ids as strings (`"4"` is Software Development). Billed 0.5 per job returned. Each job carries its company in `company_object` (`domain`, `linkedin_id`).

### Step 2 — Dedup + enrich firmographics on the source companies

```bash
# Dedupe is a free storage read — companies the workspace already holds don't
# need re-enriching
cargo-ai storage query execute \
  "SELECT domain FROM default.companies" > /tmp/p2-known.json

jq -c --slurpfile known /tmp/p2-known.json \
  '[.[].company_object | select(.domain as $d
      | ($known[0].rows // [] | map(.domain)) | index($d) | not)] | unique_by(.domain)' \
  /tmp/p2-companies.json > /tmp/p2-new-companies.json

# batch_rows: the helper defined in P1 (batch download CSV -> JSON)
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichCompany"}' \
  --records "$(jq -c '[.[] | {domain}]' /tmp/p2-new-companies.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/p2-firmo.json
```

### Step 3 — Find Heads of RevOps at each company (fan-out searchLeads per company)

```bash
# `domain` rides along so it comes back as a CSV column; the search output is
# an array, so it lands in one `cargo` column as JSON
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads"}' \
  --records "$(jq -c '[.[] | select(.linkedin_id) | {domain, keywords: "Head of RevOps", company: {currentCompanyIds: [.linkedin_id]}, limit: 3}]' /tmp/p2-new-companies.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" \
  | jq '[.[] | .domain as $d | (.cargo // "" | if . == "" then [] else fromjson end)[] | . + {domain: $d}]' \
  > /tmp/p2-leads.json
```

### Step 4 — Find emails with the native Find email tool

```bash
# Every lead carries a LinkedIn URL from searchLeads, so the tool runs on
# linkedinUrl alone; domain and names ride along for the CSV.
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","templateSlug":"email_waterfall"}' \
  --records "$(jq -c '[.[] | {linkedinUrl: .linkedin_profile_url, first_name, last_name, domain}]' /tmp/p2-leads.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
curl -fsSL "$(cargo-ai orchestration batch download --uuid "$B" | jq -r .url)" > /tmp/p2-emails.csv
```

The tool walks several providers and returns `email` (column `cargo_email`) only when the address passed zeroBounce as valid; a miss is an empty cell and costs close to nothing. Sample 10 to 20 rows first and quote that receipt before running the 200.

### Step 5 — Free cull (no paid verify)

```bash
# FREE pre-cull — stamps every row with email_risk/recommendation (role,
# disposable, duplicate). QA scripts: ../references/contact-accuracy.md;
# Node >= 22.18; reads the batch download CSV directly.
node <skill-dir>/scripts/validate-emails.ts --input /tmp/p2-emails.csv \
  --email-column cargo_email --json > /tmp/p2-culled.json
```

No step 6: the tool already verified every address it returned. A paid verify on top would bill 0.2 a row to learn nothing.

### Step 6.5 — Audit before handoff (free)

Stamp the verification the tool implies onto each row (an address present is `valid`, an empty cell has none), keep every row so the audit counts are honest, then audit:

```bash
jq -c 'map(. + {email: .cargo_email}
           | . + {emailStatus: (if (.email // "") != "" then "valid" else "" end)})' \
  /tmp/p2-culled.json > /tmp/p2-merged.json

# Audit: SEND / VERIFY / REVIEW / REMOVE per row; summary counts go in the receipt
node <skill-dir>/scripts/contact-accuracy-audit.ts --input /tmp/p2-merged.json --json > /tmp/p2-final.json

# Only SEND rows proceed to Step 7
jq '[.[] | select(.audit_action == "SEND")]' /tmp/p2-final.json > /tmp/p2-send.json
```

### Step 7 — Write back to a segment

If a Contacts model exists, upsert via `cargo-ai storage` patterns — see [`../../cargo-storage/SKILL.md`](../../cargo-storage/SKILL.md). For CRM push, defer to a future CRM-sync recipe.

**Credit budget** (200 leads, ~95 unique companies):
- theirStack searchJobs × 100 jobs: 50
- dedupe against the Companies model: 0
- aiArk.enrichCompany × 95: ~1
- salesNavigator.searchLeads × 95: ~57 (≈ 0.2 × 3 × 95)
- Find email tool × 200: ~220 to 800 (1.1 per address the first provider settles, up to 4 when it walks further, ~0 per miss)
- **Total: ~330 to 910 credits for 200 prospects with verified emails.** The sample's receipt sets the real figure; quote that, not this range.

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

# 3. The native Find email tool on every row missing an email. It takes a
#    LinkedIn URL, or first name + last name + company domain; pass whichever
#    the row has (camelCase keys, or the input is dropped).
#    batch_rows: the helper defined in P1 (batch download CSV -> JSON)
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","templateSlug":"email_waterfall"}' \
  --records "$(jq -c '[.[] | if (.linkedin // "") != "" then {linkedinUrl: .linkedin, id}
                         else {firstName, lastName, companyDomain: .domainName, id} end]' /tmp/p3-missing-email.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/p3-found.json   # address in cargo_email, already verified

# 4. Rows still empty are rows no provider in the waterfall covers. Leave them
#    empty: walking single providers behind the tool mostly re-asks the same sources.
jq '[.[] | select((.cargo_email // "") == "")] | length' /tmp/p3-found.json
```

**Credit budget** (200 contacts missing email): Find email × 200, 1.1 to 4 per address found and ~0 per miss, so roughly 200 to 700 credits depending on how far the waterfall walks. Run 20 first and quote that receipt. No verify step: every returned address already passed zeroBounce.

**Exception, the user asked for the cheapest path or named providers:** run `aiArk.enrichPerson` (0.1) on rows with a LinkedIn URL, `FullEnrich.findEmail` (1) on the residue, `peopleDataLabs.enrichPerson` (3) last, then verify every single-provider address with the Verify email tool (`email_validator`, 0.2; read `cargo_status` and `cargo_is_safe`). Say which exception you are acting on.

---

## Output retrieval

After an ad-hoc `execute-batch` finishes, retrieve the rows with **`cargo-ai orchestration batch download --uuid <batch-uuid>`**: it returns `{"url": ...}`, a signed CSV of the input columns plus the output as `cargo_<key>` columns (the `batch_rows` helper in P1). `run download-outputs` needs a `--workflow-uuid`, which an ad-hoc batch does not have; it is the path for saved tools and plays. See [`../references/output-retrieval.md`](../references/output-retrieval.md).

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
