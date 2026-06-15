---
name: cargo-hosting
description: Build, deploy, and manage Cargo Hosting apps and workers with the Cargo CLI — Vite SPAs served on *.cargo.app and serverless edge HTTP handlers, plus the deployments that ship and promote them. Use when the user wants to scaffold, deploy, promote, or manage a hosted app or worker on Cargo.
version: "1.0.0"
compatibility: Requires @cargo-ai/cli (npm) and a Cargo account (browser sign-in via --oauth, or an API token)
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

- **App** — a Vite single-page app served on `https://<slug>.cargo.app`, built on `@cargo-ai/app-sdk` (Vite + refine + shadcn primitives, with `getCargoEnv()` / `useCargoApi()` wired to the workspace).
- **Worker** — a serverless HTTP handler that runs on the edge (`fetch(request, env)`), built on `@cargo-ai/worker-sdk` (auto OpenAPI 3.1 spec at `/openapi.json`, Swagger UI at `/docs`).
- **Deployment** — one build+upload of a local source directory to an app or worker. A deployment is **not live until it's promoted**.

> For organizing apps/workers into **folders**, use [`cargo-workspace-management`](../cargo-workspace-management/SKILL.md) (`folder …`). The `--folder-uuid` flags here consume those folder UUIDs.

> See `references/examples/apps.md`, `references/examples/workers.md`, and `references/examples/deployments.md` for end-to-end walkthroughs.
> See `references/response-shapes.md` for JSON response structures.
> See `references/troubleshooting.md` for common errors and how to fix them.

## Prerequisites

See [`../cargo/references/prerequisites.md`](../cargo/references/prerequisites.md) for install, login (`--oauth` / `--token`), JSON output conventions, and error shapes. Verify the session with `cargo-ai whoami` before running any command below.

## The lifecycle

Apps and workers follow the same shape — **scaffold → create slot → deploy → promote**:

```
init (local scaffold) → create (slot + slug) → deployment create (build+upload) → deployment promote (go live)
```

1. **Scaffold** a local project from a template — `hosting app init <dir>` / `hosting worker init <dir>`.
2. **Create the slot** in the workspace — `hosting app create --name --slug` → `appUuid` (or `workerUuid`). The `--slug` becomes the subdomain and **must be globally unique within the hosting domain**.
3. **(apps, optional) Wire local dev** — `hosting app env <appUuid>` prints the `.env.local` lines a local copy needs (Cargo OAuth + workspace + app UUID + API URL).
4. **Deploy** — `hosting deployment create --app-uuid <uuid> --source <dir>` uploads the source; the backend runs `npm ci && vite build` (apps) or bundles the entrypoint (workers) in a sandbox. Returns a `deploymentUuid`.
5. **Promote** — `hosting deployment promote --uuid <deploymentUuid>` points the live URL at that build.

Deploys build asynchronously — **poll `hosting deployment get <uuid>`** until the status is terminal before promoting (see [Async polling](#async-polling)).

## Apps

```bash
# Discover
cargo-ai hosting app list                          # all apps (filter with --folder-uuid <uuid>)
cargo-ai hosting app get <uuid>                     # one app's details + URL

# Scaffold locally (Vite + @cargo-ai/app-sdk)
cargo-ai hosting app init ./my-app --list-templates # see available templates, then:
cargo-ai hosting app init ./my-app --template blank --name "My App"

# Create the slot (slug must be globally unique → it's the subdomain)
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

Templates: `blank` (auto OpenAPI spec + Swagger UI) and `custom-integration` (a Cargo Custom Integration — manifest / actions / extractors / autocompletes / dynamic schemas). Workers have **no `env` subcommand** — they read config from the `env` argument passed to `fetch` at runtime.

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

- **`--slug` must be globally unique within the hosting domain** — it's the live subdomain (`<slug>.cargo.app`). A clash fails at `create`.
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
