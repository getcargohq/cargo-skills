# Response shapes

JSON response structures returned by Cargo CLI commands used in the `cargo-workspace-management` skill.

## cargo-ai whoami

```json
{
  "user": {
    "uuid": "user-uuid",
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Doe"
  },
  "workspace": {
    "uuid": "workspace-uuid",
    "name": "Acme Corp"
  }
}
```

## cargo-ai workspace user list

```json
{
  "users": [
    {
      "uuid": "user-uuid",
      "email": "user@example.com",
      "firstName": "Jane",
      "lastName": "Doe",
      "role": { "uuid": "role-uuid", "slug": "member" },
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

**Key fields:** `uuid`, `email`, `firstName`, `lastName`, `role.slug` (the assigned role).

## cargo-ai workspace role list

```json
{
  "roles": [
    {
      "uuid": "role-uuid",
      "slug": "admin"
    },
    {
      "uuid": "role-uuid-2",
      "slug": "member"
    }
  ]
}
```

## cargo-ai workspace token list

```json
{
  "tokens": [
    {
      "uuid": "token-uuid",
      "name": "CI/CD pipeline",
      "permissions": null,
      "workspaceUuid": "workspace-uuid",
      "userUuid": "user-uuid",
      "createdAt": "2025-01-01T00:00:00Z",
      "deletedAt": null
    }
  ]
}
```

**Note:** Token values are not returned in `token list`. The actual token string is only returned once at creation time.

**Key fields:**

- `name`: human-readable label assigned at creation (`--name` flag).
- `permissions`: `null` means the token has full workspace access. When non-null, it is an array of permission rules `{ effect, resources, actions }` that scope the token to specific actions / resources. CLI-created tokens are always `null`; scoped tokens are configured via the API or the Cargo app.
- `deletedAt`: `null` for active tokens; an ISO timestamp once the token has been removed.

## cargo-ai workspace token create

```json
{
  "token": {
    "uuid": "token-uuid",
    "token": "<token-value>",
    "name": "CI/CD pipeline",
    "permissions": null,
    "workspaceUuid": "workspace-uuid",
    "userUuid": "user-uuid",
    "createdAt": "2025-01-01T00:00:00Z",
    "deletedAt": null
  }
}
```

**Important:** Save the `token` value immediately — it is shown only once and cannot be retrieved again. The `name` you pass via `--name` is echoed back in the response and shown in `token list`.

### Permission shape (when not null)

When a token has been scoped (via API or app), `permissions` is an array of rules:

```json
[
  {
    "effect": "allow",
    "resources": ["<workflow-uuid>", "<folder-uuid>"],
    "actions": ["orchestration:workflow:read", "orchestration:workflow:write"]
  },
  {
    "effect": "deny",
    "resources": null,
    "actions": ["workspaceManagement:write"]
  }
]
```

- `effect`: `"allow"` or `"deny"`.
- `resources`: array of resource UUIDs (workflow, folder, etc.) that the rule applies to, or `null` for workspace-wide.
- `actions`: array of dotted action strings, e.g. `"orchestration:*"`, `"orchestration:workflow:read"`, `"workspaceManagement:folder:write"`, `"ai:agent:write"`. The `*` wildcard at any level grants every action below it.

## cargo-ai workspace folder list

```json
{
  "folders": [
    {
      "uuid": "folder-uuid",
      "workspaceUuid": "...",
      "parentUuid": null,
      "kind": "play",
      "name": "Q1 Campaigns",
      "emojiSlug": "rocket",
      "isReadOnly": false,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z",
      "deletedAt": null
    }
  ]
}
```

**Key fields:** `uuid`, `name`, `kind` (`play`, `tool`, `agent`, or `file`), `emojiSlug`, `parentUuid` (null for root folders).

## cargo-ai workspace file list-columns

```json
{
  "columns": [
    { "type": "string", "name": "name" },
    { "type": "string", "name": "domain" },
    { "type": "string", "name": "employee_count" },
    { "type": "string", "name": "industry" }
  ]
}
```

Each column has a `type` (always `"string"` for CSV files) and a `name`. Use the `name` values to map CSV data to workflow input fields when creating a batch.
