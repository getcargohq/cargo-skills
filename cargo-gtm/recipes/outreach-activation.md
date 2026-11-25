# Recipe — Activate a signal segment as personalized outreach

Use this recipe when the user has a signal-driven segment ready (recent fundraise, job change, tech intent, ICP-fit accounts, etc.) and wants to turn it into **send-ready outreach** — enriched contacts, LLM-personalized variables, handed off to their sequencer or CRM. Bridges the [`../guides/writing-outreach.md`](../guides/writing-outreach.md) guide to actual execution.

**Trigger phrases:**

- *"Take this segment and write outreach for it."*
- *"Personalize a first-touch email for every contact in the recently-funded segment."*
- *"Build a sequence-ready list from job changes this week."*
- *"Generate first lines for the tech-intent companies."*

## Before you start — basis, suppression, relevance

Blocking, and all three are free. Full spec: [`../references/acceptable-use.md`](../references/acceptable-use.md).

1. **Ask which basis applies** — existing customers, opted-in contacts, event attendees, or a documented legitimate-interest case for this B2B role. A work email in the record is not itself a basis. Purchased lists and data taken from a platform in breach of its terms are a stop.
2. **Subtract suppression before you enrich.** Filter the segment on the workspace's unsubscribe / do-not-contact / hard-bounce columns *first* — it protects the people who opted out and it stops you paying to enrich rows you can't use. No such column? Flag it as a real gap and offer to add one; don't proceed silently.
3. **Name the per-recipient reason.** The signal that built the segment is usually it. If the honest answer is "they matched an industry filter", the list isn't ready — tighten it before spending.

This recipe ends at send-ready variables. The user's sequencer sends, under its own limits, domains, and identities; the copy it sends needs an honest sender and subject, a working opt-out, and a postal address where required.

## Why this recipe exists

Signal recipes (`funding-watch`, `job-change-monitoring`, `tech-intent`, `portfolio-prospecting`) all produce a segment. They stop at *"here's a list with a signal."* The next step — enrich, personalize, hand off — has the same shape regardless of the signal. This recipe captures that shape once.

The handoff target is the workspace's sequencer of choice (Outreach, Salesloft, Apollo, HubSpot Sequences, Salesforce Cadences). The recipe stops at "send-ready variables" and points at `cargo-ai connection integration get <slug>` for the final push. Cargo's own mailboxes are a fourth option for that final push — see [`../../cargo-mailbox-management/SKILL.md`](../../cargo-mailbox-management/SKILL.md); the gates in [`../references/acceptable-use.md`](../references/acceptable-use.md) are identical either way, and a Cargo-owned mailbox adds its own volume ceiling (the warm-up ramp) on top of them.

## Recipe

### Step 1 — Pull the signal segment

```bash
cargo-ai storage model list  # find Companies / Contacts model UUID
MODEL_UUID=...

cargo-ai segmentation segment list  # find the signal segment, e.g. "Recently Funded — last 30d"
cargo-ai segmentation segment fetch \
  --model-uuid "$MODEL_UUID" \
  --filter '{"conjonction":"and","groups":[{"conjonction":"and","conditions":[
    {"kind":"string","columnSlug":"signal","operator":"is","values":["funding","job_change"]}
  ]}]}' > /tmp/signal-segment.json
```

### Step 2 — Resolve the right contacts

If the segment is company-level (e.g. recently funded), pull target personas at each account:

`execute-batch --wait-until-finished` prints the batch object, not rows. Rows come from `batch download`: a signed CSV of each input record's columns plus every output key as `cargo_<key>` (nested objects as dotted columns). This helper turns it into JSON for jq:

```bash
batch_rows() {
  curl -fsSL "$(cargo-ai orchestration batch download --uuid "$1" | jq -r .url)" \
    | python3 -c 'import csv,json,sys; json.dump(list(csv.DictReader(sys.stdin)), sys.stdout)'
}
```

searchLeads scopes to a company by its LinkedIn company id (`company.currentCompanyIds`), not a domain. This assumes the segment carries it as `linkedin_id`; when it doesn't, resolve it first with `linkedin.enrichCompanyFromDomain` (0.5, returns `company_id`).

```bash
# Use salesNavigator for precision, peopleDataLabs for scale.
# Function codes are LinkedIn's, as strings: "25" Sales, "18" Operations
# (there is no Revenue Operations function; names like "Sales" match nothing).
# domain and signal ride along so they come back as CSV columns.
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads"}' \
  --records "$(jq -c '[.records[] | select(.linkedin_id) | {
    domain, signal,
    company: {currentCompanyIds: [.linkedin_id]},
    role: {titleKeywords: ["VP", "Director", "Head"], functions: ["25", "18"]},
    limit: 5
  }]' /tmp/signal-segment.json)" \
  --wait-until-finished | jq -r '.batch.uuid')

# The leads array lands in one `cargo` column as JSON
batch_rows "$B" | jq '[.[] | {domain, signal} as $c | (.cargo // "" | if . == "" then [] else fromjson end)[] | . + $c]' > /tmp/contacts.json
```

If the segment is already contact-level (e.g. job-change rows with `job_change_status` = `moved`), skip this step — use those rows directly.

### Step 3 — Find each contact's work email

The native Find email tool is the default ([`../SKILL.md`](../SKILL.md#contact-data-cargos-native-tools-first-mandatory-default)): Cargo's maintained waterfall, which walks several providers and returns an address only after zeroBounce graded it valid. A single provider (or `waterfall.enrichContact`'s `person.professional_email`) runs only when the user names one, explicitly asks for the cheapest path, or the tool is missing; say which.

```bash
# title, company_name and signal_summary ride along for step 5; the tool
# reads linkedinUrl, or firstName + lastName + companyDomain
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","templateSlug":"email_waterfall"}' \
  --records "$(jq -c '[.[] | {
    firstName: .first_name, lastName: .last_name, companyDomain: .domain,
    linkedinUrl: .linkedin_profile_url,
    first_name, last_name, title: .job_title, company_name, signal_summary: .signal
  }]' /tmp/contacts.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
curl -fsSL "$(cargo-ai orchestration batch download --uuid "$B" | jq -r .url)" > /tmp/enriched.csv
```

The address is in `cargo_email`, empty where no provider had one. Phones are not part of this recipe; when the user asks for them, run the Find phone tool (`phone_waterfall`, 3 to 7, `linkedinUrl` in) on the qualified rows only.

### Step 4 — Cull and audit before personalizing (free)

Find email already verified every address it returned, so there is no paid verify. The free checks still catch what verification does not (role addresses, duplicates, disposable domains):

```bash
# 4a. FREE pre-cull (QA scripts: ../references/contact-accuracy.md; Node >= 22.18;
#     it reads the batch download CSV directly)
node <skill-dir>/scripts/validate-emails.ts --input /tmp/enriched.csv \
  --email-column cargo_email --json \
  | jq '[.[] | . + {email: .cargo_email,
                    emailStatus: (if (.cargo_email // "") != "" then "valid" else "" end)}]' > /tmp/merged.json

# 4b. Audit ALL rows, then hand ONLY the SEND rows to the next steps — this
#     file is what steps 5 and 6 read
node <skill-dir>/scripts/contact-accuracy-audit.ts --input /tmp/merged.json --json > /tmp/audited.json
jq '[.[] | select(.audit_action == "SEND")]' /tmp/audited.json > /tmp/deliverable.json
```

Emails the segment already carried (not found by the tool) do need a paid check: run them through the Verify email tool, `{"kind":"tool","templateSlug":"email_validator"}` (0.2; `status`, `is_safe`), and merge `status` as `emailStatus` before the audit.

### Step 5 — Generate a personalized first line per contact

```bash
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"anthropic","actionSlug":"instruct"}' \
  --records "$(jq -c '[.[] | {
    model: "claude-3-5-haiku-latest",
    advancedSettings: {temperature: 0.3, maxTokens: 1024},
    prompt: ("You are writing the opening line of a first-touch email. The recipient is " + .first_name + " " + .last_name + ", " + .title + " at " + .company_name + ". Signal triggering this outreach: " + .signal_summary + ". Write ONE sentence that references the signal naturally and ties it to a relevant business outcome. No greeting. No follow-up. ≤30 words.")
  }]' /tmp/deliverable.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/personalized.json   # the line is in cargo_answer
```

`model` is a **required input**, so it belongs in every record alongside `prompt` — the action carries no `config` at all. Put it in `config` and it is stripped without an error that names `config`: the call is refused before it runs on the missing `model`.

More proven prompts (subject lines, follow-ups, job-change angles): [`../references/prompt-library/index.md`](../references/prompt-library/index.md).

For higher quality at higher cost, swap `claude-3-5-haiku-latest` for `claude-sonnet-4-6` (0.2 credits/1k tokens). For ~8× cheaper at scale: `openAi` with `gpt-5-nano` (0.006 credits/1k tokens vs Haiku's 0.05) — see [`../provider-playbooks/openAi.md`](../provider-playbooks/openAi.md) for the full tier table.

### Step 6 — Hand off to the sequencer

Compose the send-ready payload — one row per contact with email, signal, and the personalized first line:

```bash
# deliverable.json is the audited SEND array; personalized.json holds the batch
# rows in the same order (one per input record) — zip them by index
jq -n --slurpfile d /tmp/deliverable.json --slurpfile p /tmp/personalized.json '
  [range(0; ($d[0] | length)) as $i
   | {email: $d[0][$i].email, first_line: $p[0][$i].cargo_answer, signal: $d[0][$i].signal_summary}]
' > /tmp/send-ready.json
```

Then push to the user's sequencer. Discover the action via:

```bash
cargo-ai connection integration get outreach     # Outreach.io
cargo-ai connection integration get salesloft    # Salesloft
cargo-ai connection integration get hubspot      # HubSpot Sequences
cargo-ai connection integration get salesforce   # Salesforce Cadences
```

Then execute the discovered action with `orchestration action execute-batch`, passing the per-contact payload. **Do not invent `actionSlug` values** — list them from the integration first.

## Recurring activation (cron / play)

For ongoing signal-driven outreach:

1. Trigger: weekly cron on the signal segment.
2. Workflow nodes: signal-segment → Find email tool → personalize → sequencer push.
3. Source: the saved signal segment (e.g. "Recently Funded — last 30d").
4. Output: send-ready payload + sequence-add action.

For play setup, see [`../../cargo-orchestration/references/examples/plays.md`](../../cargo-orchestration/references/examples/plays.md).

## Credit budget

For a 500-contact signal segment (Find email + Haiku personalization):

| Step | Per record | 500 contacts |
|---|---|---|
| Find email tool (`email_waterfall`) | 1.1–4 per hit, ~0 per miss | 550–2,000 at most |
| `anthropic.instruct` (Haiku, 0.05/1k tokens, ~0.5k tokens per line) | ~0.025 | ~13 |
| **Total** | | **~563 to 2,013**; the 20-row sample's receipt sets the real figure |

Cut personalization ~8× by switching to `openAi.instruct` with `gpt-5-nano` (0.006/1k tokens).

## Action shape

Every connector action follows: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>"}`, and a native Cargo tool `{"kind":"tool","templateSlug":"<slug>"}`. **No `connectorUuid` in `config`** — see [`../../cargo-orchestration/references/examples/actions.md`](../../cargo-orchestration/references/examples/actions.md). Cross-node interpolation in node graphs: `{{nodes.<slug>.<field>}}`.

## Output retrieval

For batch runs, use `cargo-ai orchestration batch download --uuid <batch-uuid>` (the `batch_rows` helper above): an ad-hoc `execute-batch` has no workflow, so `run download-outputs --workflow-uuid` does not apply. See [`../references/output-retrieval.md`](../references/output-retrieval.md).

## Related

- [`writing-outreach.md`](../guides/writing-outreach.md) — provider routing, prompt patterns, model selection.
- Upstream signal recipes that produce input segments for this recipe: [`funding-watch.md`](funding-watch.md), [`job-change-monitoring.md`](job-change-monitoring.md), [`tech-intent.md`](tech-intent.md), [`portfolio-prospecting.md`](portfolio-prospecting.md).
