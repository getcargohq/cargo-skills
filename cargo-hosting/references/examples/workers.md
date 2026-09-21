# Worker examples

Workers are serverless HTTP handlers that run on the edge — a standard `fetch(request, env)` entrypoint built on `@cargo-ai/worker-sdk`. The `blank` template ships an automatic OpenAPI 3.1 spec at `/openapi.json` and Swagger UI at `/docs`.

## Scaffold → create → deploy → promote (end to end)

```bash
# 1. Scaffold a local worker project
cargo-ai hosting worker init ./my-api --list-templates
cargo-ai hosting worker init ./my-api --template blank --name "My API"

# 2. Create the workspace slot. --slug is unique per workspace; the host adds a workspace suffix.
cargo-ai hosting worker create --name "My API" --slug my-api
# → { "uuid": "<worker-uuid>", "slug": "my-api", "url": "https://my-api-1a2b3c4d.worker.getcargo.run", ... }

# 2b. (only if the worker calls the Cargo API) give it a token — see "Env vars and the API token" below

# 3. Build & upload (source = package root). The backend bundles the entrypoint.
cargo-ai hosting deployment create --worker-uuid <worker-uuid> --source ./my-api
# → { "uuid": "<deployment-uuid>", "status": "...", ... }

# 4. Poll until the build is terminal
cargo-ai hosting deployment get <deployment-uuid>

# 5. Promote to go live
cargo-ai hosting deployment promote --uuid <deployment-uuid>

# 6. Confirm what's live, then hit it
cargo-ai hosting deployment get-promoted --worker-uuid <worker-uuid>
curl "$(cargo-ai hosting worker get <worker-uuid> | jq -r .url)/openapi.json"
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

## Env vars and the API token

`createCargoApi(c.env)` needs a `CARGO_API_TOKEN`, and Cargo does not inject one. Mint a token, then store it as a **secret** env var **before** deploying:

```bash
cargo-ai workspaceManagement token create --name "worker: my-api"      # value shown once
export CARGO_API_TOKEN=<token value>

# Option A — workspace-wide: every worker (and app) in the workspace inherits it
cargo-ai workspaceManagement envVar create --key CARGO_API_TOKEN --secret

# Option B — this worker only (overrides a workspace entry of the same key)
curl -X POST "https://api.getcargo.io/v1/hosting/env-vars" \
  -H "Authorization: Bearer $CARGO_API_TOKEN" -H "content-type: application/json" \
  -d "{\"kind\":\"worker\",\"workerUuid\":\"<worker-uuid>\",\"key\":\"CARGO_API_TOKEN\",\"value\":\"$CARGO_API_TOKEN\",\"isSecret\":true}"
curl "https://api.getcargo.io/v1/hosting/env-vars?workerUuid=<worker-uuid>" -H "Authorization: Bearer $CARGO_API_TOKEN"
```

In a CDK project, Option B is `defineWorker("my-api", { path, env: { CARGO_API_TOKEN: secret("CARGO_API_TOKEN") } })`.

Then deploy and promote. Env vars are bound when a deployment is promoted, so **a variable added after the live deploy does nothing until the next `deployment create` + `promote`.**

The platform already binds `CARGO_API_URL`, `CARGO_WORKSPACE_UUID` and `CARGO_WORKER_UUID`. Don't set them yourself.

## Develop locally

```bash
cd ./my-api
npm install
export CARGO_API_TOKEN=<token value>     # c.env is empty locally; createCargoApi falls back to process.env
npm run dev                              # → http://localhost:8787  (docs: /docs, spec: /openapi.json)
```

`dev.ts` serves the same `src/index.ts` under Node with hot reload and is never deployed. Outbound allowlists and cron triggers only apply once deployed.

## Calling a worker from an app

An app and a worker live on different root domains (`*.app.getcargo.run` vs `*.worker.getcargo.run`), so the browser treats every call as **cross-origin**. Two pieces are needed.

**1. The worker answers CORS for the app's origin.** `hono` is already installed as a dependency of `@cargo-ai/worker-sdk`:

```ts
import { createWorker } from "@cargo-ai/worker-sdk";
import { cors } from "hono/cors";

const { app, openapi } = createWorker({ title: "my-api" });

app.use(
  "/api/*",
  cors({
    origin: ["https://my-app-1a2b3c4d.app.getcargo.run", "http://localhost:5173"],
    allowHeaders: ["content-type", "authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);
```

Register it **before** the routes it covers so preflight `OPTIONS` requests are answered. List exact origins, taking the app's from `hosting app get <app-uuid>` → `url`, rather than `*` when the worker holds a workspace token.

**2. The app gets the worker URL from an env var, not a hardcoded global.** An app's build receives every **non-secret, `VITE_`-prefixed** env var (workspace-level, or app-level via `POST /v1/hosting/env-vars` with `"kind":"app"`) in `.env.production`:

```bash
cargo-ai workspaceManagement envVar create --key VITE_MY_API_URL \
  --value "$(cargo-ai hosting worker get <worker-uuid> | jq -r .url)"
```

```ts
const res = await fetch(`${import.meta.env.VITE_MY_API_URL}/api/data`);
```

Redeploy the app after setting it, because the value is baked into the build. Never put a secret in a `VITE_` variable: the Vite bundle is public, and secret entries are excluded from the app build for that reason.

## Logging errors

`createWorker()` ships each request's `console.*` output to the worker's logs, and an uncaught exception is logged with its stack. A route that **catches** and sanitizes must log first:

```ts
openapi.get("/api/data", GetData);   // …inside GetData.handle:
try {
  return c.json(await fetchData(createCargoApi(c.env)));
} catch (err) {
  console.error(err);                                        // → logs, with stack
  return c.json({ error: "The data provider is unavailable." }, 502);
}
```

Read them in the web app, or `POST /v1/hosting/logs/list` with `{"workerUuid":"<uuid>","levels":["error"]}`.

## App vs worker — when to use which

- **App** — you want a UI (dashboard, internal tool, data grid). Vite SPA, `app init`, `app env` prints `.env.local` for local dev.
- **Worker** — you want an HTTP endpoint with no UI (webhook receiver, API, custom integration backend). Edge `fetch` handler, `worker init`, `npm run dev` for local dev, runtime config from `c.env`.
- **Both** — a UI that needs server-side secrets. Keep the token in the worker, call it from the app, and configure CORS as above.
