# Recipe — Activate a signal segment as personalized outreach

Use this recipe when the user has a signal-driven segment ready (recent fundraise, job change, tech intent, ICP-fit accounts, etc.) and wants to turn it into **send-ready outreach** — enriched contacts, LLM-personalized variables, handed off to their sequencer or CRM. Bridges the [`../guides/writing-outreach.md`](../guides/writing-outreach.md) guide to actual execution.

**Trigger phrases:**

- *"Take this segment and write outreach for it."*
- *"Personalize a first-touch email for every contact in the recently-funded segment."*
- *"Build a sequence-ready list from job changes this week."*
- *"Generate first lines for the tech-intent companies."*

## Why this recipe exists

Signal recipes (`funding-watch`, `job-change-monitoring`, `tech-intent`, `portfolio-prospecting`) all produce a segment. They stop at *"here's a list with a signal."* The next step — enrich, personalize, hand off — has the same shape regardless of the signal. This recipe captures that shape once.

The handoff target is the workspace's sequencer of choice (Outreach, Salesloft, Apollo, HubSpot Sequences, Salesforce Cadences). The recipe stops at "send-ready variables" and points at `cargo-ai connection integration get <slug>` for the final push.

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

```bash
# Use salesNavigator for precision, peopleDataLabs for scale.
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchLeads","config":{}}' \
  --records "$(jq -c '[.records[] | {
    company_domain: .domain,
    title_keywords: ["VP", "Director", "Head"],
    function: ["Sales", "Revenue Operations"]
  }]' /tmp/signal-segment.json)" \
  --wait-until-finished > /tmp/contacts.json
```

If the segment is already contact-level (e.g. job-change MOVED rows), skip this step — use those rows directly.

### Step 3 — Enrich each contact (email + LinkedIn + firmographics)

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"enrichProspectDetails","config":{}}' \
  --records "$(jq -c '[.results[] | {
    first_name, last_name,
    company_domain: .company_domain,
    contact_linkedin: .linkedin_url
  }]' /tmp/contacts.json)" \
  --wait-until-finished > /tmp/enriched.json
```

Waterfall returns the best-coverage `email`, `phone`, and a normalized contact profile. For premium contact data (mobile direct dials, top-tier accuracy), swap in `FullEnrich.enrichPerson`.

### Step 4 — Verify emails before personalizing

Cheap insurance against bounces and sender-reputation damage. Free cull → paid verify on the survivors only → merge statuses back → audit **all** rows → keep SEND:

```bash
# 4a. FREE pre-cull (QA scripts: ../references/contact-accuracy.md; Node >= 22.18;
#     execute-batch output is accepted directly)
node <skill-dir>/scripts/validate-emails.ts --input /tmp/enriched.json --json > /tmp/culled.json

# 4b. Paid verification — build the batch from the CULLED rows, never the
#     original list (that's where the credit saving happens)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"verifyEmail","config":{}}' \
  --records "$(jq -c '[.[] | select(.recommendation != "skip") | {email}]' /tmp/culled.json)" \
  --wait-until-finished > /tmp/verified.json

# 4c. Merge statuses back onto ALL culled rows — do NOT pre-filter to "valid":
#     the audit needs the catch-all/unknown/invalid rows to issue
#     VERIFY/REVIEW/REMOVE verdicts (and the receipt needs their counts).
#     Join on the LOWERCASED email — verify results may re-case the address,
#     and a missed join leaves emailStatus empty (row degrades to VERIFY).
#     Read .email_status (waterfall.verifyEmail output schema) — not .status.
jq -c --slurpfile ver /tmp/verified.json '
  ($ver[0].results | map({key: (.email | ascii_downcase), value: .email_status}) | from_entries) as $st
  | map(. + {emailStatus: ($st[(.email // "" | ascii_downcase)] // "")})
' /tmp/culled.json > /tmp/merged.json

# 4d. Audit, then hand ONLY the SEND rows to the next steps — this file is
#     what steps 5 and 6 read
node <skill-dir>/scripts/contact-accuracy-audit.ts --input /tmp/merged.json --json > /tmp/audited.json
jq '[.[] | select(.audit_action == "SEND")]' /tmp/audited.json > /tmp/deliverable.json
```

### Step 5 — Generate a personalized first line per contact

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"anthropic","actionSlug":"instruct","config":{"model":"claude-3-5-haiku-latest","advancedSettings":{"temperature":0.3,"maxTokens":1024}}}' \
  --records "$(jq -c '[.[] | {
    prompt: ("You are writing the opening line of a cold email. The recipient is " + .first_name + " " + .last_name + ", " + .title + " at " + .company_name + ". Signal triggering this outreach: " + .signal_summary + ". Write ONE sentence that references the signal naturally and ties it to a relevant business outcome. No greeting. No follow-up. ≤30 words.")
  }]' /tmp/deliverable.json)" \
  --wait-until-finished > /tmp/personalized.json
```

More proven prompts (subject lines, follow-ups, job-change angles): [`../references/prompt-library/index.md`](../references/prompt-library/index.md).

For higher quality at higher cost, swap `claude-3-5-haiku-latest` for `claude-sonnet-4-6`. For ~30× cheaper at scale: `openAi` with `gpt-5-nano` (0.006 credits/1k tokens vs Haiku's 0.2) — see [`../provider-playbooks/openAi.md`](../provider-playbooks/openAi.md) for the full tier table.

### Step 6 — Hand off to the sequencer

Compose the send-ready payload — one row per contact with email, signal, and the personalized first line:

```bash
# deliverable.json is the audited SEND array; personalized.json is batch output
# ({results: [...]}) in the same order — zip them by index
jq -n --slurpfile d /tmp/deliverable.json --slurpfile p /tmp/personalized.json '
  [range(0; ($d[0] | length)) as $i
   | {email: $d[0][$i].email, first_line: $p[0].results[$i].text, signal: $d[0][$i].signal_summary}]
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
2. Workflow nodes: signal-segment → enrich → verify → personalize → sequencer push.
3. Source: the saved signal segment (e.g. "Recently Funded — last 30d").
4. Output: send-ready payload + sequence-add action.

For play setup, see [`../../cargo-orchestration/references/examples/plays.md`](../../cargo-orchestration/references/examples/plays.md).

## Credit budget

For a 500-contact signal segment (waterfall + verify + Haiku personalization):

| Step | Per record | 500 contacts |
|---|---|---|
| `waterfall.enrichProspectDetails` | 1 | 500 |
| `waterfall.verifyEmail` | 0.5 | 250 |
| `anthropic.instruct` (Haiku) | 0.2 | 100 |
| **Total** | **1.7** | **850** |

Cut personalization ~30× by switching to `openAi.instruct` with `gpt-5-nano` (0.006/1k tokens).

## Action shape

Every action follows: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`** — see [`../../cargo-orchestration/references/examples/actions.md`](../../cargo-orchestration/references/examples/actions.md). Cross-node interpolation in node graphs: `{{nodes.<slug>.<field>}}`.

## Output retrieval

For batch runs, use `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>`. See [`../references/output-retrieval.md`](../references/output-retrieval.md).

## Related

- [`writing-outreach.md`](../guides/writing-outreach.md) — provider routing, prompt patterns, model selection.
- Upstream signal recipes that produce input segments for this recipe: [`funding-watch.md`](funding-watch.md), [`job-change-monitoring.md`](job-change-monitoring.md), [`tech-intent.md`](tech-intent.md), [`portfolio-prospecting.md`](portfolio-prospecting.md).
