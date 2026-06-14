# Hosting response shapes

JSON response structures for the `hosting` domain. All commands output JSON to stdout; failures exit non-zero with `{"errorMessage": "..."}`.

> **Capture live for field-level certainty.** The envelopes below are derived from the command surface (`--help`) and describe the fields you'll reference across commands. The exact key set can shift between CLI versions — when you need to depend on a specific field, confirm it against a real `cargo-ai hosting <…> get` from your workspace.

## App (`hosting app get` / items in `hosting app list`)

```json
{
  "uuid": "app-uuid",
  "workspaceUuid": "...",
  "name": "My App",
  "slug": "my-app",
  "url": "https://my-app.cargo.app",
  "folderUuid": null,
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-15T00:00:00Z"
}
```

**Key fields:** `uuid` (pass as `--app-uuid` to deployment commands), `slug` (the live subdomain), `url` (the live address), `folderUuid` (null unless filed into a folder).

`hosting app list` returns the apps as an array (e.g. under an `apps` key, or as a top-level array — confirm live).

## Worker (`hosting worker get` / items in `hosting worker list`)

Same shape as an app: `uuid` (pass as `--worker-uuid`), `name`, `slug`, `url`, `folderUuid`, timestamps.

## Deployment (`hosting deployment get` / items in `hosting deployment list`)

```json
{
  "uuid": "deployment-uuid",
  "appUuid": "app-uuid",
  "workerUuid": null,
  "status": "...",
  "isPromoted": false,
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:10Z"
}
```

**Key fields:**

- `uuid` — pass to `deployment promote --uuid`.
- `appUuid` / `workerUuid` — exactly one is set (a deployment targets one or the other).
- `status` — the build state. **Poll `deployment get` until this is terminal** (a built/succeeded value vs a failed value) before promoting. Capture the exact enum values live for this CLI version.
- promotion — whether this deployment is the one currently serving the live URL. `deployment get-promoted` returns the promoted deployment directly.

## env (`hosting app env`)

Not JSON — `hosting app env <appUuid>` prints `.env.local` lines (Cargo OAuth client, workspace UUID, app UUID, API URL) to stdout. Redirect into a file: `cargo-ai hosting app env <app-uuid> > .env.local`.

## init templates (`hosting app init <dir> --list-templates`)

```json
[
  { "slug": "blank", "description": "..." },
  { "slug": "territories-overview", "description": "..." }
]
```

Workers list their own templates (`blank`, `custom-integration`) via `hosting worker init <dir> --list-templates`. Note `--list-templates` still requires the `<directory>` positional argument.
