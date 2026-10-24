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
3. ENRICH    → LinkedIn URL in hand? aiArk.enrichPerson (0.1) FIRST — profile + verified email
               aiArk.enrichCompany (0.01) for firmographics
               + waterfall.enrichContact / enrichCompany              (1–2/record)
               + apolloio.enrichPerson / enrichOrganization on the residue (1/record)
4. SIGNAL    → enrichCrm.getFunding                                   (1/record)
               + theirStack.searchJobs                                (0.5/job returned)
5. CONTACT   → Find email preset tool on rows step 3 left without an email
               (the waterfall, each hit verified)                     (~1.1 per hit, up to 4)
6. VERIFY    → only addresses the tool did not return: Verify email
               preset tool (0.2) or waterfall.verifyEmail             (0.1/record)
7. WRITEBACK → segment write / CRM upsert / CSV export                (free)
```

Adapt by phase: drop steps that aren't relevant. Pure sourcing → step 1 only. "Enrich list I already have" → steps 2–6.

**QA gates (free, local, [`../references/contact-accuracy.md`](../references/contact-accuracy.md)):** run `scripts/validate-emails.ts` on the step-5 output *before* paying for any step-6 verification (culls invalid/disposable/duplicate emails), and `scripts/contact-accuracy-audit.ts` on the merged output *before* step 7: only `audit_action: SEND` rows go to write-back; report the audit counts in the receipt.

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

# Step 3a — ENRICH (person): searchLeads returns a LinkedIn URL, so this is the
# cheapest rung — full profile plus a verified email, billing 0 on no-email.
# Name columns ride along in each record so they come back in the CSV.
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichPerson"}' \
  --records "$(jq -c '[.[] | {linkedinUrl: .linkedin_profile_url, first_name, last_name, company_name}]' /tmp/p1-new.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/p1-prospect-enriched.json

# Step 3b — ENRICH (firmographics on each contact's company). searchLeads
# returns no domain, only the company's LinkedIn id
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichCompany"}' \
  --records "$(jq -c '[.[] | select(.sales_navigator_company_id) | {linkedinUrl: ("https://www.linkedin.com/company/" + .sales_navigator_company_id)}] | unique' /tmp/p1-new.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/p1-firmo.json

# Step 5, CONTACT: the workspace's preset Find email tool, ONLY for the rows
# step 3a left without an email (aiArk returns no output on a miss, so every
# cargo_ column is empty). The tool walks five providers and checks each hit
# with zeroBounce before returning it.
TOOL=$(cargo-ai orchestration tool list | jq -r '.tools[] | select(.isReadOnly and .name == "Find email") | .uuid')
B=$(cargo-ai orchestration action execute-batch \
  --action "{\"kind\":\"tool\",\"toolUuid\":\"$TOOL\"}" \
  --records "$(jq -c '[.[] | select([to_entries[] | select(.key | startswith("cargo")) | .value] | all(. == ""))
                       | {firstName: .first_name, lastName: .last_name, linkedinUrl}]' /tmp/p1-prospect-enriched.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/p1-emails.json   # address in cargo_email

# Step 6, no paid VERIFY: aiArk.enrichPerson returns a verified email, and the
# tool only returns addresses zeroBounce graded valid

# Step 7 — Coalesce + summary: one row per lead, keyed on the LinkedIn URL
jq -n --slurpfile fe /tmp/p1-emails.json --slurpfile ai /tmp/p1-prospect-enriched.json '
  ($fe[0] | map({key: .linkedinUrl, value: .cargo_email}) | from_entries) as $em
  | [$ai[0][] | {first_name, last_name, company_name, linkedinUrl,
        found_email: ($em[.linkedinUrl] // "")}]'
```

The tool takes `linkedinUrl` only as a `linkedin.com/in/` profile URL; a row with neither that nor `companyDomain` exits empty without calling a provider. No Find email tool in the workspace? Use `FullEnrich.findEmail` with `companyName` and `linkedinUrl` here, then `waterfall.verifyEmail` on its `cargo_most_probable_email`.

aiArk's own email sits inside its `email` output object (`email.output[0].address`), so in the CSV it is under the `cargo_email.` columns, not a flat `email`.

**Credit budget**: ~10 leads × (0.2 + 0 + 0.1 + 0.01 + 1.1) = ~14 credits. Step 5 (the Find email tool, ~1.1 per hit and roughly 0 on a miss) only runs on the rows step 3a left without an email, and `aiArk.enrichPerson` usually returns one, so the real figure lands under this.

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

### Step 4 — Enrich each lead from its LinkedIn URL

```bash
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichPerson"}' \
  --records "$(jq -c '[.[] | {linkedinUrl: .linkedin_profile_url, first_name, last_name, domain}]' /tmp/p2-leads.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/p2-prospect-enriched.json
```

`enrichPerson` returns the verified email alongside the profile and bills 0 when
it finds none, so step 5 below only pays for the residue it left empty.

### Step 5: Find emails (the preset Find email tool) on the residue only

The workspace's read-only **Find email** tool is the email waterfall, already built: apolloio, FullEnrich, findyMail, peopleDataLabs and waterfall in turn, each hit checked by `zeroBounce` before the chain stops ([`../references/waterfall-strategy.md`](../references/waterfall-strategy.md#start-here-the-workspaces-preset-tools)).

```bash
# ONLY the rows step 4 left without an email (aiArk returns no output on a
# miss, so every cargo_ column is empty). This gate is what keeps step 5 to
# the 60-row residue instead of all 200.
TOOL=$(cargo-ai orchestration tool list | jq -r '.tools[] | select(.isReadOnly and .name == "Find email") | .uuid')
B=$(cargo-ai orchestration action execute-batch \
  --action "{\"kind\":\"tool\",\"toolUuid\":\"$TOOL\"}" \
  --records "$(jq -c '[.[] | select([to_entries[] | select(.key | startswith("cargo")) | .value] | all(. == ""))
                       | {firstName: .first_name, lastName: .last_name, companyDomain: .domain, linkedinUrl}]' /tmp/p2-prospect-enriched.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
curl -fsSL "$(cargo-ai orchestration batch download --uuid "$B" | jq -r .url)" > /tmp/p2-emails.csv
```

The address lands in `cargo_email`; nothing else comes back (no status, no provider). No tool in the workspace, or the user wants a custom provider order? Hand-roll the chain in [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md) and verify its output with `waterfall.verifyEmail`.

### Step 6: Free cull (the tool already verified)

```bash
# FREE pre-cull: stamp every row with email_risk/recommendation
# (QA scripts: ../references/contact-accuracy.md; Node >= 22.18;
# it reads the batch download CSV directly)
node <skill-dir>/scripts/validate-emails.ts --input /tmp/p2-emails.csv \
  --email-column cargo_email --json > /tmp/p2-culled.json
```

No paid verification here: with `returns_catchalls` unset, the Find email tool only returns addresses `zeroBounce` graded `valid`. If you set `returns_catchalls: true`, run the preset **Verify email** tool on the cull's survivors and merge its `cargo_status` instead of the constant below.

### Step 6.5 — Merge, then audit before handoff (free)

Stamp each row's verification status (the audit must see **every** row with its real status, so never pre-filter to `valid` first, or the VERIFY/REMOVE verdicts and their counts are lost), then audit:

```bash
# Merge: a tool-returned address is zeroBounce-valid; an empty one stays empty
# so the audit marks the row no-email.
jq -c 'map(. + {email: .cargo_email}
           | . + {emailStatus: (if (.email // "") != "" then "valid" else "" end)})
' /tmp/p2-culled.json > /tmp/p2-merged.json

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
- aiArk.enrichPerson × 200: 20
- Find email preset tool × 60 (the rows aiArk left without an email): ~66 if every row hits on the first rung, less for misses
- verification: 0 (aiArk and the tool both return verified addresses)
- **Total: ~194 credits for 200 fully-enriched + verified prospects** (~1 cred/prospect).

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
#    batch_rows: the helper defined in P1 (batch download CSV -> JSON)
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichPerson"}' \
  --records "$(jq -c '[.[] | select(.linkedin) | {linkedinUrl: .linkedin}]' /tmp/p3-missing-email.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/p3-aiark-enriched.json

# 4. For rows still missing email, run the workspace's preset Find email tool:
#    the provider waterfall (apolloio, FullEnrich, findyMail, peopleDataLabs,
#    waterfall) with a zeroBounce check on every hit, in one batch. aiArk
#    returns no output on a miss, so a hit is a row with any non-empty cargo_ column
jq -s '([.[1][] | select([to_entries[] | select(.key | startswith("cargo")) | .value] | any(. != "")) | .linkedinUrl]) as $hit
  | [.[0][] | select((.linkedin // "") as $l | $hit | index($l) | not)]' \
  /tmp/p3-missing-email.json /tmp/p3-aiark-enriched.json > /tmp/p3-still-missing.json

TOOL=$(cargo-ai orchestration tool list | jq -r '.tools[] | select(.isReadOnly and .name == "Find email") | .uuid')
B=$(cargo-ai orchestration action execute-batch \
  --action "{\"kind\":\"tool\",\"toolUuid\":\"$TOOL\"}" \
  --records "$(jq -c '[.[] | {firstName, lastName, companyDomain: .domainName, linkedinUrl: .linkedin}]' /tmp/p3-still-missing.json)" \
  --limit 20 --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/p3-found.json   # address in cargo_email
# Report the sample's hit rate and credits, get approval, then rerun without --limit.

# 5. No paid verify: every cargo_email the tool returned passed zeroBounce as
#    valid (returns_catchalls is unset). Rows with an empty cargo_email are the
#    ones no provider covers; leave them empty rather than guessing.
```

**Credit budget** (200 contacts missing email; assumes 60% hit on aiArk, 35% on the Find email tool, 5% unresolvable):
- aiArk.enrichPerson × 200: 20 (and 0 on the 40% that return no email)
- Find email preset tool × 80: ~77 for the 70 hits at ~1.1 each, roughly 0 for the 10 misses (deeper hits cost up to 4)
- verification: 0 (both sources return verified addresses)
- **Total: ~97 credits for 190 verified emails** (~0.5 cred/email). The sample's receipt replaces these estimates.

**When to hand-roll instead.** If the workspace has no Find email tool, or the user wants their own provider order, step 4 becomes the chain in [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md): `FullEnrich.findEmail` on the residue, `peopleDataLabs.enrichPerson` on what is still missing, then `waterfall.verifyEmail` on every address found, coalesced by key. Running peopleDataLabs on everyone instead would cost 600 credits for enrichment alone.

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
