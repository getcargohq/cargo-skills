# Troubleshooting

## `✗ Deploy failed: connector:<slug>: Invalid configuration`

The connector's `config` doesn't match the integration's schema. Most often the
credential wasn't wrapped in `secret()` — a data connector's credential field
expects an encryption envelope, and `secret("ENV_VAR")` produces it. Fix:

```ts
config: { method: "privateApp", accessToken: secret("HUBSPOT_API_KEY") }, // not a bare string
```

Run `cargo-ai project types` so the config type-checks against the real schema at
author time and surfaces the required shape (see
[`../guides/typed-config.md`](../guides/typed-config.md)). The deploy error now also
surfaces the API's structured detail (which field, the reason) — read past the
terse "Invalid configuration" summary.

## `unresolved placeholder "${NAME}"`

A `secret("NAME")` or `env("NAME")` had no matching environment variable at deploy.
The deploy refuses to send a literal `${NAME}` to the API. Export it first:

```bash
export NAME=...
cargo-ai project deploy
```

## Deploy refuses: workspace mismatch

`cargo.state.json` records the workspace it was deployed to; `deploy`/`destroy`
refuse when that ≠ the currently selected workspace (a guard against reconciling a
dev definition into prod). Select the right workspace at `login`, or use a separate
state file per environment.

## `No cargo.json in <dir> or above it`

Every `cargo-ai project` command (except `init` and `cookbook`) walks up from where it
runs, as far as the repo root, to the nearest `cargo.json`, and stops when there is
none. It no longer guesses the project from an `infra/` folder or a `package.json`
(`@cargo-ai/cdk` ≥ 1.0.112). Add the file at the project's root — the folder that
holds, or should hold, `cargo.state.json` — naming the folder of `.ts` resources:

```bash
echo '{ "resources": "infra" }' > cargo.json
```

`"executions": ["outputs"]` is optional (`outputs/` beside `cargo.json`, at any depth,
is the default; entries take a `*` segment, e.g. `"outputs/*/executions"`). A repo with several projects has one `cargo.json` per project; commands use
the nearest. `--dir <path>` changes where the lookup starts, not the rule. A
`cargo.json` that is not JSON, has unknown keys, or names a folder outside its own
also stops the command, with the reason.

## `This project's cargo.state.json is at infra/cargo.state.json, but it lives in the project's folder`

`cargo.state.json` lives beside `cargo.json`, never inside the resource folder. An
older project kept it in `infra/`; reading the root one instead would point the
deploy at another state (or start an empty one and orphan everything the old file
tracks), so the command stops and prints the move. Run it from the project's folder
and commit the result:

```bash
mv infra/cargo.state.json cargo.state.json
git add -A cargo.state.json infra/cargo.state.json && git commit -m "Move the state pointer beside cargo.json"
```

`This project has two cargo.state.json files` means both exist: keep the one that
points at this project's state (`cargo-ai project state list` shows which uuid that
is) beside `cargo.json`, and delete the other.

## `uses.<connector>.<action>` is untyped, or `config` isn't type-checked

Types aren't generated or aren't wired in. Run `cargo-ai project types` and ensure
`tsconfig.json` `include` has the explicit glob `".cargo-ai/**/*.d.ts"` (a bare
`.cargo-ai` dot-dir is ignored by TypeScript). There is nothing to import at runtime:
the generated file is types only. Re-run `project types` after changing workspace
integrations.

## `could not parse the workflow body`

A `defineWorkflow` body must be a supported JS subset — it's **parsed, not
executed**. Remove `await`, `throw`, `try/catch`, closures over outer variables,
and destructuring; compile workflow files with a modern target (ES2022+) and don't
instrument them with coverage tools (they rewrite the function source). Use
`js(({ nodes }) => …)` for logic outside the supported subset.

## Deploy is slow / seems to hang on a worker or app

Workers and apps **build server-side** — the reconciler uploads the bundle, waits
for the build, and promotes. This is expected to take longer than other resources.
Ensure the worker bundle dir has `manifest.json`, `package.json`, a
`package-lock.json` and an entrypoint (`src/index.ts`, `src/index.js`, `index.ts` or
`index.js`); the build runs server-side, so nothing needs pre-building.

## A play or agent got orphaned (state lost)

Plays, agents and alerts have no slug, so the deploy state is the only link to them.

**If you lost the `cargo.state.json` pointer** but the state still exists in the
workspace, this is recoverable without touching resources: `cargo-ai project state list`
shows every state in the workspace, then `cargo-ai project state bind <uuid>` repoints
the repo at the right one. Commit the restored pointer.

**If the state itself is gone**, find each live uuid via the matching capability skill
and rebind one at a time: `cargo-ai project import agent:<slug> <uuid>`.

Never delete `cargo.state.json` to "start clean" — on a pre-remote-state project that
is the resource map itself, and on a current one it is the only record of which of the
workspace's states is yours.

## `zod` errors, or schemas that should match don't

`@cargo-ai/cdk` takes **zod as a peer dependency** (`^4.4.3`, since `@cargo-ai/cdk`
1.0.76) precisely so a project resolves exactly one copy. Two copies in the tree give
you two different `z` identities and schemas built with one won't satisfy the other.
Check with `npm ls zod` — one entry, on a `4.x` matching the peer range.

## `plan` shows `create` for a resource that already exists

Its `kind:slug` id didn't match state. Either the slug in the `define*` changed, or
you migrated a workspace without importing — bind it: `cargo-ai project import <kind:slug> <uuid>`
(see [`../recipes/migrate-existing-workspace.md`](../recipes/migrate-existing-workspace.md)).

## Still stuck

File a report so the Cargo team sees it:
`cargo-ai workspaceManagement report create --title "<summary>" --description "<commands tried, errorMessage, expected vs actual>"`
— see [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md).

## `Executions run only on a state in your workspace, where every deploy shares one ledger`

A `defineBatch` / `defineRun` is pending and the project's `cargo.state.json` still
holds the resource map inline. The exactly-once ledger only exists on workspace-held
state, so the deploy stops before running anything. Run `cargo-ai project state create`,
commit the new pointer, and deploy again. See [`../guides/executions.md`](../guides/executions.md).

## An execution says `refused`, `unconfirmed` or `not started`

- `refused` — Cargo would not take it and nothing ran, but it **is** in the ledger
  (`plan` shows `= batch <id> refused on <date>: <reason>`). Fix it and give it a new id;
  editing it in place does nothing.
- `unconfirmed` — the deploy never heard back, so it may have started. It is in the
  ledger. Check `cargo-ai orchestration batch list` (or `run list`) before adding a new
  id, or you may run it twice.
- `not started` — failed before reaching Cargo (a CSV upload, say). Not in the ledger;
  the next deploy retries it.

## `Duplicate execution "…" — execution ids must be unique in a project`

Two files declare the same id with different specs. Ids are the ledger key: rename the
newer one (a date prefix keeps the order readable).

## `409 stateAutoDeployed` — "Cargo deploys this state from <repo> when <branch> changes"

The state is connected to GitHub with Deploy on push on, so only Cargo's service user
may deploy it. A GitHub Actions deploy or a hand-run `deploy` is refused. Delete the
Actions deploy workflow, or turn auto-deploy off (**Settings → States**, or
`cargo-ai project state disconnect`) to deploy by hand.

## PR check: `Needs approval: large impact`

The merge would exceed an impact threshold (100 emails / LinkedIn actions / chat
messages, 5,000 audience adds, 2,500 credits) or its impact can't be counted (model or
segment created in the same change, unreadable steps, a send inside a loop, a
`workflowRef` batch). Read the "What a merge will set in motion" table in the PR
comment, get the user's approval on those numbers, then add the `cargo:approve-impact`
label; Cargo re-plans and the check passes. See
[`../recipes/deploy-from-ci.md`](../recipes/deploy-from-ci.md).

## An execution shows `held` after a merge

On a connected repo a merge starts an execution only when an approved PR plan counted
that exact version of it and its record count hasn't grown past the preview's
allowance (10%, at least one record). Otherwise it stays pending; open a PR that touches
the project so it is previewed again.

## A connected-repo deploy fails on an unresolved `secret()`

Cargo's run has no `.env`. Move the value into a workspace env var
(`cargo-ai workspaceManagement envVar create --key NAME --secret`) and reference it with
`workspaceEnv("NAME")` at the secret-typed position; workers and apps inherit workspace
env vars without a reference.
