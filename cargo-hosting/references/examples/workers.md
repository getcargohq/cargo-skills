# Worker examples

Workers are serverless HTTP handlers that run on the edge — a standard `fetch(request, env)` entrypoint built on `@cargo-ai/worker-sdk`. The `blank` template ships an automatic OpenAPI 3.1 spec at `/openapi.json` and Swagger UI at `/docs`.

## Scaffold → create → deploy → promote (end to end)

```bash
# 1. Scaffold a local worker project
cargo-ai hosting worker init ./my-api --list-templates
cargo-ai hosting worker init ./my-api --template blank --name "My API"

# 2. Create the workspace slot. --slug is the live subdomain → must be globally unique.
cargo-ai hosting worker create --name "My API" --slug my-api
# → { "uuid": "<worker-uuid>", "slug": "my-api", "url": "https://my-api.cargo.app", ... }

# 3. Build & upload (source = package root). The backend bundles the entrypoint.
cargo-ai hosting deployment create --worker-uuid <worker-uuid> --source ./my-api
# → { "uuid": "<deployment-uuid>", "status": "...", ... }

# 4. Poll until the build is terminal
cargo-ai hosting deployment get <deployment-uuid>

# 5. Promote to go live
cargo-ai hosting deployment promote --uuid <deployment-uuid>

# 6. Confirm what's live, then hit it
cargo-ai hosting deployment get-promoted --worker-uuid <worker-uuid>
curl https://my-api.cargo.app/openapi.json
```

## List and inspect

```bash
cargo-ai hosting worker list                       # all workers
cargo-ai hosting worker list --folder-uuid <uuid>  # only workers in one folder
cargo-ai hosting worker get <worker-uuid>          # one worker's details + URL
```

## Templates

```bash
cargo-ai hosting worker init ./tmp --list-templates
```

- **`blank`** — edge worker on `@cargo-ai/worker-sdk` with automatic OpenAPI 3.1 spec at `/openapi.json` and Swagger UI at `/docs`.
- **`custom-integration`** — a Cargo Custom Integration worker: manifest / actions / extractors / autocompletes / dynamic schemas, also with `/openapi.json`. Use this when you're building an integration the rest of Cargo can call as a connector action.

## Rename, move, remove

```bash
cargo-ai hosting worker update --uuid <worker-uuid> --name "Renamed Worker"
cargo-ai hosting worker update --uuid <worker-uuid> --folder-uuid <folder-uuid>
cargo-ai hosting worker update --uuid <worker-uuid> --folder-uuid null   # back to root
cargo-ai hosting worker remove <worker-uuid>                            # also removes its deployments
```

## App vs worker — when to use which

- **App** — you want a UI on `*.cargo.app` (dashboard, internal tool, data grid). Vite SPA, `app init`, has an `env` subcommand for local dev.
- **Worker** — you want an HTTP endpoint with no UI (webhook receiver, API, custom integration backend). Edge `fetch` handler, `worker init`, **no** `env` subcommand — runtime config arrives via the `env` argument to `fetch`.
