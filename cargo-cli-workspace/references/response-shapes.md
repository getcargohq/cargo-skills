# Response shapes

JSON response structures returned by Cargo CLI commands used in the `cargo-cli-workspace` skill.

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
      "workspaceUuid": "workspace-uuid",
      "userUuid": "user-uuid",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

**Note:** Token values are not returned in `token list`. The actual token string is only returned once at creation time.

## cargo-ai workspace token create

```json
{
  "token": {
    "uuid": "token-uuid",
    "token": "cai_live_xxxxxxxxxxxxxxxxxxxx",
    "workspaceUuid": "workspace-uuid",
    "userUuid": "user-uuid",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

**Important:** Save the `token` value immediately — it is shown only once and cannot be retrieved again.

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
