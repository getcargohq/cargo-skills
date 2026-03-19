# Response shapes

JSON response structures returned by Cargo CLI commands used in the `cargo-cli-connection` skill.

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
      "config": null,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z",
      "deletedAt": null
    }
  ]
}
```

**Key fields:** `uuid`, `name`, `integrationSlug`, `useCredits`, `playsCount`, `toolsCount`.

When `useCredits` is `true`, actions on this connector consume Cargo credits. When `false`, `config` contains the integration-specific credentials.

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
      "actions": { "enrichCompanyFromDomain": { ... } },
      "extractors": {},
      "dynamicSchemas": {}
    }
  ]
}
```

**Key fields:** `slug` (used when creating connectors and filtering), `name`, `category`, `actions`, `extractors`.

Supports `--category`, `--slug`, `--search`, `--has-actions`, `--has-extractors` to filter results.

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
      }
    },
    "actions": {
      "enrichCompanyFromDomain": {
        "name": "Enrich Company From Domain",
        "description": "Enrich a company by domain",
        "category": "enrichment",
        "icon": "https://...",
        "isSerialized": false,
        "config": {
          "jsonSchema": { "type": "object", "properties": { "domain": { "type": "string" } } }
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

**Key fields:** `actions` is keyed by `actionSlug` — use these in workflow connector nodes. `connector.config.jsonSchema` describes the credentials needed when creating a connector (for non-credit integrations). `extractors` is keyed by extractor slug — use these when creating models.

## cargo-ai connection native-integration get

```json
{
  "nativeIntegration": {
    "actions": {
      "company_enrich": {
        "name": "Company Enrich",
        "description": "Enrich a company record",
        "category": "enrichment",
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
| `category` | One of: `invisible`, `logic`, `storage`, `ai`, `sales`, `code` |
| `icon` | Icon URL |
| `config.jsonSchema` | JSON Schema describing the action's input parameters |
| `childrenCount` | Number of child branches (0 for most actions) |
| `credits.costs` | Credit cost per execution. Each cost has `type` (`fixed` or `unit`) and `cost` (number) |

**`extractors`** is keyed by extractor slug. Extractors sync data from an integration into a model.

| Field | Description |
| ----- | ----------- |
| `name` | Display name |
| `description` | What the extractor syncs |
| `icon` | Icon URL |
| `config.jsonSchema` | JSON Schema describing the extractor's configuration |
| `mode.kind` | `"fetch"` (pull-based) or `"ingest"` (push-based) |
| `mode.isIncremental` | Whether the extractor supports incremental sync (fetch mode only) |
