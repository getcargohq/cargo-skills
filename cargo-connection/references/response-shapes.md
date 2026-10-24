# Response shapes

JSON response structures returned by Cargo CLI commands used in the `cargo-connection` skill.

## cargo-ai connection connector list

```json
{
  "connectors": [
    {
      "uuid": "connector-uuid",
      "workspaceUuid": "...",
      "userUuid": "...",
      "name": "Clearbit - Production",
      "slug": "clearbit_production",
      "integrationSlug": "clearbit",
      "rateLimit": { "unit": "day", "max": 1000 },
      "cacheTtlMilliseconds": 86400000,
      "playsCount": 2,
      "toolsCount": 5,
      "modelsCount": 0,
      "useCredits": true,
      "isManaged": true,
      "config": null,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z",
      "deletedAt": null
    }
  ]
}
```

**Key fields:** `uuid`, `name`, `integrationSlug`, `useCredits`, `isManaged`, `playsCount`, `toolsCount`.

- `useCredits`: actions on this connector are billed in Cargo credits.
- `isManaged`: the connector runs on Cargo's own provider keys, so `config` is `null`. When `false`, `config` holds the integration-specific credentials.

The two usually match. They differ on an integration whose provider bills Cargo per call even on the user's own sign-in (X Account): its connectors are `useCredits: true`, `isManaged: false`.

## cargo-ai connection connector get

```json
{
  "connector": {
    "uuid": "connector-uuid",
    "workspaceUuid": "...",
    "userUuid": "...",
    "name": "Clearbit - Production",
    "slug": "clearbit_production",
    "integrationSlug": "clearbit",
    "rateLimit": { "unit": "day", "max": 1000 },
    "cacheTtlMilliseconds": 86400000,
    "playsCount": 2,
    "toolsCount": 5,
    "modelsCount": 0,
    "useCredits": true,
    "isManaged": true,
    "config": null,
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-15T00:00:00Z",
    "deletedAt": null
  }
}
```

Same shape as a single item from `connector list`.

## cargo-ai connection integration list

Each integration in the list is a full integration object (same shape as `integration get`).

```json
{
  "integrations": [
    {
      "slug": "clearbit",
      "name": "Clearbit",
      "description": "Company and person enrichment",
      "category": "enrichment",
      "icon": "https://...",
      "color": "#...",
      "url": "https://...",
      "subCategories": [],
      "documentationPath": "...",
      "connector": { "config": { "jsonSchema": { ... } } },
      "actions": { "enrichCompany": { ... } },
      "extractors": {},
      "dynamicSchemas": {}
    }
  ]
}
```

**Key fields:** `slug` (used when creating connectors and filtering), `name`, `category`, `actions`, `extractors`.

Supports `--category`, `--slugs`, `--search`, `--has-actions`, `--has-extractors` to filter results.

**Integration categories:** `engagement`, `marketing`, `sales`, `finance`, `analytics`, `freeform`, `success`, `support`, `enrichment`, `storage`, `custom`.

## cargo-ai connection integration get

Returns the full integration object, including all actions and extractors with their configuration schemas.

```json
{
  "integration": {
    "slug": "clearbit",
    "name": "Clearbit",
    "description": "Company and person enrichment",
    "category": "enrichment",
    "icon": "https://...",
    "color": "#...",
    "url": "https://...",
    "subCategories": [],
    "documentationPath": "...",
    "connector": {
      "config": {
        "jsonSchema": { "type": "object", "properties": { "apiKey": { "type": "string" } } }
      },
      "managed": { "isCompatible": true }
    },
    "actions": {
      "enrichCompany": {
        "name": "Enrich Company",
        "description": "Enrich a company by domain",
        "category": "enrichment",
        "icon": "https://...",
        "isSerialized": false,
        "config": {
          "jsonSchema": { "type": "object", "properties": { "domain": { "type": "string" } } }
        },
        "output": {
          "schema": {
            "type": "object",
            "properties": { "name": { "type": "string" }, "domain": { "type": "string" } }
          }
        },
        "credits": {
          "costs": [{ "type": "fixed", "cost": 1 }]
        },
        "childrenCount": 0
      },
      "findRecords": {
        "name": "Find records",
        "description": "Find records matching the given criterias.",
        "category": "enrichment",
        "icon": "https://...",
        "isSerialized": false,
        "config": {
          "jsonSchema": {
            "type": "object",
            "properties": {
              "objectType": { "type": "string", "description": "The object type" },
              "propertyName": { "type": "string", "description": "Property to search on" }
            }
          },
          "uiSchema": {
            "objectType": {
              "ui:widget": "IntegrationAutocompleteWidget",
              "ui:options": {
                "slug": "listObjects",
                "allowRefresh": true
              }
            },
            "propertyName": {
              "ui:widget": "IntegrationAutocompleteWidget",
              "ui:options": {
                "slug": "listObjectProperties",
                "allowRefresh": true,
                "params": {
                  "objectType": "$this.$parent.objectType"
                }
              }
            }
          }
        },
        "credits": {
          "costs": [{ "type": "fixed", "cost": 1 }]
        },
        "childrenCount": 0
      }
    },
    "extractors": {},
    "dynamicSchemas": {}
  }
}
```

**Key fields:** `actions` is keyed by `actionSlug` — use these in workflow connector nodes. Each action's `config.schema` is its **input** (`config.jsonSchema`, a form-UI copy, is present on some integrations only); `output.schema`, when present, is the JSON Schema of what the action **emits** — read it instead of guessing the output shape (not every action declares one; `integration list` includes it too). `connector.config.jsonSchema` describes the credentials needed when creating a connector (for non-credit integrations). `extractors` is keyed by extractor slug — use these when creating models.

**`uiSchema` and autocomplete:** Each action's `config` may include a `uiSchema` alongside `jsonSchema`. When a field in `uiSchema` has `"ui:widget": "IntegrationAutocompleteWidget"`, its allowed values must be fetched via `connector autocomplete`. The `ui:options.slug` tells you which autocomplete slug to use, and `ui:options.params` (if present) specifies dependent parameters — replace `$this.$parent...` expressions with actual values. See the main SKILL.md for the full autocomplete workflow.

## cargo-ai connection native-integration get

> **Note:** This command returns **built-in Cargo actions only** (e.g. `start`, `end`, `branch`, `filter`, `agent`, `python`). It does **not** return HubSpot, Salesforce, Clearbit, or other third-party connector actions. For those, use `cargo-ai connection integration get <slug>`.

```json
{
  "nativeIntegration": {
    "actions": {
      "sendEmail": {
        "name": "Send Email",
        "description": "Send an email via the native Cargo email action",
        "category": "email",
        "icon": "https://...",
        "isSerialized": false,
        "config": {
          "jsonSchema": { "type": "object", "properties": { "domain": { "type": "string" } } },
          "uiSchema": {}
        },
        "meta": {
          "jsonSchema": { "type": "object" }
        },
        "credits": {
          "costs": [{ "type": "fixed", "cost": 1 }]
        },
        "childrenCount": 0
      }
    },
    "extractors": {
      "contacts": {
        "name": "Contacts",
        "description": "Sync contacts from integration",
        "icon": "https://...",
        "config": {
          "jsonSchema": { "type": "object", "properties": {} },
          "uiSchema": {}
        },
        "mode": {
          "kind": "fetch",
          "isIncremental": true
        }
      }
    }
  }
}
```

**`actions`** is keyed by action slug. Each key is an `actionSlug` for use in workflow connector nodes.

| Field | Description |
| ----- | ----------- |
| `name` | Display name |
| `description` | What the action does |
| `category` | One of: `invisible`, `logic`, `storage`, `ai`, `sales`, `code`, `email`, `object` |
| `icon` | Icon URL |
| `config.schema` | JSON Schema describing the action's input parameters (`config.jsonSchema`, where present, is the same schema decorated for the form UI) |
| `config.uiSchema` | UI hints for each field — check for `IntegrationAutocompleteWidget` to detect autocomplete fields |
| `childrenCount` | Number of child branches (0 for most actions) |
| `credits.costs` | Credit cost per execution. Each cost has `type` (`fixed` or `unit`) and `cost` (number) |

On the integration itself, `connector.managed.isCompatible` says a connector can run on Cargo's keys (a managed connector, billed in credits). `connector.credits.isRequired` says every connector is billed in credits, even one holding its own credentials.

**`extractors`** is keyed by extractor slug. Extractors sync data from an integration into a model.

| Field | Description |
| ----- | ----------- |
| `name` | Display name |
| `description` | What the extractor syncs |
| `icon` | Icon URL |
| `config.jsonSchema` | JSON Schema describing the extractor's configuration |
| `mode.kind` | `"fetch"` (pull-based) or `"ingest"` (push-based) |
| `mode.isIncremental` | Whether the extractor supports incremental sync (fetch mode only) |

## cargo-ai connection connector autocomplete

Fetches the allowed values for a field that uses `IntegrationAutocompleteWidget` in its `uiSchema`.

```json
{
  "results": [
    {
      "label": "Contacts",
      "value": "contacts",
      "description": "HubSpot contacts object"
    },
    {
      "label": "Companies",
      "value": "companies"
    },
    {
      "label": "Deals",
      "value": "deals"
    }
  ]
}
```

| Field | Required | Description |
| ----- | -------- | ----------- |
| `label` | yes | Human-readable display name |
| `value` | yes | The value to use in node config |
| `description` | no | Additional context about the option |
| `parent` | no | Parent grouping identifier (for hierarchical options) |
| `configOverride` | no | Additional config values that should be set when this option is selected |

Use the `value` field when setting the corresponding property in a workflow node's `config`.
