# Hosting troubleshooting

Common errors in the `hosting` domain and how to fix them.

## `unknown command 'hosting'`

The `hosting` domain shipped in a recent CLI. If `cargo-ai hosting --help` errors, bump the CLI: `npm install -g @cargo-ai/cli@latest`.

## Slug already taken / `create` fails on `--slug`

The `--slug` is the live subdomain (`<slug>.cargo.app`) and **must be globally unique within the hosting domain** — not just unique to your workspace. Pick a more specific slug and re-run `create`.

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

When `status` is `error`, `deployment get <uuid>` exposes the cause: read `errorMessage`, and `buildLogS3Filename` points at the full build log. Fix the source and re-run `deployment create`.

## `--app-uuid` and `--worker-uuid` both passed (or neither)

On `deployment create`, `deployment list`, and `deployment get-promoted` the two flags are **mutually exclusive** — pass exactly one. A deployment targets one app or one worker, never both.

## `folderNotFound` on `--folder-uuid`

The folder UUID doesn't exist. Folders are managed by the [`cargo-workspace-management`](../../cargo-workspace-management/SKILL.md) skill — run `cargo-ai workspaceManagement folder list` to find valid UUIDs. To move a resource back to the workspace root, pass the literal string `null`: `--folder-uuid null`.

## `app env` writes the wrong API URL

By default `hosting app env` points at `https://api.getcargo.io`. For a different environment, override it: `cargo-ai hosting app env <app-uuid> --api-url <url>`. Workers have no `env` subcommand — they receive config via the `env` argument to `fetch(request, env)` at runtime.

## Removing an app/worker took its deployments too

That's by design — `app remove` / `worker remove` cascade to every deployment of that resource. There's no undo; recreate the slot and redeploy if needed.

## Still stuck

File a report so the Cargo team can improve the CLI and these docs:

```bash
cargo-ai workspaceManagement report create \
  --title "<one-line summary>" \
  --description "<exact command(s), errorMessage, expected vs actual, UUIDs involved>"
```
