# Quickstart recipes

Recipes are paste-and-tweak templates for the most common goals. Each recipe is a complete, runnable sequence — pick one, replace the placeholders, run it. Recipes intentionally favor `--wait-until-finished` for ergonomics; for large batches, switch to polling per `cargo-orchestration/references/polling.md`.

## R6 — Push a list of records to a CRM

User: *"Push these 100 companies to HubSpot."*

```bash
cargo-ai connection integration get hubspot   # confirm actionSlug

cargo-ai orchestration action execute-batch \
  --action '{
    "kind":"connector",
    "integrationSlug":"hubspot",
    "actionSlug":"upsert_company",
    "config":{}
  }' \
  --records '[{"domain":"acme.com","name":"Acme"}, ... ]' \
  --wait-until-finished
```

## R7 — Multi-step research (find → enrich → score)

User: *"Find 20 series-A SaaS companies, enrich them, and score for ICP fit."*

Run as three sequential `action execute` / `action execute-batch` calls, piping each step's output into the next. This keeps the quickstart in pure-action territory — for a reusable graph, defer to `cargo-orchestration` to build a tool.

```bash
# 1. Find — one-shot native action
cargo-ai connection native-integration get | jq '.actions[] | select(.slug|test("find_compan"))'
cargo-ai orchestration action execute \
  --action '{"kind":"native","actionSlug":"find_companies","config":{}}' \
  --data '{"stage":"series-a","industry":"saas","limit":20}' \
  --wait-until-finished > /tmp/found.json

# 2. Enrich — fan-out across the results from step 1
#    (extract per-record inputs from /tmp/found.json — exact jq path depends on the
#     find action's output shape; inspect run.runContext.<slug> to confirm)
cargo-ai connection integration get clearbit
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"company_enrich","config":{}}' \
  --records '<JSON array of {"domain":"..."} extracted from step 1>' \
  --wait-until-finished > /tmp/enriched.json

# 3. Score — pass enriched records through the scoring agent
AGENT_UUID=$(cargo-ai ai agent list | jq -r '.agents[] | select(.name|test("score";"i")) | .uuid')
cargo-ai orchestration action execute-batch \
  --action "$(jq -nc --arg uuid "$AGENT_UUID" '{kind:"agent",agentUuid:$uuid,config:{}}')" \
  --records '<JSON array of enriched records extracted from step 2>' \
  --wait-until-finished
```

> Reaching for `run create --nodes` to chain these in one server-side run? That's a node graph — load `cargo-orchestration` and use the `{{nodes.<slug>.<field>}}` interpolation syntax documented in its `references/nodes.md`. Inside a node graph, `connectorUuid` lives at the **top level of the node**, not inside `config`.

## R8 — Health check on a saved tool

User: *"How is the CRM-sync tool doing this week?"*

```bash
WORKFLOW_UUID=$(cargo-ai orchestration tool list | jq -r '.tools[] | select(.name|test("CRM Sync";"i")) | .workflowUuid')

cargo-ai orchestration run get-metrics --workflow-uuid "$WORKFLOW_UUID"
cargo-ai orchestration run count --workflow-uuid "$WORKFLOW_UUID" --statuses error
cargo-ai orchestration run download --workflow-uuid "$WORKFLOW_UUID" --statuses error --is-finished
```

Summarize: success rate, top error types, sample of failed records.

## R9 — Export a filtered slice of a model

User: *"Export US companies with < 200 employees, sorted by created date."*

```bash
MODEL_UUID=$(cargo-ai storage model list | jq -r '.models[] | select(.slug=="companies") | .uuid')

cargo-ai segmentation segment download \
  --model-uuid "$MODEL_UUID" \
  --filter '{
    "conjonction":"and",
    "groups":[{"conjonction":"and","conditions":[
      {"kind":"string","columnSlug":"country","operator":"is","values":["US"]},
      {"kind":"number","columnSlug":"employee_count","operator":"lt","values":[200]}
    ]}]
  }' \
  --sort '[{"columnSlug":"created_at","kind":"desc"}]'
```

> `conjonction` — that spelling is intentional. Typos here fail silently.

## R10 — Conversational research with an agent

User: *"Use the lead-researcher agent to find LinkedIns for these 10 contacts."*

```bash
AGENT_UUID=$(cargo-ai ai agent list | jq -r '.agents[] | select(.name|test("research";"i")) | .uuid')
CHAT_UUID=$(cargo-ai ai chat create --agent-uuid "$AGENT_UUID" | jq -r .uuid)

cargo-ai ai message create \
  --chat-uuid "$CHAT_UUID" \
  --parts '[{"type":"text","text":"For each of these contacts, return their LinkedIn URL. Contacts: ..."}]' \
  --wait-until-finished
```

For a list larger than ~10 records, prefer R7 (node graph with `kind: "agent"`) so each record gets an isolated run.

## R11 — Credit-spend snapshot

User: *"How much did enrichment cost last month?"*

```bash
cargo-ai billing usage get-metrics \
  --from 2026-03-01 --to 2026-03-31 \
  --group-by workflow_uuid \
  | jq '.metrics[] | select(.workflowName|test("Enrich";"i"))'
```

Requires admin token.

## Picking the right recipe

| If the goal looks like…                                | Start with |
| ------------------------------------------------------ | ---------- |
| One record, one transformation                         | R2         |
| One record, multiple transformations                   | R7 (single-record `run create`) |
| Many records, one transformation                       | R6         |
| Many records, multi-step (find/enrich/score)           | R7         |
| All records in a segment, one transformation           | R3         |
| Free-form research question                            | R5 or R10  |
| Operational / health question about a saved tool       | R8         |
| "Export / download" of model data                      | R9         |
| Cost / credit / billing question                       | R11        |
