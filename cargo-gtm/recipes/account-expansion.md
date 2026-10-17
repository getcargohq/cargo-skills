# Recipe — Find expansion contacts inside customer accounts

Use this recipe when the user wants to multi-thread existing customers — find additional buyers, champions, or budget-holders within accounts they already sell to. The output is a per-customer list of net-new contacts (not already in the workspace's Contacts model) at target personas, ready for hand-off to outreach.

**Trigger phrases:**

- *"Find me other buyers at our existing customer accounts."*
- *"Who should we be talking to for upsell at our customers?"*
- *"Multi-thread the champion accounts — who else matters?"*
- *"Find net-new contacts at customer X."*

## Why this recipe exists

Expansion revenue typically beats new-logo revenue on CAC by 3–5×. The blocker is rarely *which accounts* (the CRM already knows the customer list) — it's *which net-new contacts* at those accounts to engage. This recipe mechanizes the discovery: pull customer accounts, search for additional personas, deduplicate against contacts already in the CRM, enrich, ready for outreach.

The cargo-unique piece is the dedup against the workspace's Contacts model — sourcing tools (salesNavigator, peopleDataLabs) don't know who you already have in HubSpot/Salesforce.

## Recipe

### Step 1 — Pull the customer-account list

```bash
cargo-ai storage model list  # find Companies + Contacts model UUIDs
COMPANIES_MODEL=...
CONTACTS_MODEL=...

cargo-ai segmentation segment fetch \
  --model-uuid "$COMPANIES_MODEL" \
  --filter '{"conjonction":"and","groups":[{"conjonction":"and","conditions":[
    {"kind":"string","columnSlug":"lifecycle_stage","operator":"is","values":["customer"]},
    {"kind":"string","columnSlug":"subscription_status","operator":"is","values":["active"]}
  ]}]}' > /tmp/customers.json
```

Adjust filters to scope: top-tier customers only, customers in renewal window (next 90d), customers with NRR > 100%, etc.

### Step 2 — Search for additional personas at each customer

Choose precision (salesNavigator) or scale (peopleDataLabs). For expansion, **precision usually wins** — you only need 2–4 net-new contacts per account, and signal quality matters more than volume:

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads"}' \
  --records "$(jq -c '[.records[] | {
    domain,
    company: {currentCompanyIds: [.linkedin_company_id]},
    role: {
      titleKeywords: ["VP Engineering","Director of Data","Head of Analytics","CTO"],
      functions: ["8","13","19"]
    },
    limit: 3
  }]' /tmp/customers.json)" \
  --wait-until-finished > /tmp/expansion-candidates.json
```

`searchLeads` keys on LinkedIn company IDs (`company.currentCompanyIds`, strings), not domains: `linkedin_company_id` stands for whichever column holds them. If the model only has domains, resolve them first with `linkedin.enrichCompanyFromDomain` (0.5, returns `company_id`). `role.functions` takes LinkedIn function codes as strings (`"8"` Engineering, `"13"` Information Technology, `"19"` Product Management); names like `"Engineering"` match nothing. `domain` is not a searchLeads input; it rides along so the result rows keep it.

Customize `role.titleKeywords` and `role.functions` to match the expansion motion — different from the original champion persona. If the original buyer was VP Sales, expansion personas might be VP Marketing, Head of Customer Success, Head of Engineering, etc.

For scale (e.g. when expanding to 1,000+ customer accounts at once), swap to `peopleDataLabs.searchPeople` — broader coverage, lower signal-to-noise, and 3 credits per returned record (15× salesNavigator), so cap `limit` per account.

### Step 3 — Pull existing contacts at the same accounts

```bash
cargo-ai segmentation segment fetch \
  --model-uuid "$CONTACTS_MODEL" \
  --filter "$(jq -c '{
    conjonction: "and",
    groups: [{
      conjonction: "and",
      conditions: [{
        kind: "string",
        columnSlug: "company_domain",
        operator: "is",
        values: [.records[].domain]
      }]
    }]
  }' /tmp/customers.json)" > /tmp/existing-contacts.json
```

### Step 4 — Deduplicate: keep only net-new candidates

`/tmp/expansion-candidates.json` is the batch object, not the leads. The rows are a CSV behind `batch download`; a search action's lead array lands in one `cargo` column as JSON, with each lead carrying `linkedin_profile_url`, `first_name`, `last_name`, `company_name` (no email).

```bash
# Known contacts, keyed on LinkedIn URL
jq -c '[.records[] | .linkedin_url // empty]' /tmp/existing-contacts.json > /tmp/known.json

# Pull the lead rows, then keep only candidates not already in Contacts
URL=$(cargo-ai orchestration batch download --uuid "$(jq -r .batch.uuid /tmp/expansion-candidates.json)" | jq -r .url)
curl -fsSL "$URL" \
  | python3 -c 'import csv,json,sys; json.dump(list(csv.DictReader(sys.stdin)), sys.stdout)' \
  | jq -c --slurpfile known /tmp/known.json '[.[] | select(.cargo != "") | .domain as $d
      | (.cargo | fromjson)[] | . + {company_domain: $d}
      | select(.linkedin_profile_url as $u | $known[0] | index($u) | not)]' > /tmp/net-new.json
```

LinkedIn URL is the most reliable dedup key — emails can vary (work vs. personal), names collide. Normalize both sides (trailing slash, `www.`) before comparing if the stored URLs were typed by hand.

### Step 5 — Enrich the net-new contacts

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"enrichContact"}' \
  --records "$(jq -c '[.[] | {
    first_name, last_name, company_name,
    domain: .company_domain,
    linkedin: .linkedin_profile_url
  }]' /tmp/net-new.json)" \
  --wait-until-finished > /tmp/enriched.json
```

For mobile direct dials and top-tier accuracy (worth it on a small high-value expansion list), swap in `FullEnrich.findPhoneAndEmail` (7).

### Step 6 — Tag with expansion signal, hand off to outreach

`/tmp/enriched.json` is again the batch object; tag the rows from its batch download CSV (the input columns, including `company_name`, come through unprefixed):

```bash
URL=$(cargo-ai orchestration batch download --uuid "$(jq -r .batch.uuid /tmp/enriched.json)" | jq -r .url)
curl -fsSL "$URL" \
  | python3 -c 'import csv,json,sys; json.dump(list(csv.DictReader(sys.stdin)), sys.stdout)' \
  | jq -c '[.[] | . + {
  signal_summary: ("Expansion — your colleague <existing champion at " + .company_name + "> is already a customer; reaching out to introduce the same value to your function.")
}]' > /tmp/expansion-ready.json
```

The expansion signal in the personalization prompt produces qualitatively different cold copy than a cold-prospect signal — name-drop the existing user, tie value to the recipient's function. Pass to [`outreach-activation.md`](outreach-activation.md) from Step 5 onwards (skip its enrichment step — already done).

## Recurring expansion (cron / play)

For continuous multi-threading:

1. Trigger: monthly cron.
2. Source: customer-accounts segment.
3. Nodes: searchLeads → fetch existing Contacts → dedup → enrich → write to "Expansion candidates" segment.
4. Downstream: a separate play takes new members of "Expansion candidates" and triggers `outreach-activation`.

For play setup, see [`../../cargo-orchestration/references/examples/plays.md`](../../cargo-orchestration/references/examples/plays.md).

## Credit budget

For 50 top-tier customer accounts, expanded monthly:

| Step | Per record | 50 accounts (3 candidates each = 150) |
|---|---|---|
| `salesNavigator.searchLeads` (`limit: 3`) | 0.2 per returned lead | 30 (150 leads) |
| `waterfall.enrichContact` | 2 | 300 (per net-new) |
| **Total monthly** | — | **330** |

Expansion typically runs on smaller targeted lists, so per-record costs (even high-precision providers like `FullEnrich.findPhoneAndEmail` at 7 credits/record) stay affordable. The dedup step is free — it's a workspace storage query.

## Action shape

Every action follows: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>"}`. **No `connectorUuid` in `config`** — see [`../../cargo-orchestration/references/examples/actions.md`](../../cargo-orchestration/references/examples/actions.md).

## Output retrieval

For `execute-batch` runs, use `cargo-ai orchestration batch download --uuid <batch-uuid>` (signed CSV URL, steps 4 and 6). For a saved play, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>`. See [`../references/output-retrieval.md`](../references/output-retrieval.md).

## Related

- [`prospecting.md`](prospecting.md) — broader: net-new prospects across the TAM, not constrained to existing customers.
- [`outreach-activation.md`](outreach-activation.md) — downstream: turns the expansion segment into send-ready outreach. The `signal_summary` tag from Step 6 feeds directly into its personalization prompt.
