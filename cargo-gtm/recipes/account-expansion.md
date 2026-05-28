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
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads","config":{}}' \
  --records "$(jq -c '[.records[] | {
    company_domain: .domain,
    title_keywords: ["VP Engineering","Director of Data","Head of Analytics","CTO"],
    function: ["Engineering","Data","Product"]
  }]' /tmp/customers.json)" \
  --wait-until-finished > /tmp/expansion-candidates.json
```

Customize `title_keywords` and `function` to match the expansion motion — different from the original champion persona. If the original buyer was VP Sales, expansion personas might be VP Marketing, Head of Customer Success, Head of Engineering, etc.

For scale (e.g. when expanding to 1,000+ customer accounts at once), swap to `peopleDataLabs.searchLeads` — cheaper per record, broader coverage, lower signal-to-noise.

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
        operator: "in",
        values: [.records[].domain]
      }]
    }]
  }' /tmp/customers.json)" > /tmp/existing-contacts.json
```

### Step 4 — Deduplicate: keep only net-new candidates

```bash
# Build a set of known contact identifiers (LinkedIn URL + email)
jq -r '.records[] | (.linkedin_url // "") + "|" + (.email // "")' /tmp/existing-contacts.json | sort -u > /tmp/known.txt

# Filter expansion candidates against the known set
jq -c '[.results[] | . as $c
  | (($c.linkedin_url // "") + "|" + ($c.email // "")) as $id
  | select($id | IN($ARGS.positional[]) | not)
  | $c
]' --args $(cat /tmp/known.txt) /tmp/expansion-candidates.json > /tmp/net-new.json
```

LinkedIn URL is the most reliable dedup key — emails can vary (work vs. personal), names collide.

### Step 5 — Enrich the net-new contacts

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"enrichProspectDetails","config":{}}' \
  --records "$(jq -c '[.[] | {
    first_name, last_name,
    company_domain,
    contact_linkedin: .linkedin_url
  }]' /tmp/net-new.json)" \
  --wait-until-finished > /tmp/enriched.json
```

For mobile direct dials and top-tier accuracy (worth it on a small high-value expansion list), swap in `FullEnrich.enrichPerson`.

### Step 6 — Tag with expansion signal, hand off to outreach

```bash
jq -c '[.results[] | . + {
  signal_summary: ("Expansion — your colleague <existing champion at " + .company_name + "> is already a customer; reaching out to introduce the same value to your function.")
}]' /tmp/enriched.json > /tmp/expansion-ready.json
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
| `salesNavigator.searchLeads` | 2 | 100 (per account) |
| `waterfall.enrichProspectDetails` | 1 | 150 (per net-new) |
| **Total monthly** | — | **250** |

Expansion typically runs on smaller targeted lists, so per-record costs (even high-precision providers like FullEnrich at 5 credits/record) stay affordable. The dedup step is free — it's a workspace storage query.

## Action shape

Every action follows: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`** — see [`../../cargo-orchestration/references/examples/actions.md`](../../cargo-orchestration/references/examples/actions.md).

## Output retrieval

For batch runs, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>`. See [`../references/output-retrieval.md`](../references/output-retrieval.md).

## Related

- [`prospecting.md`](prospecting.md) — broader: net-new prospects across the TAM, not constrained to existing customers.
- [`outreach-activation.md`](outreach-activation.md) — downstream: turns the expansion segment into send-ready outreach. The `signal_summary` tag from Step 6 feeds directly into its personalization prompt.
