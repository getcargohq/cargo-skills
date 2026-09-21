---
name: cargo-hosting
description: "Put something on the internet from Cargo — hosted Vite single-page apps and serverless edge workers that answer HTTP requests, plus the deployments that build and promote them, the env vars and secrets a worker reads, and running a worker locally. Triggers: \"build me a dashboard for this\", \"host this app\", \"give me a URL to share\", \"deploy this\", \"I need a webhook endpoint\", \"make it live\", \"promote to production\", \"ship a UI for my team\", \"give my worker an API token\", \"set a secret on the worker\", \"Missing CARGO_API_TOKEN\", \"my app cannot call my worker\", \"run the worker locally\". Skip when: the app or worker should be declared as committed workspace code — use cargo-project."
version: "1.1.0"
compatibility: Requires @cargo-ai/cli (npm). Sign in or create an account with `cargo-ai login --email` (emailed code, no browser), `--oauth`, or an API token
homepage: https://github.com/getcargohq/cargo-skills
metadata:
  author: getcargo
  openclaw:
    requires:
      bins:
        - cargo-ai
    install:
      - kind: node
        package: "@cargo-ai/cli@latest"
        bins:
          - cargo-ai
    homepage: https://github.com/getcargohq/cargo-skills
---

# Cargo CLI — Hosting

**Cargo Hosting** runs two kinds of workspace-scoped resources, plus the deployments that ship them:

- **App** — a Vite single-page app served on its own subdomain (see [URLs](#urls)), built on `@cargo-ai/app-sdk` (Vite + refine + shadcn primitives, with `getCargoEnv()` / `useCargoApi()` wired to the workspace).
- **Worker** — a serverless HTTP handler that runs on the edge (`fetch(request, env)`), built on `@cargo-ai/worker-sdk` (auto OpenAPI 3.1 spec at `/openapi.json`, Swagger UI at `/docs`).
- **Deployment** — one build+upload of a local source directory to an app or worker. A deployment is **not live until it's promoted**.

> For organizing apps/workers into **folders**, use [`cargo-workspace-management`](../cargo-workspace-management/SKILL.md) (`folder …`). The `--folder-uuid` flags here consume those folder UUIDs.

> See `references/examples/apps.md`, `references/examples/workers.md`, and `references/examples/deployments.md` for end-to-end walkthroughs.
> See `references/response-shapes.md` for JSON response structures.
> See `references/troubleshooting.md` for common errors and how to fix them.

## Bootstrap

Already signed in (`cargo-ai whoami` returns a workspace)? Skip to the next section.

```bash
npm install -g @cargo-ai/cli            # no global install? prefix every command with `npx @cargo-ai/cli`
cargo-ai login --email you@company.com  # emailed code, no browser; creates the account on first use
                                        # alternatives: --oauth (browser) · --token <api-token> (CI)
cargo-ai whoami                         # confirm the active workspace before any write
```

Every command prints JSON to stdout; failures exit non-zero with `{"errorMessage": "..."}`. Anything that creates a run or a batch is async — pass `--wait-until-finished` or poll the matching `get`. When the full skill bundle is installed, [`../cargo/references/prerequisites.md`](../cargo/references/prerequisites.md) adds the CLI version pin, token scopes, and the admin-only surface.

## The lifecycle

Apps and workers follow the same shape — **scaffold → create slot → deploy → promote**:

```
init (local scaffold) → create (slot + slug) → deployment create (build+upload) → deployment promote (go live)
```

1. **Scaffold** a local project from a template — `hosting app init <dir>` / `hosting worker init <dir>`.
2. **Create the slot** in the workspace — `hosting app create --name --slug` → `appUuid` (or `workerUuid`). The `--slug` becomes part of the subdomain and must be unique within the workspace.
3. **(optional) Wire local dev** — for an app, `hosting app env <appUuid>` prints the `.env.local` lines a local copy needs (Cargo OAuth + workspace + app UUID + API URL). For a worker, `npm run dev` in the scaffold (see [Run a worker locally](#run-a-worker-locally)). A worker that calls the Cargo API also needs a `CARGO_API_TOKEN` secret before its first deploy (see [Worker env vars and secrets](#worker-env-vars-and-secrets)).
4. **Deploy** — `hosting deployment create --app-uuid <uuid> --source <dir>` uploads the source; the backend runs `npm ci && vite build` (apps) or bundles the entrypoint (workers) in a sandbox. Returns a `deploymentUuid`.
5. **Promote** — `hosting deployment promote --uuid <deploymentUuid>` points the live URL at that build.

Deploys build asynchronously — **poll `hosting deployment get <uuid>`** until the status is terminal before promoting (see [Async polling](#async-polling)).

## URLs

The live host is **`<slug>-<first 8 chars of the workspace UUID>`** under the hosting root domain, and apps and workers have **different root domains** — in production `https://<slug>-<ws>.app.getcargo.run` for an app, `https://<slug>-<ws>.worker.getcargo.run` for a worker. The workspace suffix is what makes the host globally unique, which is why a slug only has to be unique inside your workspace.

Don't build the URL by hand. Read `url` from `create` or `get` — the root domain differs per environment. Each deployment also gets a preview host, `https://deployment-<deploymentUuid>.<root>`, before it is promoted.

Because the roots differ, **an app calling a worker is always a cross-origin request.** No option serves them on the same origin, so the worker has to answer CORS. See the app + worker pattern in [`references/examples/workers.md`](references/examples/workers.md#calling-a-worker-from-an-app).

## Apps

```bash
# Discover
cargo-ai hosting app list                          # all apps (filter with --folder-uuid <uuid>)
cargo-ai hosting app get <uuid>                     # one app's details + URL

# Scaffold locally (Vite + @cargo-ai/app-sdk)
cargo-ai hosting app init ./my-app --list-templates # see available templates, then:
cargo-ai hosting app init ./my-app --template blank --name "My App"

# Create the slot (slug unique per workspace; `url` in the response is the live host)
cargo-ai hosting app create --name "My App" --slug my-app --folder-uuid <folder-uuid>

# Print .env.local for local development
cargo-ai hosting app env <app-uuid>
cargo-ai hosting app env <app-uuid> --api-url https://api.getcargo.io

# Update / remove
cargo-ai hosting app update --uuid <app-uuid> --name "Renamed"
cargo-ai hosting app update --uuid <app-uuid> --folder-uuid null   # move to workspace root
cargo-ai hosting app remove <app-uuid>                             # also removes its deployments
```

Templates: `blank` (minimal starting point) and `territories-overview` (read-only territories grid demoing `useCargoApi()` + react-query). Run `app init <dir> --list-templates` for the current list.

## Workers

Same command shape as apps — substitute `worker` for `app`:

```bash
cargo-ai hosting worker list                        # filter with --folder-uuid <uuid>
cargo-ai hosting worker get <uuid>

# Scaffold (edge fetch(request, env) handler on @cargo-ai/worker-sdk)
cargo-ai hosting worker init ./my-worker --list-templates
cargo-ai hosting worker init ./my-worker --template blank --name "My Worker"

cargo-ai hosting worker create --name "My Worker" --slug my-worker --folder-uuid <folder-uuid>
cargo-ai hosting worker update --uuid <worker-uuid> --name "Renamed"
cargo-ai hosting worker remove <worker-uuid>        # also removes its deployments
```

Templates: `blank` (auto OpenAPI spec + Swagger UI) and `custom-integration` (a Cargo Custom Integration — manifest / actions / extractors / autocompletes / dynamic schemas).

**Entrypoint.** The build bundles the first of `src/index.ts`, `src/index.js`, `index.ts`, `index.js` that exists, and fails if there is none. `.mjs`, `.mts` and `.cjs` entrypoints are not picked up, so rename them to `.js`/`.ts`; ES module syntax works in `.js` because the scaffold's `package.json` sets `"type": "module"`.

### Worker env vars and secrets

A worker reads configuration from `c.env.KEY` (Hono context) or the `env` argument to `fetch(request, env)`. Three sources feed it:

| Source | Set with | Reaches |
|---|---|---|
| **Platform bindings** | automatic | `CARGO_API_URL`, `CARGO_WORKSPACE_UUID`, `CARGO_WORKER_UUID` |
| **Workspace env vars** | `cargo-ai workspaceManagement envVar create --key K [--secret]` | every worker **and** app in the workspace |
| **Worker env vars** | `defineWorker({ env })` in CDK, or `POST /v1/hosting/env-vars` (no `hosting` CLI command at CLI 1.0.96) | that worker only, and a worker entry overrides a workspace entry with the same key |

**`CARGO_API_TOKEN` is not injected.** `createCargoApi(c.env)` throws `Missing CARGO_API_TOKEN…` until you provide one. Mint a workspace API token and store it as a secret before the first deploy:

```bash
cargo-ai workspaceManagement token create --name "worker: my-worker"   # value shown ONCE
export CARGO_API_TOKEN=<token value>
cargo-ai workspaceManagement envVar create --key CARGO_API_TOKEN --secret \
  --description "Cargo API token for hosted workers"                     # --value omitted → read from $CARGO_API_TOKEN
```

A workspace entry gives *every* worker that token. If only one worker should hold it, set it on that worker instead:

- **CDK:** `defineWorker("my-worker", { path, env: { CARGO_API_TOKEN: secret("CARGO_API_TOKEN") } })`.
- **API:** `POST /v1/hosting/env-vars` with `{"kind":"worker","workerUuid":"<uuid>","key":"CARGO_API_TOKEN","value":"…","isSecret":true}`. From TypeScript that is `api.hosting.envVars.create(…)` in `@cargo-ai/api`, and `list` takes `{ workerUuid }`.

**Values are captured at deploy time, not read live.** Bindings are attached when a deployment is promoted, and non-secret values are also compiled into the bundle as `process.env.KEY`. After adding or changing a variable, **run `deployment create` and `promote` again**. The running worker keeps the old values until then.

**Secrets never enter the bundle.** A secret binds as an encrypted runtime value. Only non-secret values are compiled in, and bundles can be downloaded from the per-deployment preview host, so anything sensitive must be `--secret` / `isSecret: true`.

### Run a worker locally

Both templates ship a `dev.ts` harness: `npm run dev` serves `src/index.ts` under Node with hot reload on `http://localhost:8787` (override with `PORT`). `dev.ts` is never deployed.

- **No platform bindings exist locally**, so `c.env` is empty. `createCargoApi` falls back to `process.env`, so export `CARGO_API_TOKEN` (and `CARGO_API_URL` for a non-production API) in the shell before `npm run dev`. Your own variables need the same fallback in your code.
- **`manifest.json` `outboundAllowlist` and cron triggers are not enforced locally.** Test them on a deployment.

A project scaffolded before `dev.ts` existed can copy it from a fresh `hosting worker init`, along with the `dev` script and the `@hono/node-server` + `tsx` dev dependencies.

### Worker logs and errors

`createWorker()` captures `console.log/info/warn/error/debug` during each request Cargo dispatches and ships them to the worker's logs (at most 50 lines per request). An **uncaught** error is logged with its stack and answered with a bare `500`.

**A caught error leaves no trace.** If a route catches an exception and returns its own sanitized response, such as `502 "The data provider is unavailable"`, the log gets only the HTTP line. **Log the error before you sanitize it:**

```ts
try {
  return c.json(await loadData(createCargoApi(c.env)));
} catch (err) {
  console.error(err);                        // stack goes to the logs; the response stays clean
  return c.json({ error: "The data provider is unavailable." }, 502);
}
```

At CLI 1.0.96 the logs are readable in the web app or through the API: `POST /v1/hosting/logs/list` with `{"workerUuid":"<uuid>","levels":["error"],"limit":50}`, or `api.hosting.log.list(…)` from TypeScript. It also filters on `runUuid`, `search`, and `occurredAfter`/`occurredBefore`. The CLI has no logs command yet.

## Deployments

A deployment belongs to exactly one app **or** one worker (`--app-uuid` and `--worker-uuid` are mutually exclusive).

```bash
# List / inspect
cargo-ai hosting deployment list --app-uuid <uuid>          # or --worker-uuid <uuid>
cargo-ai hosting deployment get <deployment-uuid>           # status + metadata
cargo-ai hosting deployment get-promoted --app-uuid <uuid>  # what's currently live

# Build & upload a local source directory (point at the package root, NOT dist/)
cargo-ai hosting deployment create --app-uuid <uuid> --source ./my-app
cargo-ai hosting deployment create --worker-uuid <uuid> --source ./my-worker
# default ignores: node_modules,dist,build,.git,.next — override with --ignore "a,b,c"

# Go live
cargo-ai hosting deployment promote --uuid <deployment-uuid>
```

## Critical rules

- **`--slug` is unique per workspace**, and the live host is `<slug>-<workspace prefix>.<root>`, with a different root for apps and workers. Use the `url` from `get` rather than composing it (see [URLs](#urls)). A duplicate slug fails at `create` with `duplicateSlug`.
- **An app calling a worker is cross-origin.** The worker must send CORS headers for the app's origin. No same-origin mount exists.
- **`CARGO_API_TOKEN` is yours to provide.** It is never injected, and `createCargoApi` throws without it. Set it as a secret (workspace or worker env var) **before** the deploy that needs it.
- **Env var changes need a new deploy + promote.** Values are bound at promote and non-secrets are compiled into the bundle, so editing a variable changes nothing until the next deployment is live.
- **Log before you sanitize.** Only uncaught errors reach the logs with a stack. A `catch` that returns a friendly message must `console.error(err)` first, or the cause is gone.
- **Deploying ≠ going live.** `deployment create` builds and uploads; the URL only changes when you `deployment promote` that deployment. Use `deployment get-promoted` to see what's live now.
- **`--source` is the package root, not `dist/`.** The build runs in a Cargo sandbox: `npm ci && vite build` for apps, entrypoint bundling for workers. Shipping a pre-built `dist/` will not work.
- **Builds are async** — poll `deployment get` until terminal before promoting (see below).
- **`--app-uuid` / `--worker-uuid` are mutually exclusive** on `deployment create`, `deployment list`, and `deployment get-promoted`. Pass exactly one.
- **`remove` cascades** — removing an app or worker also removes all of its deployments.
- **`update --folder-uuid null`** (literal string `null`) moves a resource back to the workspace root.
- **Hosting consumes credits monthly per resource.** Each app/worker carries a `chargedUntil` that an hourly sweep advances a month at a time, so a live app or worker bills hosting credits on an ongoing basis — `remove` resources you no longer serve. Track consumption via [`cargo-billing`](../cargo-billing/SKILL.md).

## Async polling

`deployment create` kicks off a sandboxed build. The deployment's `status` moves `pending → building → success` (or `error` / `cancelled`). Poll until terminal, then promote the `success` one:

```bash
cargo-ai hosting deployment get <deployment-uuid>   # poll ~2–5s until status is terminal
```

Terminal statuses are `success`, `error`, and `cancelled` — only promote a `success` deployment. On `error`, read the deployment's `errorMessage` (and `buildLogS3Filename`) to diagnose the build. For the general polling pattern (intervals, retries), see [`../cargo-orchestration/references/polling.md`](../cargo-orchestration/references/polling.md).

## Help

Every command supports `--help`:

```bash
cargo-ai hosting app create --help
cargo-ai hosting deployment create --help
```
