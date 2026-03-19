# Orchestration templates

## What is a template?

A **template** is a pre-built workflow blueprint — a ready-to-use node graph you can apply when creating a play or tool. Templates capture common automation patterns (enrichment pipelines, CRM syncs, AI research flows) so you don't have to build nodes from scratch.

Templates are read-only. You discover them by slug, inspect their node graph and expected input schema, then use that graph as the `--nodes` value when creating a run or batch.

## List all templates

```bash
cargo-ai orchestration template list
```

Response:

```json
{
  "templates": [
    {
      "slug": "company-enrichment",
      "name": "Company Enrichment",
      "description": "Enrich a company record with firmographic data from Clearbit",
      "kind": "tool"
    },
    {
      "slug": "lead-scoring",
      "name": "Lead Scoring",
      "description": "Score inbound leads based on ICP fit",
      "kind": "play"
    }
  ]
}
```

Key fields:

- **`slug`** — identifier used to fetch the template
- **`name`** — human-readable name
- **`kind`** — `"tool"` (on-demand) or `"play"` (segment-driven)

## Get a template by slug

```bash
cargo-ai orchestration template get <slug>
```

Example:

```bash
cargo-ai orchestration template get company-enrichment
```

Response:

```json
{
  "template": {
    "slug": "company-enrichment",
    "name": "Company Enrichment",
    "description": "Enrich a company record with firmographic data from Clearbit",
    "kind": "tool",
    "nodes": [
      {
        "uuid": "44444444-4444-4444-a444-444444444444",
        "slug": "start",
        "kind": "native",
        "actionSlug": "start",
        "config": {},
        "childrenUuids": ["55555555-5555-4555-a555-555555555555"],
        "fallbackOnFailure": false,
        "position": { "x": 0, "y": 0 }
      },
      {
        "uuid": "55555555-5555-4555-a555-555555555555",
        "slug": "enrich_company",
        "kind": "connector",
        "integrationSlug": "clearbit",
        "actionSlug": "enrichCompanyFromDomain",
        "connectorUuid": "__REPLACE_WITH_CONNECTOR_UUID__",
        "config": {
          "domain": {
            "kind": "templateExpression",
            "expression": "{{nodes.start.domain}}",
            "instructTo": "none",
            "fromRecipe": false
          }
        },
        "childrenUuids": ["66666666-6666-4666-a666-666666666666"],
        "fallbackOnFailure": false,
        "position": { "x": 0, "y": 166 }
      },
      {
        "uuid": "66666666-6666-4666-a666-666666666666",
        "slug": "end",
        "kind": "native",
        "actionSlug": "end",
        "config": {
          "variables": [
            {
              "name": "company_name",
              "type": "string",
              "value": {
                "kind": "templateExpression",
                "expression": "{{nodes.enrich_company.name}}",
                "instructTo": "none",
                "fromRecipe": false
              }
            }
          ]
        },
        "childrenUuids": [],
        "fallbackOnFailure": false,
        "position": { "x": 0, "y": 332 }
      }
    ]
  }
}
```

## Use a template to run a tool

The standard pattern:

1. List templates to find the right slug
2. Get the template to inspect its nodes
3. Replace any `__REPLACE_WITH_*__` placeholders in the node graph
4. Validate the nodes before running
5. Run against a tool workflow

```bash
# 1. Find the template
cargo-ai orchestration template list
# → Find "company-enrichment"

# 2. Get the node graph
cargo-ai orchestration template get company-enrichment
# → Copy the "nodes" array, replace connectorUuid placeholders

# 3. Find your connector UUID
cargo-ai connection connector list
# → Find your Clearbit connector, extract its uuid

# 4. Validate the modified nodes
cargo-ai orchestration node validate --nodes '[...modified nodes...]'
# → { "outcome": "valid" }

# 5. Find the tool
cargo-ai orchestration tool list
# → Find your tool, extract workflowUuid

# 6. Run
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"domain":"acme.com"}' \
  --nodes '[...validated nodes...]'
# → Poll with: cargo-ai orchestration run get <run-uuid>
```

## Use a template to run a play

For `kind: "play"` templates, use `batch create` instead of `run create`:

```bash
# 1. Get the template
cargo-ai orchestration template get lead-scoring

# 2. Replace placeholders, validate
cargo-ai orchestration node validate --nodes '[...]'

# 3. Find the play's workflowUuid and segmentUuid
cargo-ai orchestration play list

# 4. Batch run on the play's segment
cargo-ai orchestration batch create \
  --workflow-uuid <play.workflowUuid> \
  --data '{"kind":"segment","segmentUuid":"<play.segmentUuid>"}' \
  --nodes '[...validated nodes...]'
# → Poll with: cargo-ai orchestration batch get <batch-uuid>
```

## Placeholder convention

Template node graphs use `__REPLACE_WITH_*__` strings to mark values that must be substituted before use:

| Placeholder                       | Replace with                                                    |
| --------------------------------- | --------------------------------------------------------------- |
| `__REPLACE_WITH_CONNECTOR_UUID__` | UUID from `cargo-ai connection connector list`                  |
| `__REPLACE_WITH_TOOL_UUID__`      | UUID from `cargo-ai orchestration tool list`                    |
| `__REPLACE_WITH_AGENT_UUID__`     | UUID from `cargo-ai ai agent list`                              |
| `__REPLACE_WITH_MODEL_UUID__`     | UUID from `cargo-ai storage model list`                         |

Always run `node validate` after substitution to confirm there are no structural errors.
