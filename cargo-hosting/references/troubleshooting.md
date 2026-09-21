# Hosting troubleshooting

Common errors in the `hosting` domain and how to fix them.

## `unknown command 'hosting'`

The `hosting` domain shipped in a recent CLI. If `cargo-ai hosting --help` errors, bump the CLI: `npm install -g @cargo-ai/cli@latest`.

## Slug already taken / `create` fails with `duplicateSlug`

The `--slug` must be unique **within your workspace**. The live host adds a workspace suffix (`<slug>-<workspace prefix>.<root>`), so another workspace using the same slug is never the cause. Remove or rename the existing app/worker with that slug, or pick another.

## I deployed but the URL still shows the old version

`deployment create` only builds and uploads — it does **not** change the live URL. Promote the new deployment:

```bash
cargo-ai hosting deployment get <deployment-uuid>      # confirm the build is terminal/succeeded
cargo-ai hosting deployment promote --uuid <deployment-uuid>
cargo-ai hosting deployment get-promoted --app-uuid <app-uuid>   # verify what's live
```

## `deployment create` build fails

The build runs server-side in a sandbox (`npm ci && vite build` for apps, entrypoint bundling for workers). A failed build usually means:

- **`--source` points at the wrong directory.** Pass the **package root** (where `package.json` lives), not a pre-built `dist/`.
- **`npm ci` can't resolve the lockfile.** Ensure `package-lock.json` is present and in sync with `package.json`, and that it isn't in the ignore list.
- **Something needed got ignored.** The default ignore list is `node_modules,dist,build,.git,.next`. If you override `--ignore`, you replace the whole list — don't accidentally drop `node_modules` from the ignores (it should stay ignored; the sandbox installs deps itself) while keeping source files you need.

- **Worker entrypoint not found** (`Expected one of: src/index.ts, src/index.js, index.ts, index.js.`). The worker build only looks for those four names. Rename a `.mjs`/`.mts`/`.cjs` entrypoint (and the files it imports, if they use those extensions) to `.js`/`.ts`. ES module syntax is fine in `.js` with `"type": "module"` in `package.json`.

When `status` is `error`, `deployment get <uuid>` exposes the cause: read `errorMessage`, and `buildLogS3Filename` points at the full build log. Fix the source and re-run `deployment create`.

## `--app-uuid` and `--worker-uuid` both passed (or neither)

On `deployment create`, `deployment list`, and `deployment get-promoted` the two flags are **mutually exclusive** — pass exactly one. A deployment targets one app or one worker, never both.

## `folderNotFound` on `--folder-uuid`

The folder UUID doesn't exist. Folders are managed by the [`cargo-workspace-management`](../../cargo-workspace-management/SKILL.md) skill — run `cargo-ai workspaceManagement folder list` to find valid UUIDs. To move a resource back to the workspace root, pass the literal string `null`: `--folder-uuid null`.

## `app env` writes the wrong API URL

By default `hosting app env` points at `https://api.getcargo.io`. For a different environment, override it: `cargo-ai hosting app env <app-uuid> --api-url <url>`. Workers have no `env` command. Run them locally with `npm run dev` and export what they need (see below).

## Worker throws `Missing CARGO_API_TOKEN`

`createCargoApi(c.env)` needs a workspace API token, and Cargo does **not** inject one (it only binds `CARGO_API_URL`, `CARGO_WORKSPACE_UUID`, `CARGO_WORKER_UUID`). Create one and store it as a secret, then **deploy and promote again**:

```bash
cargo-ai workspaceManagement token create --name "worker: <slug>"
export CARGO_API_TOKEN=<token value>
cargo-ai workspaceManagement envVar create --key CARGO_API_TOKEN --secret   # every worker inherits it
```

To scope it to one worker, see `SKILL.md` → "Worker env vars and secrets". Locally, `export CARGO_API_TOKEN=…` before `npm run dev`.

## I set an env var but the worker doesn't see it

Env vars are bound when a deployment is **promoted**, and non-secret values are also compiled into the bundle. The running deployment keeps the values it was promoted with. Run `deployment create` + `promote` again. To check which keys exist, list them: `workspaceManagement envVar list`, or `GET /v1/hosting/env-vars?workerUuid=<uuid>` for worker-level entries.

Don't debug this by shipping an endpoint that echoes `Object.keys(c.env)`. The listing above answers the same question without a deploy.

## Worker returns 502/500 but the logs show no cause

`createWorker()` logs an **uncaught** exception with its stack. If your route catches the error and returns a sanitized message, only the HTTP line reaches the logs. Add `console.error(err)` in the `catch` before returning, then redeploy. Everything a request writes through `console.*` is captured (the first 50 lines per request). Read logs in the web app or via `POST /v1/hosting/logs/list` with `{"workerUuid":"<uuid>","levels":["error"]}`.

## Browser blocks the app's calls to the worker (CORS)

Apps and workers are served from different root domains, so every app → worker call is cross-origin and preflighted. Add `hono/cors` middleware on the worker for the app's exact origin (from `hosting app get` → `url`) plus your local dev origin, registered before the routes. Pass the worker URL to the app as a non-secret `VITE_` env var, not a hardcoded global. Full snippet: [`examples/workers.md`](examples/workers.md#calling-a-worker-from-an-app).

## Removing an app/worker took its deployments too

That's by design — `app remove` / `worker remove` cascade to every deployment of that resource. There's no undo; recreate the slot and redeploy if needed.

## Still stuck

File a report so the Cargo team can improve the CLI and these docs:

```bash
cargo-ai workspaceManagement report create \
  --title "<one-line summary>" \
  --description "<exact command(s), errorMessage, expected vs actual, UUIDs involved>"
```
