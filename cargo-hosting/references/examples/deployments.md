# Deployment examples

A deployment is one build+upload of a local source directory to an app or worker. Two facts drive everything below:

1. A deployment belongs to **exactly one** app or worker — `--app-uuid` and `--worker-uuid` are mutually exclusive.
2. **Building is not promoting.** `deployment create` builds; the live URL only moves when you `deployment promote`.

## Create a deployment

```bash
# App: backend runs `npm ci && vite build` in a sandbox
cargo-ai hosting deployment create --app-uuid <app-uuid> --source ./my-app

# Worker: backend bundles the entrypoint
cargo-ai hosting deployment create --worker-uuid <worker-uuid> --source ./my-worker
```

- `--source` is the **package root** (where `package.json` lives), not a pre-built `dist/`. The build happens server-side.
- Default ignore list: `node_modules,dist,build,.git,.next`. Override the whole list with `--ignore`:

```bash
cargo-ai hosting deployment create --app-uuid <app-uuid> --source ./my-app \
  --ignore "node_modules,dist,build,.git,.next,coverage,.turbo"
```

## Poll the build, then promote

```bash
# Builds are async — poll until the status field is terminal
cargo-ai hosting deployment get <deployment-uuid>
# when terminal (built/succeeded), promote:
cargo-ai hosting deployment promote --uuid <deployment-uuid>
```

If the build failed, inspect the deployment record for the error and fix the source before re-running `deployment create`. See `../response-shapes.md` for the fields to check.

## List deployment history

```bash
cargo-ai hosting deployment list --app-uuid <app-uuid>       # newest first
cargo-ai hosting deployment list --worker-uuid <worker-uuid>
```

## See what's currently live

```bash
cargo-ai hosting deployment get-promoted --app-uuid <app-uuid>
cargo-ai hosting deployment get-promoted --worker-uuid <worker-uuid>
```

## Roll back to a previous deployment

Promotion just points the live URL at a deployment, so rolling back is promoting an older one — no rebuild needed.

```bash
# 1. Find the deployment you want to go back to
cargo-ai hosting deployment list --app-uuid <app-uuid>

# 2. Promote it
cargo-ai hosting deployment promote --uuid <older-deployment-uuid>

# 3. Verify
cargo-ai hosting deployment get-promoted --app-uuid <app-uuid>
```
