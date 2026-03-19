# Tool examples

## What is a tool?

A **tool** is an on-demand workflow. Unlike plays (which react to segment changes), tools are triggered manually, via API, or on a cron schedule. Tools are the proactive side of Cargo — "run this workflow right now on this data."

Key properties of a tool:

- **`name`** — human-readable name (workflows themselves don't have names)
- **`workflowUuid`** — the underlying workflow that executes
- **`description`** — what the tool does
- **`creditsCost`** — estimated credit cost per run
- **`triggers`** — optional cron triggers for scheduled execution
- **`isReadOnly`** — whether the tool can be modified

## List all tools

```bash
cargo-ai orchestration tool list
```

Response:

```json
{
  "tools": [
    {
      "uuid": "tool-uuid",
      "name": "Company Enrichment",
      "workflowUuid": "workflow-uuid",
      "description": "Enriches a company record with firmographic data",
      "creditsCost": { "kind": "minMax" },
      "triggers": [],
      "isReadOnly": false
    }
  ]
}
```

## Find a tool's workflow UUID

Tools have names — workflows don't. Use the tool to find the right workflow.

```bash
# 1. List tools, find by name
cargo-ai orchestration tool list
# → Find "Company Enrichment", extract tool.workflowUuid

# 2. Use the workflowUuid for run/batch commands
cargo-ai orchestration run create \
  --workflow-uuid <workflow-uuid-from-tool> \
  --data '{"company":"Acme Corp","domain":"acme.com"}'
```

## Update a tool's workflow

To change what a tool does, update its draft release and deploy it. The draft release holds the unpublished node graph for the workflow.

```bash
# Step 1 — Find the tool and its workflowUuid
cargo-ai orchestration tool list
# → Find "Company Enrichment", extract tool.workflowUuid

# Step 2 — Get the current draft release (contains the current node graph)
cargo-ai orchestration draft-release get --workflow-uuid <tool.workflowUuid>
# → Copy the "nodes" array and make your changes

# Step 3 — Update the draft release with your new nodes
cargo-ai orchestration draft-release update \
  --workflow-uuid <tool.workflowUuid> \
  --nodes '[...your updated node graph...]'

# Step 4 — Validate the updated nodes before deploying
cargo-ai orchestration node validate --nodes '[...your updated node graph...]'
# → { "outcome": "valid" }

# Step 5 — Deploy the draft release
cargo-ai orchestration draft-release deploy \
  --workflow-uuid <tool.workflowUuid> \
  --nodes '[...your updated node graph...]' \
  --form-fields 'null' \
  --description "Your release description"
```

> **Do not skip validation.** Deploying an invalid node graph will cause runs to fail. Always run `node validate` before `draft-release deploy`.

---

## Run a tool on a single record

The most common use case — run the tool on one record. Tools support both `run create` (single record) and `batch create` (multiple records). Allowed batch data kinds for tools: `file`, `records`.

```bash
# 1. Find the tool
cargo-ai orchestration tool list
# → Extract tool.workflowUuid

# 2. Run with inline record data
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"company":"Acme Corp","domain":"acme.com","employee_count":500}'

# Or block until finished — returns the final run result without a separate poll step
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"company":"Acme Corp","domain":"acme.com","employee_count":500}' \
  --wait-until-finished
```

Run create response:

```json
{
  "run": {
    "uuid": "run-uuid",
    "workflowUuid": "...",
    "status": "pending",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

```bash
# 3. Poll run status every 2s
cargo-ai orchestration run get <run-uuid>
```

Poll until `status` is `success`, `error`, or `cancelled`:

```json
{
  "run": {
    "uuid": "run-uuid",
    "status": "success",
    "createdAt": "...",
    "finishedAt": "2025-01-15T10:00:05Z"
  }
}
```

## Upload a CSV file

Before running a tool on records from a file, you must upload the CSV first. The upload returns the `s3Filename` needed by batch commands.

```bash
cargo-ai workspace file upload --file-path ./my-companies.csv
```

Response:

```json
{
  "s3Filename": "abc123-my-companies.csv",
  "contentType": "text/csv",
  "name": "my-companies.csv"
}
```

You can also inspect which columns the file contains:

```bash
cargo-ai workspace file list-columns --s3-filename abc123-my-companies.csv
```

## Run a tool on records from a file

```bash
# 1. Find the tool
cargo-ai orchestration tool list
# → Extract tool.workflowUuid

# 2. Upload the CSV
cargo-ai workspace file upload --file-path ./my-companies.csv
# → Extract s3Filename from the response


# 3. Create the batch
cargo-ai orchestration batch create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"kind":"file","s3Filename":"<s3Filename>"}'
# → Extract batch.uuid

# 4. Poll until finished (repeat every 5s)
cargo-ai orchestration batch get <batch-uuid>
# → Done when .status is "success", "error", or "cancelled"
# → Extract batch.releaseUuid

# Or skip polling — block until finished and get the final batch result in one step
cargo-ai orchestration batch create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"kind":"file","s3Filename":"<s3Filename>"}' \
  --wait-until-finished
# → Returns the final batch result directly

# 5. Download results
cargo-ai orchestration batch download \
  --uuid <batch-uuid> \
  --output-node-slug end
```

## Monitor a tool's runs

```bash
# List recent runs
cargo-ai orchestration run list \
  --workflow-uuid <tool.workflowUuid> \
  --limit 20

# Running and pending runs
cargo-ai orchestration run list \
  --workflow-uuid <tool.workflowUuid> \
  --statuses running,pending

# Error runs
cargo-ai orchestration run list \
  --workflow-uuid <tool.workflowUuid> \
  --statuses error \
  --limit 10

# Count errors
cargo-ai orchestration run count \
  --workflow-uuid <tool.workflowUuid> \
  --statuses error
```

## Monitor running batches

```bash
# List all running batches for the tool
cargo-ai orchestration batch list \
  --workflow-uuids <tool.workflowUuid> \
  --statuses running

# Check a specific batch
cargo-ai orchestration batch get <batch-uuid>
```

## Cancel runs and batches

```bash
# Cancel specific runs
cargo-ai orchestration run cancel \
  --workflow-uuid <tool.workflowUuid> \
  --uuids <run-uuid-1>,<run-uuid-2>

# Cancel a batch (stops all remaining runs)
cargo-ai orchestration batch cancel <batch-uuid>
```

## Run with custom nodes (ad-hoc workflow)

The `--nodes` flag lets you run a custom node graph at runtime without modifying the tool's published definition. When using `--nodes`, you do not need to pass `--workflow-uuid` — the nodes define the entire workflow inline. Every graph needs a `start` node and an `end` node, linked via `childrenUuids`.

> See `nodes.md` for the full node creation guide — node kinds, native actions, config expressions, routing, and more examples.

Minimal example — start, enrich via connector, output:

```bash
cargo-ai orchestration run create \
  --data '{"domain":"acme.com"}' \
  --nodes '[
    {
      "uuid":"11111111-1111-4111-a111-111111111111","slug":"start","kind":"native","actionSlug":"start",
      "config":{},"childrenUuids":["22222222-2222-4222-a222-222222222222"],"fallbackOnFailure":false,
      "position":{"x":0,"y":0}
    },
    {
      "uuid":"22222222-2222-4222-a222-222222222222","slug":"enrich_company","kind":"connector",
      "integrationSlug":"clearbit","actionSlug":"enrichCompanyFromDomain",
      "connectorUuid":"<connector-uuid>",
      "config":{
        "domain":{"kind":"templateExpression","expression":"{{nodes.start.domain}}","instructTo":"none","fromRecipe":false}
      },
      "childrenUuids":["33333333-3333-4333-a333-333333333333"],"fallbackOnFailure":false,
      "position":{"x":0,"y":166}
    },
    {
      "uuid":"33333333-3333-4333-a333-333333333333","slug":"end","kind":"native","actionSlug":"end",
      "config":{
        "variables":[
          {"name":"company_name","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.enrich_company.name}}","instructTo":"none","fromRecipe":false}}
        ]
      },
      "childrenUuids":[],"fallbackOnFailure":false,
      "position":{"x":0,"y":332}
    }
  ]'
```

Validate before running:

```bash
cargo-ai orchestration node validate --nodes '[...]'
# → { "outcome": "valid" } or { "outcome": "notValid", "invalidNodes": [...] }
```

Custom node runs are polled the same way as regular runs:

```bash
cargo-ai orchestration run get <run-uuid>
```

### Common errors

| Error                         | Cause                                                | Fix                              |
| ----------------------------- | ---------------------------------------------------- | -------------------------------- |
| `startNodeNotFound`           | No node with `slug:"start"` and `actionSlug:"start"` | Add the required start node      |
| `invalidReleaseOrCustomNodes` | Both `--release-uuid` and `--nodes` provided         | Use one or the other, not both   |
| `nodesNotFound`               | `childrenUuids` references a UUID not in the array   | Verify all UUID cross-references |

## Run a tool multiple times on different records

```bash
# Run on first record
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"company":"Acme Corp","domain":"acme.com"}'

# Run on second record
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"company":"Globex Inc","domain":"globex.com"}'

# Poll each run separately
cargo-ai orchestration run get <run-uuid-1>
cargo-ai orchestration run get <run-uuid-2>
```

## End-to-end: use a template to run a tool

This example takes a "company-enrichment" tool template, fills in its connector placeholder, validates, and runs it on a single record.

```bash
# Step 1 — List available tool templates
cargo-ai orchestration template list
# → Find slug: "company-enrichment", kind: "tool"

# Step 2 — Get the template's node graph
cargo-ai orchestration template get company-enrichment
# → Copy the "nodes" array. It contains __REPLACE_WITH_CONNECTOR_UUID__ placeholders.

# Step 3 — Find your connector UUID
cargo-ai connection connector list
# → Find your Clearbit connector, extract uuid (e.g. "abc-123")

# Step 4 — Fill in placeholders and validate
cargo-ai orchestration node validate --nodes '[
  {
    "uuid": "44444444-4444-4444-a444-444444444444", "slug": "start", "kind": "native", "actionSlug": "start",
    "config": {}, "childrenUuids": ["55555555-5555-4555-a555-555555555555"], "fallbackOnFailure": false,
    "position": {"x": 0, "y": 0}
  },
  {
    "uuid": "55555555-5555-4555-a555-555555555555", "slug": "enrich_company", "kind": "connector",
    "integrationSlug": "clearbit", "actionSlug": "enrichCompanyFromDomain",
    "connectorUuid": "abc-123",
    "config": {
      "domain": {
        "kind": "templateExpression",
        "expression": "{{nodes.start.domain}}",
        "instructTo": "none",
        "fromRecipe": false
      }
    },
    "childrenUuids": ["66666666-6666-4666-a666-666666666666"], "fallbackOnFailure": false,
    "position": {"x": 0, "y": 166}
  },
  {
    "uuid": "66666666-6666-4666-a666-666666666666", "slug": "end", "kind": "native", "actionSlug": "end",
    "config": {
      "variables": [
        {"name": "company_name", "type": "string", "value": {"kind": "templateExpression", "expression": "{{nodes.enrich_company.name}}", "instructTo": "none", "fromRecipe": false}},
        {"name": "industry", "type": "string", "value": {"kind": "templateExpression", "expression": "{{nodes.enrich_company.category.industry}}", "instructTo": "none", "fromRecipe": false}},
        {"name": "employees", "type": "string", "value": {"kind": "templateExpression", "expression": "{{nodes.enrich_company.metrics.employeesRange}}", "instructTo": "none", "fromRecipe": false}}
      ]
    },
    "childrenUuids": [], "fallbackOnFailure": false,
    "position": {"x": 0, "y": 332}
  }
]'
# → { "outcome": "valid" }

# Step 5 — (Optional) Preview expression resolution without side effects
cargo-ai orchestration node compute \
  --node '{"uuid":"55555555-5555-4555-a555-555555555555","slug":"enrich_company","kind":"connector","integrationSlug":"clearbit","actionSlug":"enrichCompanyFromDomain","connectorUuid":"abc-123","config":{"domain":{"kind":"templateExpression","expression":"{{nodes.start.domain}}","instructTo":"none","fromRecipe":false}},"childrenUuids":["66666666-6666-4666-a666-666666666666"],"fallbackOnFailure":false,"position":{"x":0,"y":166}}' \
  --context '{"nodes":{"start":{"domain":"acme.com"}}}'
# → Shows resolved config: { "domain": "acme.com" }

# Step 6 — Find the tool's workflowUuid
cargo-ai orchestration tool list
# → Find "Company Enrichment", extract workflowUuid

# Step 7 — Run
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"domain":"acme.com"}' \
  --nodes '[...validated nodes from step 4...]'
# → Extract run.uuid

# Step 8 — Poll until done (every 2s)
cargo-ai orchestration run get <run-uuid>
# → Done when status is "success", "error", or "cancelled"
```
