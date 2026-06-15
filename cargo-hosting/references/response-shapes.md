# Hosting response shapes

JSON response structures for the `hosting` domain. All commands output JSON to stdout; failures exit non-zero with `{"errorMessage": "..."}`.

## App (`hosting app get` / items in `hosting app list`)

```json
{
  "uuid": "app-uuid",
  "workspaceUuid": "...",
  "name": "My App",
  "description": null,
  "slug": "my-app",
  "url": "https://my-app.cargo.app",
  "userUuid": "...",
  "folderUuid": null,
  "promotedDeployment": null,
  "chargedUntil": "2026-02-01T00:00:00Z",
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-15T00:00:00Z",
  "deletedAt": null
}
```

**Key fields:** `uuid` (pass as `--app-uuid` to deployment commands), `slug` (the live subdomain), `url` (the live address), `folderUuid` (null unless filed into a folder), `promotedDeployment` (the App Deployment object currently live, or `null` if nothing is promoted yet), `chargedUntil` (end of the period already billed hosting credits — advanced a month at a time, so hosting an app costs credits monthly; see [`cargo-billing`](../../cargo-billing/SKILL.md)).

## Worker (`hosting worker get` / items in `hosting worker list`)

Identical to an app, with one difference: `promotedDeployment` is a **Worker Deployment** (carries `workerUuid` + `meta`, see below). The `uuid` is passed as `--worker-uuid` to deployment commands.

## Deployment (`hosting deployment get` / items in `hosting deployment list`)

A deployment is a discriminated union on `kind` (`"app"` | `"worker"`). Shared fields:

```json
{
  "uuid": "deployment-uuid",
  "kind": "app",
  "appUuid": "app-uuid",
  "workspaceUuid": "...",
  "status": "success",
  "url": "https://my-app.cargo.app",
  "sourceS3Path": "...",
  "bundleS3Path": "...",
  "buildLogS3Filename": "...",
  "errorMessage": null,
  "meta": {},
  "userUuid": "...",
  "promotedAt": "2026-01-01T00:01:30Z",
  "promotedByUserUuid": "...",
  "finishedAt": "2026-01-01T00:01:10Z",
  "temporalWorkflowId": "...",
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:01:30Z"
}
```

- **`kind: "app"`** carries `appUuid` and an empty `meta` (`{}`).
- **`kind: "worker"`** carries `workerUuid` instead of `appUuid`, and `meta: { "bundleSha256": "...", "outboundAllowlist": ["..."] }`.

**Key fields:**

- `uuid` — pass to `deployment promote --uuid`.
- `appUuid` / `workerUuid` — exactly one is set, matching `kind`.
- **`status`** — one of `"pending"`, `"building"`, `"success"`, `"error"`, `"cancelled"`. **Terminal** at `success` / `error` / `cancelled`; only a `success` deployment is worth promoting.
- `errorMessage` — populated when `status` is `error`; `buildLogS3Filename` points at the build log for diagnosing a failed build.
- `promotedAt` / `promotedByUserUuid` — non-null once this deployment has been promoted to the live URL (this is how "is it live?" is represented — there is no separate `isPromoted` flag).
- `finishedAt` — when the build reached a terminal state.

## get-promoted (`hosting deployment get-promoted`)

Returns the currently-promoted Deployment for the given `--app-uuid` / `--worker-uuid` (same shape as above, with `promotedAt` set), or null/empty if nothing is promoted yet. Equivalent to reading `promotedDeployment` off the app/worker.

## env (`hosting app env`)

Not JSON — `hosting app env <appUuid>` prints `.env.local` lines (Cargo OAuth client, workspace UUID, app UUID, `VITE_CARGO_DEPLOYMENT_UUID`, API URL) to stdout. Redirect into a file: `cargo-ai hosting app env <app-uuid> > .env.local`.

## init templates (`hosting app init <dir> --list-templates`)

```json
[
  { "slug": "blank", "description": "..." },
  { "slug": "territories-overview", "description": "..." }
]
```

Workers list their own templates (`blank`, `custom-integration`) via `hosting worker init <dir> --list-templates`. Note `--list-templates` still requires the `<directory>` positional argument.
