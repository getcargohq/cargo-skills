# Play examples

## What is a play?

A **play** is a segment-driven automation. It is linked to a specific model and segment, and runs its workflow automatically when records in that segment change (are added, updated, or removed). Plays are the reactive side of Cargo — "when this data changes, do that."

Key properties of a play:

- **`name`** — human-readable name (workflows themselves don't have names)
- **`workflowUuid`** — the underlying workflow that executes
- **`modelUuid`** — the data model the play operates on
- **`segmentUuid`** — the segment that triggers runs
- **`changeKinds`** — which segment changes trigger a run (`added`, `updated`, `removed`)
- **`schedule`** — optional cron schedule for periodic re-evaluation
- **`isEnabled`** — whether the play is active

## List all plays

```bash
cargo-ai orchestration play list
```

Response:

```json
{
  "plays": [
    {
      "uuid": "play-uuid",
      "name": "Enrich new companies",
      "workflowUuid": "workflow-uuid",
      "modelUuid": "model-uuid",
      "segmentUuid": "segment-uuid",
      "changeKinds": ["added", "updated"],
      "isEnabled": true,
      "schedule": null,
      "description": "Enriches companies when they enter the segment"
    }
  ]
}
```

## Find a play's workflow UUID

Plays have names — workflows don't. Use the play to find the right workflow and segment.

```bash
# 1. Find the play
cargo-ai orchestration play list
# → Extract play.workflowUuid and play.segmentUuid

# 2. Create a batch using the play's own segment
cargo-ai orchestration batch create \
  --workflow-uuid <play.workflowUuid> \
  --data '{"kind":"segment","segmentUuid":"<play.segmentUuid>"}'

# 3. Poll until done
cargo-ai orchestration batch get <batch-uuid>

# Or block until finished — returns the final batch result without a separate poll step
cargo-ai orchestration batch create \
  --workflow-uuid <play.workflowUuid> \
  --data '{"kind":"segment","segmentUuid":"<play.segmentUuid>"}' \
  --wait-until-finished
```

## Update a play's workflow

To change what a play does, update its draft release and deploy it. The draft release holds the unpublished node graph for the workflow.

> **Looking for inspiration?** Before designing a node graph from scratch, check `cargo-ai orchestration template list` for pre-built patterns (lead scoring, enrichment pipelines, CRM syncs). Use `cargo-ai orchestration template get <slug>` to copy a ready-made node graph and adapt it instead of starting from zero. Templates tagged `"kind":"play"` are designed for segment-driven automations.

```bash
# Step 1 — Find the play and its workflowUuid
cargo-ai orchestration play list
# → Find "Enrich new companies", extract play.workflowUuid

# Step 2 — Get the current draft release (contains the current node graph)
cargo-ai orchestration draft-release get --workflow-uuid <play.workflowUuid>
# → Copy the "nodes" array and make your changes

# Step 3 — Update the draft release with your new nodes
cargo-ai orchestration draft-release update \
  --workflow-uuid <play.workflowUuid> \
  --nodes '[...your updated node graph...]'

# Step 4 — Validate the updated nodes before deploying
cargo-ai orchestration node validate --nodes '[...your updated node graph...]'
# → { "outcome": "valid" }

# Step 5 — Deploy the draft release
cargo-ai orchestration draft-release deploy \
  --workflow-uuid <play.workflowUuid> \
  --nodes '[...your updated node graph...]' \
  --form-fields 'null' \
  --description "Your release description"
```

> **Do not skip validation.** Deploying an invalid node graph will cause runs to fail. Always run `node validate` before `draft-release deploy`.

---

## Run a play's workflow on specific records

> **`run create` is not compatible with play workflows** — it will return
> `playNotCompatible`. Always use `batch create` for plays.
>
> Allowed batch data kinds for plays: `segment`, `change`, `filter`, `recordIds`.

### By filter (query the model)

```bash
cargo-ai orchestration batch create \
  --workflow-uuid <play.workflowUuid> \
  --data '{"kind":"filter","modelUuid":"<play.modelUuid>","filter":{"field":"domain","operator":"is","value":"acme.com"},"limit":10}'
```

### By record IDs

```bash
cargo-ai orchestration batch create \
  --workflow-uuid <play.workflowUuid> \
  --data '{"kind":"recordIds","modelUuid":"<play.modelUuid>","ids":["record-id-1","record-id-2"]}'
```

## Monitor a play's runs

```bash
# List recent runs
cargo-ai orchestration run list \
  --workflow-uuid <play.workflowUuid> \
  --limit 20

# Count errors
cargo-ai orchestration run count \
  --workflow-uuid <play.workflowUuid> \
  --statuses error

# List running batches
cargo-ai orchestration batch list \
  --workflow-uuids <play.workflowUuid> \
  --statuses running
```

## Cancel runs and batches

```bash
# Cancel specific runs
cargo-ai orchestration run cancel \
  --workflow-uuid <play.workflowUuid> \
  --uuids <run-uuid-1>,<run-uuid-2>

# Cancel a batch
cargo-ai orchestration batch cancel <batch-uuid>
```

## End-to-end: use a template to run a play

This example takes a "lead-scoring" play template, fills in its placeholders, validates the node graph, and runs it against the play's segment.

```bash
# Step 1 — List available play templates
cargo-ai orchestration template list
# → Find slug: "lead-scoring", kind: "play"

# Step 2 — Get the template's node graph
cargo-ai orchestration template get lead-scoring
# → Copy the "nodes" array. It will contain __REPLACE_WITH_*__ placeholders.

# Step 3 — Discover what you need to fill in
cargo-ai connection connector list
# → Find your connector UUIDs (e.g. a Clearbit connector)
cargo-ai ai agent list
# → Find agentUuid if the template uses an agent node

# Step 4 — Validate the node graph after filling in placeholders
cargo-ai orchestration node validate --nodes '[
  {
    "uuid": "77777777-7777-4777-a777-777777777777", "slug": "start", "kind": "native", "actionSlug": "start",
    "config": {}, "childrenUuids": ["88888888-8888-4888-a888-888888888888"], "fallbackOnFailure": false,
    "position": {"x": 0, "y": 0}
  },
  {
    "uuid": "88888888-8888-4888-a888-888888888888", "slug": "score", "kind": "native", "actionSlug": "agent",
    "config": {
      "prompt": {
        "kind": "templateExpression",
        "expression": "Score this lead from 1-10 based on ICP fit. Company: {{nodes.start.company}}, Domain: {{nodes.start.domain}}, Employee count: {{nodes.start.employee_count}}. Return score and reasoning.",
        "instructTo": "none",
        "fromRecipe": false
      },
      "advancedSettings": {
        "connectorUuid": "<openai-connector-uuid>",
        "languageModelSlug": "gpt-4.1-mini",
        "temperature": 0.1
      }
    },
    "childrenUuids": ["99999999-9999-4999-a999-999999999999"], "fallbackOnFailure": false,
    "position": {"x": 0, "y": 166}
  },
  {
    "uuid": "99999999-9999-4999-a999-999999999999", "slug": "end", "kind": "native", "actionSlug": "end",
    "config": {
      "variables": [
        {"name": "score", "type": "number", "value": {"kind": "templateExpression", "expression": "{{nodes.score.score}}", "instructTo": "none", "fromRecipe": false}},
        {"name": "reasoning", "type": "string", "value": {"kind": "templateExpression", "expression": "{{nodes.score.reasoning}}", "instructTo": "none", "fromRecipe": false}}
      ]
    },
    "childrenUuids": [], "fallbackOnFailure": false,
    "position": {"x": 0, "y": 332}
  }
]'
# → { "outcome": "valid" }

# Step 5 — Find the play's workflowUuid and segmentUuid
cargo-ai orchestration play list
# → Find "Lead Scoring", extract workflowUuid and segmentUuid

# Step 6 — Run the template nodes against the play's segment
cargo-ai orchestration batch create \
  --workflow-uuid <play.workflowUuid> \
  --data '{"kind":"segment","segmentUuid":"<play.segmentUuid>"}' \
  --nodes '[...validated nodes from step 4...]'
# → Extract batch.uuid

# Step 7 — Poll until finished (every 5s)
cargo-ai orchestration batch get <batch-uuid>
# → Done when .status is "success", "error", or "cancelled"

# Alternative to steps 6+7 — block until finished in one command
cargo-ai orchestration batch create \
  --workflow-uuid <play.workflowUuid> \
  --data '{"kind":"segment","segmentUuid":"<play.segmentUuid>"}' \
  --nodes '[...validated nodes from step 4...]' \
  --wait-until-finished
```
