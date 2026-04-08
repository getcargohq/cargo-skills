# Creating nodes

## What is a custom node graph?

A **node graph** is a directed acyclic graph of steps that defines a workflow. Each graph must have exactly one `start` node (entry point) and one `end` node (exit point). Intermediate nodes perform actions — enrichments, transformations, branching, AI calls, etc. — and are linked together via `childrenUuids`.

Pass a custom node graph to override a tool's deployed release:

```bash
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"domain":"acme.com"}' \
  --nodes '[...]'
```

Also works with `batch create --nodes`. Cannot be combined with `--release-uuid`.

**Always validate first** — use `node validate` to catch structural errors before running:

```bash
cargo-ai orchestration node validate --nodes '[...]'
```

## Node shape

Every node in the `--nodes` JSON array has these fields:

| Field               | Required | Description                                                                |
| ------------------- | -------- | -------------------------------------------------------------------------- |
| `uuid`              | yes      | Unique ID within the graph — must be a valid UUIDv4 (e.g. `"550e8400-e29b-41d4-a716-446655440000"`) |
| `slug`              | yes      | Human-readable identifier (`start` and `end` are reserved)                 |
| `kind`              | yes      | `native`, `connector`, `tool`, or `agent`                                  |
| `config`            | yes      | Action-specific configuration (`{}` for start)                             |
| `childrenUuids`     | yes      | UUIDs of downstream nodes — array length **must match** the `childrenCount` for the node's action (see native actions tables below) |
| `fallbackOnFailure` | yes      | Continue to the next node even if this one fails                           |
| `position`          | yes      | `{"x": 0, "y": 0}` — layout only, no runtime effect                        |
| `fallbackChildUuid` | no       | UUID of a fallback node to run on failure                                  |
| `retry`             | no       | `{"maximumAttempts": 3, "initialInterval": 1000, "backoffCoefficient": 2}` |
| `name`              | no       | Display name                                                               |
| `description`       | no       | Description                                                                |

## Node kinds

Each kind requires additional fields beyond the common shape.

### `native`

Built-in workflow actions (start, end, branch, filter, variables, etc.).

| Field        | Required | Description                |
| ------------ | -------- | -------------------------- |
| `actionSlug` | yes      | Which native action to run |

### `connector`

Third-party integration actions (Clearbit, HubSpot, HTTP, etc.). Discover identifiers first:

```bash
cargo-ai connection integration list                    # → integrationSlug
cargo-ai connection integration get-documentation <slug> # → actionSlug + config fields
cargo-ai connection connector list                       # → connectorUuid
```

| Field             | Required | Description                              |
| ----------------- | -------- | ---------------------------------------- |
| `integrationSlug` | yes      | Integration identifier (e.g. `clearbit`) |
| `actionSlug`      | yes      | Action within the integration            |
| `connectorUuid`   | yes      | Your connected account UUID              |

`childrenCount` for connector nodes equals the integration action's `children` array length if defined, otherwise defaults to **1**. Most connector actions have exactly 1 child.

### `tool`

Embeds another tool (sub-workflow) as a node. The tool's deployed release config fields become the node's `config`.

| Field          | Required | Description                                              |
| -------------- | -------- | -------------------------------------------------------- |
| `toolUuid`     | no       | Target tool UUID — get from `cargo-ai orchestration tool list` |
| `templateSlug` | no       | Template slug — use when instantiating from a template   |
| `releaseUuid`  | no       | Pin to a specific release of the tool                    |

Provide at least one of `toolUuid` or `templateSlug`. `childrenCount` is **1**.

```bash
# Find toolUuid
cargo-ai orchestration tool list
# → Extract tool.uuid
```

### `agent`

Embeds a saved AI agent as a node. The agent runs to completion and its output is available to downstream nodes.

| Field          | Required | Description                                          |
| -------------- | -------- | ---------------------------------------------------- |
| `agentUuid`    | no       | Target agent UUID — get from `cargo-ai ai agent list` |
| `templateSlug` | no       | Template slug — use when instantiating from a template |
| `releaseUuid`  | no       | Pin to a specific release of the agent               |

Provide at least one of `agentUuid` or `templateSlug`. `childrenCount` is **1**.

```bash
# Find agentUuid
cargo-ai ai agent list
# → Extract agent.uuid
```

The `config` for an `agent` node takes two fields:

| Field    | Description                                                            |
| -------- | ---------------------------------------------------------------------- |
| `prompt` | The user message sent to the agent — string or expression object       |
| `output` | How to parse the agent's response — `{ type: "text" }` or `{ type: "jsonSchema", jsonSchema: {...} }` |

`prompt` can be a plain string or an expression object:

```json
"prompt": "Summarize the company {{nodes.start.domain}}"
```

```json
"prompt": {
  "kind": "templateExpression",
  "expression": "Classify {{nodes.start.company}} into a category",
  "instructTo": "none",
  "fromRecipe": false
}
```

`output` is a discriminated union on `type`:

| `output.type`  | Additional field                  | Description                              |
| -------------- | --------------------------------- | ---------------------------------------- |
| `"text"`       | *(none)*                          | Returns the agent's raw text response    |
| `"jsonSchema"` | `jsonSchema` — a JSON Schema object | Forces structured JSON output matching the schema |

```json
"output": { "type": "text" }
```

```json
"output": {
  "type": "jsonSchema",
  "jsonSchema": {
    "type": "object",
    "properties": {
      "category": { "type": "string" },
      "confidence": { "type": "number" }
    },
    "required": ["category", "confidence"],
    "additionalProperties": false
  }
}
```

## Config values and expressions

Config fields that need dynamic data use **expression objects**:

```json
{
  "kind": "templateExpression",
  "expression": "{{nodes.start.domain}}",
  "instructTo": "none",
  "fromRecipe": false
}
```

| Field        | Values                                   | Description                                                                                 |
| ------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `kind`       | `"templateExpression"`, `"jsExpression"` | Template expressions use `{{...}}` syntax; JS expressions are raw JS                        |
| `expression` | string                                   | The expression to evaluate                                                                  |
| `instructTo` | `"none"`, `"ai"`                         | `"none"` = JS evaluation; `"ai"` = AI fills the value from the expression as an instruction |
| `fromRecipe` | boolean                                  | `false` for inline expressions                                                              |

### Data flow

Each node's output is stored under its slug. Reference it in downstream nodes with `{{nodes.<slug>.<field>}}`.

```
{{nodes.start.domain}}                        — input data field
{{nodes.enrich_company.name}}                 — output from the "enrich_company" node
{{nodes.enrich_company.metrics.employeesRange}} — nested field access
{{nodes.start.email.split('@')[1]}}           — JS expressions work inside {{ }}
```

Inside a `group` loop, use `{{parentNodes.<slug>.<field>}}` to access the parent run's context.

### Static values

For config fields that don't need expressions, pass the value directly:

```json
{ "minutes": 5 }
```

## Native actions reference

These are the `actionSlug` values available for `kind: "native"` nodes.

### Workflow entry/exit

| actionSlug | Purpose                   | childrenCount | Config                                       |
| ---------- | ------------------------- | -------- | -------------------------------------------- |
| `start`    | Entry point               | 1        | `{}`                                         |
| `end`      | Exit point, define output | 0        | `{"variables": [{"name", "type", "value"}]}` |

The `end` node's `variables` array defines the workflow output. Each variable has:

- `name` — output field name
- `type` — `"string"`, `"number"`, `"boolean"`, `"date"`, `"array"`, `"object"`, or `"any"`
- `value` — an expression object or static value

### Routing

| actionSlug | Purpose               | childrenCount | Config                                                                     |
| ---------- | --------------------- | -------- | -------------------------------------------------------------------------- |
| `filter`   | Continue only if true | 1        | `{"filter": <bool-expression>}`                                            |
| `branch`   | If/else split         | 2        | `{"condition": <bool-expression>}`                                         |
| `switch`   | Multi-way routing     | dynamic  | `{"routes": [{"name": "...", "uuid": "...", "value": <bool-expression>}]}` |
| `split`    | Random A/B split      | 2        | `{"percentage": <0-100>}`                                                  |

**`childrenUuids` ordering matters:**

- **`branch`**: index 0 = condition matched ("yes"), index 1 = not matched ("no")
- **`filter`**: index 0 = condition true (execution stops if false — no child called)
- **`switch`**: first route whose `value` evaluates to `true` wins; its index in the `routes` array determines which `childrenUuids` entry to follow
- **`split`**: index 0 = random number < percentage ("A"), index 1 = otherwise ("B")

### Data

| actionSlug  | Purpose               | childrenCount | Config                                                                   |
| ----------- | --------------------- | -------- | ------------------------------------------------------------------------ |
| `variables` | Create/transform data | 1        | `{"variables": [{"name": "...", "type": "...", "value": <expression>}]}` |

Same shape as `end` variables, but the output is available to downstream nodes via `{{nodes.<slug>.<name>}}`.

### Flow control

| actionSlug | Purpose               | childrenCount | Config                                                      |
| ---------- | --------------------- | -------- | ----------------------------------------------------------- |
| `delay`    | Wait before next node | 1        | `{"minutes": <number>}`                                     |
| `group`    | Loop over array items | 1        | `{"items": <array-expression>, "failOnItemFailure": false, "_nodes": [...]}` |

The `group` node iterates over `items`, running the child subgraph once per item. Each iteration can access the current item via `{{nodes.start.value}}` (for simple values) or `{{nodes.start.<field>}}` (for object items). Use `{{parentNodes.<slug>.<field>}}` to reference the parent run's data.

**Group sub-graph (`_nodes`):** The `_nodes` array inside the group's config defines the internal workflow executed for each item. It follows the **exact same rules** as a top-level node graph:

- Must have a `start` node and an `end` node
- Every node's `childrenUuids` must contain **exactly the number of entries shown in the `childrenCount` column** of the native actions tables above (e.g. `start` → 1, `variables` → 1, `branch` → 2, `end` → 0). This rule applies identically at both the top level and inside `_nodes`
- The `end` node must have `childrenUuids: []`
- Reference the current item with `{{nodes.start.value}}` or `{{nodes.start.<field>}}`
- Reference parent workflow data with `{{parentNodes.<slug>.<field>}}`

**Important:** Do NOT leave the last sub-node with `childrenUuids: []` unless it is the `end` node. Every other node type (variables, connector, tool, agent, etc.) requires exactly 1 child. Always terminate the sub-graph with an explicit `end` node.

### AI and code

| actionSlug | Purpose             | childrenCount | Config                                                                                                 |
| ---------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `agent`    | Inline AI agent     | 1        | `{"prompt": "...", "advancedSettings": {"connectorUuid": "...", "languageModelSlug": "gpt-4.1-mini"}}` |
| `python`   | Run Python code     | 1        | `{"script": "..."}`                                                                                    |
| `script`   | Run JavaScript code | 1        | `{"script": "..."}`                                                                                    |

The `agent` action requires `advancedSettings.connectorUuid` (an AI provider connector — get it from `connector list`). Optional fields: `tools`, `resources`, `capabilities`, `output` (structured output with `{"type": "jsonSchema", "jsonSchema": {...}}`), `advancedSettings.temperature`, `advancedSettings.maxSteps`, `advancedSettings.systemPrompt`.

The `python` and `script` nodes receive `nodes` and `parentNodes` as context variables. The return value of the script becomes the node's output under `{{nodes.<slug>.result}}`.

## Examples

### Connector node: enrich then output

```bash
# 1. Discover integration, action, and connector
cargo-ai connection integration list
cargo-ai connection integration get-documentation clearbit
cargo-ai connection connector list

# 2. Run with custom nodes
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
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
          {"name":"company_name","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.enrich_company.name}}","instructTo":"none","fromRecipe":false}},
          {"name":"employee_count","type":"number","value":{"kind":"templateExpression","expression":"{{nodes.enrich_company.metrics.employeesRange}}","instructTo":"none","fromRecipe":false}}
        ]
      },
      "childrenUuids":[],"fallbackOnFailure":false,
      "position":{"x":0,"y":332}
    }
  ]'
```

### Tool node: call a sub-tool

```bash
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"first_name":"Jane","last_name":"Doe","company_domain":"acme.com"}' \
  --nodes '[
    {
      "uuid":"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa","slug":"start","kind":"native","actionSlug":"start",
      "config":{},"childrenUuids":["bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"],"fallbackOnFailure":false,
      "position":{"x":0,"y":0}
    },
    {
      "uuid":"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb","slug":"find_email","kind":"tool",
      "toolUuid":"<email-finder-tool-uuid>",
      "config":{
        "first_name":{"kind":"templateExpression","expression":"{{nodes.start.first_name}}","instructTo":"none","fromRecipe":false},
        "last_name":{"kind":"templateExpression","expression":"{{nodes.start.last_name}}","instructTo":"none","fromRecipe":false},
        "company_domain":{"kind":"templateExpression","expression":"{{nodes.start.company_domain}}","instructTo":"none","fromRecipe":false}
      },
      "childrenUuids":["cccccccc-cccc-4ccc-accc-cccccccccccc"],"fallbackOnFailure":false,
      "position":{"x":0,"y":166}
    },
    {
      "uuid":"cccccccc-cccc-4ccc-accc-cccccccccccc","slug":"end","kind":"native","actionSlug":"end",
      "config":{
        "variables":[
          {"name":"email","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.find_email.email}}","instructTo":"none","fromRecipe":false}}
        ]
      },
      "childrenUuids":[],"fallbackOnFailure":false,
      "position":{"x":0,"y":332}
    }
  ]'
```

### Branch node: if/else routing

Route based on employee count — enrich large companies, skip small ones.

```bash
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"domain":"acme.com","employee_count":500}' \
  --nodes '[
    {
      "uuid":"d1d1d1d1-d1d1-4d1d-ad1d-d1d1d1d1d1d1","slug":"start","kind":"native","actionSlug":"start",
      "config":{},"childrenUuids":["d2d2d2d2-d2d2-4d2d-ad2d-d2d2d2d2d2d2"],"fallbackOnFailure":false,
      "position":{"x":0,"y":0}
    },
    {
      "uuid":"d2d2d2d2-d2d2-4d2d-ad2d-d2d2d2d2d2d2","slug":"check_size","kind":"native","actionSlug":"branch",
      "config":{
        "condition":{"kind":"templateExpression","expression":"{{nodes.start.employee_count > 100}}","instructTo":"none","fromRecipe":false}
      },
      "childrenUuids":["d3d3d3d3-d3d3-4d3d-ad3d-d3d3d3d3d3d3","d4d4d4d4-d4d4-4d4d-ad4d-d4d4d4d4d4d4"],"fallbackOnFailure":false,
      "position":{"x":0,"y":166}
    },
    {
      "uuid":"d3d3d3d3-d3d3-4d3d-ad3d-d3d3d3d3d3d3","slug":"enrich","kind":"connector",
      "integrationSlug":"clearbit","actionSlug":"enrichCompanyFromDomain",
      "connectorUuid":"<connector-uuid>",
      "config":{
        "domain":{"kind":"templateExpression","expression":"{{nodes.start.domain}}","instructTo":"none","fromRecipe":false}
      },
      "childrenUuids":["d5d5d5d5-d5d5-4d5d-ad5d-d5d5d5d5d5d5"],"fallbackOnFailure":false,
      "position":{"x":-200,"y":332}
    },
    {
      "uuid":"d4d4d4d4-d4d4-4d4d-ad4d-d4d4d4d4d4d4","slug":"skip","kind":"native","actionSlug":"end",
      "config":{"variables":[
        {"name":"status","type":"string","value":"skipped_too_small"}
      ]},
      "childrenUuids":[],"fallbackOnFailure":false,
      "position":{"x":200,"y":332}
    },
    {
      "uuid":"d5d5d5d5-d5d5-4d5d-ad5d-d5d5d5d5d5d5","slug":"end","kind":"native","actionSlug":"end",
      "config":{"variables":[
        {"name":"company_name","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.enrich.name}}","instructTo":"none","fromRecipe":false}},
        {"name":"status","type":"string","value":"enriched"}
      ]},
      "childrenUuids":[],"fallbackOnFailure":false,
      "position":{"x":-200,"y":498}
    }
  ]'
```

`childrenUuids[0]` (`d3d3d3d3-...`) is the "yes" path, `childrenUuids[1]` (`d4d4d4d4-...`) is the "no" path.

### Filter + variables: transform and continue conditionally

```bash
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"email":"jane@acme.com","company":"Acme Corp"}' \
  --nodes '[
    {
      "uuid":"e1e1e1e1-e1e1-4e1e-ae1e-e1e1e1e1e1e1","slug":"start","kind":"native","actionSlug":"start",
      "config":{},"childrenUuids":["e2e2e2e2-e2e2-4e2e-ae2e-e2e2e2e2e2e2"],"fallbackOnFailure":false,
      "position":{"x":0,"y":0}
    },
    {
      "uuid":"e2e2e2e2-e2e2-4e2e-ae2e-e2e2e2e2e2e2","slug":"has_email","kind":"native","actionSlug":"filter",
      "config":{
        "filter":{"kind":"templateExpression","expression":"{{nodes.start.email !== undefined && nodes.start.email !== null}}","instructTo":"none","fromRecipe":false}
      },
      "childrenUuids":["e3e3e3e3-e3e3-4e3e-ae3e-e3e3e3e3e3e3"],"fallbackOnFailure":false,
      "position":{"x":0,"y":166}
    },
    {
      "uuid":"e3e3e3e3-e3e3-4e3e-ae3e-e3e3e3e3e3e3","slug":"extract","kind":"native","actionSlug":"variables",
      "config":{
        "variables":[
          {"name":"domain","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.start.email.split('@')[1]}}","instructTo":"none","fromRecipe":false}},
          {"name":"company","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.start.company}}","instructTo":"none","fromRecipe":false}}
        ]
      },
      "childrenUuids":["e4e4e4e4-e4e4-4e4e-ae4e-e4e4e4e4e4e4"],"fallbackOnFailure":false,
      "position":{"x":0,"y":332}
    },
    {
      "uuid":"e4e4e4e4-e4e4-4e4e-ae4e-e4e4e4e4e4e4","slug":"end","kind":"native","actionSlug":"end",
      "config":{
        "variables":[
          {"name":"domain","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.extract.domain}}","instructTo":"none","fromRecipe":false}},
          {"name":"company","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.extract.company}}","instructTo":"none","fromRecipe":false}}
        ]
      },
      "childrenUuids":[],"fallbackOnFailure":false,
      "position":{"x":0,"y":498}
    }
  ]'
```

If `email` is null/undefined the filter stops execution — no downstream nodes run.

### Agent node: inline AI with structured output

```bash
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"company":"Acme Corp","website":"https://acme.com"}' \
  --nodes '[
    {
      "uuid":"f1f1f1f1-f1f1-4f1f-af1f-f1f1f1f1f1f1","slug":"start","kind":"native","actionSlug":"start",
      "config":{},"childrenUuids":["f2f2f2f2-f2f2-4f2f-af2f-f2f2f2f2f2f2"],"fallbackOnFailure":false,
      "position":{"x":0,"y":0}
    },
    {
      "uuid":"f2f2f2f2-f2f2-4f2f-af2f-f2f2f2f2f2f2","slug":"classify","kind":"native","actionSlug":"agent",
      "config":{
        "prompt":{"kind":"templateExpression","expression":"Classify the company {{nodes.start.company}} ({{nodes.start.website}}) into one of these categories: SaaS, E-commerce, Marketplace, Services, Hardware, Other. Return the category and a one-sentence reasoning.","instructTo":"none","fromRecipe":false},
        "output":{
          "type":"jsonSchema",
          "jsonSchema":{
            "type":"object",
            "properties":{
              "category":{"type":"string","enum":["SaaS","E-commerce","Marketplace","Services","Hardware","Other"]},
              "reasoning":{"type":"string"}
            },
            "required":["category","reasoning"],
            "additionalProperties":false
          }
        },
        "advancedSettings":{
          "connectorUuid":"<openai-connector-uuid>",
          "languageModelSlug":"gpt-4.1-mini",
          "temperature":0.3,
          "maxSteps":5
        }
      },
      "childrenUuids":["f3f3f3f3-f3f3-4f3f-af3f-f3f3f3f3f3f3"],"fallbackOnFailure":false,
      "position":{"x":0,"y":166}
    },
    {
      "uuid":"f3f3f3f3-f3f3-4f3f-af3f-f3f3f3f3f3f3","slug":"end","kind":"native","actionSlug":"end",
      "config":{
        "variables":[
          {"name":"category","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.classify.category}}","instructTo":"none","fromRecipe":false}},
          {"name":"reasoning","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.classify.reasoning}}","instructTo":"none","fromRecipe":false}}
        ]
      },
      "childrenUuids":[],"fallbackOnFailure":false,
      "position":{"x":0,"y":332}
    }
  ]'
```

### Python node: custom data transformation

```bash
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"name":"ACME CORP","domain":"  Acme.COM  "}' \
  --nodes '[
    {
      "uuid":"a1a1a1a1-a1a1-4a1a-aa1a-a1a1a1a1a1a1","slug":"start","kind":"native","actionSlug":"start",
      "config":{},"childrenUuids":["a2a2a2a2-a2a2-4a2a-aa2a-a2a2a2a2a2a2"],"fallbackOnFailure":false,
      "position":{"x":0,"y":0}
    },
    {
      "uuid":"a2a2a2a2-a2a2-4a2a-aa2a-a2a2a2a2a2a2","slug":"normalize","kind":"native","actionSlug":"python",
      "config":{
        "script":"name = nodes[\"start\"][\"name\"]\ndomain = nodes[\"start\"][\"domain\"]\nresult = {\"name\": name.strip().title(), \"domain\": domain.strip().lower()}"
      },
      "childrenUuids":["a3a3a3a3-a3a3-4a3a-aa3a-a3a3a3a3a3a3"],"fallbackOnFailure":false,
      "position":{"x":0,"y":166}
    },
    {
      "uuid":"a3a3a3a3-a3a3-4a3a-aa3a-a3a3a3a3a3a3","slug":"end","kind":"native","actionSlug":"end",
      "config":{
        "variables":[
          {"name":"name","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.normalize.result.name}}","instructTo":"none","fromRecipe":false}},
          {"name":"domain","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.normalize.result.domain}}","instructTo":"none","fromRecipe":false}}
        ]
      },
      "childrenUuids":[],"fallbackOnFailure":false,
      "position":{"x":0,"y":332}
    }
  ]'
```

Python scripts receive `nodes` and `parentNodes` dicts. Set `result` to define the node output, accessible via `{{nodes.<slug>.result}}`.

### Group node: loop over items

Process each item in an array through a sub-workflow. The group node creates a child batch, running the inner graph once per item. The `_nodes` array inside the group config defines the sub-graph executed per item — it must have its own `start` and `end` nodes, just like a top-level workflow.

```bash
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"domains":["acme.com","globex.com","initech.com"]}' \
  --nodes '[
    {
      "uuid":"b1b1b1b1-b1b1-4b1b-ab1b-b1b1b1b1b1b1","slug":"start","kind":"native","actionSlug":"start",
      "config":{},"childrenUuids":["b2b2b2b2-b2b2-4b2b-ab2b-b2b2b2b2b2b2"],"fallbackOnFailure":false,
      "position":{"x":0,"y":0}
    },
    {
      "uuid":"b2b2b2b2-b2b2-4b2b-ab2b-b2b2b2b2b2b2","slug":"loop","kind":"native","actionSlug":"group",
      "config":{
        "items":{"kind":"templateExpression","expression":"{{nodes.start.domains}}","instructTo":"none","fromRecipe":false},
        "failOnItemFailure":false,
        "_nodes":[
          {
            "uuid":"b2a1a1a1-a1a1-4a1a-aa1a-a1a1a1a1a1a1","slug":"start","kind":"native","actionSlug":"start",
            "config":{},"childrenUuids":["b2a2a2a2-a2a2-4a2a-aa2a-a2a2a2a2a2a2"],"fallbackOnFailure":false,
            "position":{"x":0,"y":0}
          },
          {
            "uuid":"b2a2a2a2-a2a2-4a2a-aa2a-a2a2a2a2a2a2","slug":"enrich","kind":"connector",
            "integrationSlug":"clearbit","actionSlug":"enrichCompanyFromDomain",
            "connectorUuid":"<connector-uuid>",
            "config":{
              "domain":{"kind":"templateExpression","expression":"{{nodes.start.value}}","instructTo":"none","fromRecipe":false}
            },
            "childrenUuids":["b2a3a3a3-a3a3-4a3a-aa3a-a3a3a3a3a3a3"],"fallbackOnFailure":false,
            "position":{"x":0,"y":160}
          },
          {
            "uuid":"b2a3a3a3-a3a3-4a3a-aa3a-a3a3a3a3a3a3","slug":"end","kind":"native","actionSlug":"end",
            "config":{"variables":[
              {"name":"company_name","type":"string","value":{"kind":"templateExpression","expression":"{{nodes.enrich.name}}","instructTo":"none","fromRecipe":false}}
            ]},
            "childrenUuids":[],"fallbackOnFailure":false,
            "position":{"x":0,"y":320}
          }
        ]
      },
      "childrenUuids":["b3b3b3b3-b3b3-4b3b-ab3b-b3b3b3b3b3b3"],"fallbackOnFailure":false,
      "position":{"x":0,"y":166}
    },
    {
      "uuid":"b3b3b3b3-b3b3-4b3b-ab3b-b3b3b3b3b3b3","slug":"end","kind":"native","actionSlug":"end",
      "config":{"variables":[]},
      "childrenUuids":[],"fallbackOnFailure":false,
      "position":{"x":0,"y":332}
    }
  ]'
```

Each iteration receives the current item as its start data (`{{nodes.start.value}}` for simple values, `{{nodes.start.<field>}}` for object items). Use `{{parentNodes.start.domains}}` inside the loop to access the parent run's data.

**Sub-graph rules:** The `_nodes` array is a complete node graph — it must have `start` and `end` nodes. Every intermediate node must chain to the next via `childrenUuids`. The `end` node is the only node that should have `childrenUuids: []`.

## Validation

Always validate before running. The command checks for structural errors (missing start/end, broken UUID references, invalid connectors, etc.).

```bash
cargo-ai orchestration node validate \
  --nodes '[
    {
      "uuid":"c1c1c1c1-c1c1-4c1c-ac1c-c1c1c1c1c1c1","slug":"start","kind":"native","actionSlug":"start",
      "config":{},"childrenUuids":["c2c2c2c2-c2c2-4c2c-ac2c-c2c2c2c2c2c2"],"fallbackOnFailure":false,
      "position":{"x":0,"y":0}
    },
    {
      "uuid":"c2c2c2c2-c2c2-4c2c-ac2c-c2c2c2c2c2c2","slug":"end","kind":"native","actionSlug":"end",
      "config":{"variables":[]},"childrenUuids":[],"fallbackOnFailure":false,
      "position":{"x":0,"y":166}
    }
  ]'
```

Success:

```json
{ "outcome": "valid" }
```

Error:

```json
{
  "outcome": "notValid",
  "invalidNodes": [
    {
      "node": { "uuid": "22222222-2222-4222-a222-222222222222", "slug": "enrich_company" },
      "reason": "connectorNotFound"
    }
  ]
}
```

### Common validation errors

| Error                         | Cause                                                | Fix                                 |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------- |
| `startNodeNotFound`           | No node with `slug:"start"` and `actionSlug:"start"` | Add the required start node         |
| `invalidReleaseOrCustomNodes` | Both `--release-uuid` and `--nodes` provided         | Use one or the other, not both      |
| `nodesNotFound`               | `childrenUuids` references a UUID not in the array   | Verify all UUID cross-references    |
| `childrenUuidsInvalid`        | Wrong number of entries in `childrenUuids`            | Check the `childrenCount` column in the native actions tables — each node type requires an exact count (e.g. `variables` needs 1, `end` needs 0, `branch` needs 2). Inside a group's `_nodes`, the last node must be an `end` node (`childrenUuids: []`), not a `variables` or connector node with an empty array |
| `subNodesInvalid`             | A group node's `_nodes` sub-graph has invalid nodes  | Check the nested `invalidNodes` array for details — the sub-graph must follow the same rules as a top-level graph (start + end nodes, correct childrenUuids counts) |
| `connectorNotFound`           | `connectorUuid` doesn't match an active connector    | Check `connector list` for the UUID |
| `nativeInvalid`               | `actionSlug` doesn't match a known native action     | Check the native actions table      |
| `toolInvalid`                 | `toolUuid` doesn't match an existing tool            | Check `tool list` for the UUID      |
| `slugInvalid`                 | Slug contains non-word characters                    | Use only `[a-zA-Z0-9_]`             |

## Node compute

`node compute` evaluates a node's config expressions against a context **without executing any side effects** — no API calls, no credits consumed. Use it to preview what a node's config will resolve to before running it.

```bash
cargo-ai orchestration node compute \
  --node '{
    "uuid": "22222222-2222-4222-a222-222222222222",
    "slug": "enrich_company",
    "kind": "connector",
    "integrationSlug": "clearbit",
    "actionSlug": "enrichCompanyFromDomain",
    "connectorUuid": "<connector-uuid>",
    "config": {
      "domain": {
        "kind": "templateExpression",
        "expression": "{{nodes.start.domain}}",
        "instructTo": "none",
        "fromRecipe": false
      }
    },
    "childrenUuids": ["33333333-3333-4333-a333-333333333333"],
    "fallbackOnFailure": false,
    "position": {"x": 0, "y": 166}
  }' \
  --context '{"nodes": {"start": {"domain": "acme.com"}}}'
```

The `--context` object mirrors what nodes receive at runtime — `nodes.<slug>.<field>` for data from previous nodes. Inside a `group` loop, also pass `groupContext`.

Response shows the resolved config values that would be sent to the connector or action.

## Node execute

`node execute` runs a **single node** in isolation with real side effects — it makes the actual API call (connector, tool, or agent). Use it to test one node without running the full workflow.

> **Note:** `node execute` consumes credits. It is a live execution, not a dry run.

```bash
cargo-ai orchestration node execute \
  --workflow-uuid <tool.workflowUuid> \
  --node '{
    "uuid": "22222222-2222-4222-a222-222222222222",
    "slug": "enrich_company",
    "kind": "connector",
    "integrationSlug": "clearbit",
    "actionSlug": "enrichCompanyFromDomain",
    "connectorUuid": "<connector-uuid>",
    "config": {
      "domain": {
        "kind": "templateExpression",
        "expression": "{{nodes.start.domain}}",
        "instructTo": "none",
        "fromRecipe": false
      }
    },
    "childrenUuids": [],
    "fallbackOnFailure": false,
    "position": {"x": 0, "y": 166}
  }' \
  --computed-config '{
    "domain": "acme.com"
  }' \
  --context '{"nodes": {"start": {"domain": "acme.com"}}}'
```

**`--computed-config`** — the already-resolved config values (output of `node compute`). If you skip this, the CLI resolves expressions from `--context` automatically.

**`--release-uuid`** — optional; pins the execution to a specific workflow release.

### Recommended debug workflow

1. **Validate structure** — `node validate --nodes '[...]'` — catches structural errors
2. **Preview expressions** — `node compute --node '{...}' --context '{...}'` — check resolved values
3. **Test live** — `node execute --node '{...}' --computed-config '{...}' --context '{...}'` — confirm real output
4. **Run full graph** — `run create --nodes '[...]'` — execute the complete workflow

## Polling

Custom node runs are polled the same way as regular runs:

```bash
cargo-ai orchestration run get <run-uuid>
# Poll every 2s until status is success, error, or cancelled
```
