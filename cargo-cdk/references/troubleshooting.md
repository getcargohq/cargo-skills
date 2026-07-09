# Troubleshooting

## `✗ Deploy failed: connector:<slug>: Invalid configuration`

The connector's `config` doesn't match the integration's schema. Most often the
credential wasn't wrapped in `secret()` — a data connector's credential field
expects an encryption envelope, and `secret("ENV_VAR")` produces it. Fix:

```ts
config: { method: "privateApp", accessToken: secret("HUBSPOT_API_KEY") }, // not a bare string
```

Run `cargo-ai cdk types` so the config type-checks against the real schema at
author time and surfaces the required shape (see
[`../guides/typed-config.md`](../guides/typed-config.md)). The deploy error now also
surfaces the API's structured detail (which field, the reason) — read past the
terse "Invalid configuration" summary.

## `unresolved placeholder "${NAME}"`

A `secret("NAME")` or `env("NAME")` had no matching environment variable at deploy.
The CDK refuses to send a literal `${NAME}` to the API. Export it first:

```bash
export NAME=...
cargo-ai cdk deploy
```

## Deploy refuses: workspace mismatch

`cargo.state.json` records the workspace it was deployed to; `deploy`/`destroy`
refuse when that ≠ the currently selected workspace (a guard against reconciling a
dev definition into prod). Select the right workspace at `login`, or use a separate
state file per environment.

## `.cargo-ai/` or `cargo.state.json` landed in the wrong directory

`npx`/`cargo-ai` resolve from the **nearest `package.json`**, not your shell's cwd.
Run `cdk` commands from the project root, or pass `--dir <project-root>` explicitly.

## `integrations.<slug>` is `any` / not callable, or `config` isn't type-checked

Types aren't generated or aren't wired in. Run `cargo-ai cdk types`, ensure
`tsconfig.json` `include` has the explicit glob `".cargo-ai/**/*.d.ts"` (a bare
`.cargo-ai` dot-dir is ignored by TypeScript), and `import "./.cargo-ai/cargo-register.js";`
at the top of workflow modules that use `integrations.*`. Re-run `cdk types` after
changing workspace integrations.

## `could not parse the workflow body`

A `defineWorkflow` body must be a supported JS subset — it's **parsed, not
executed**. Remove `await`, `throw`, `try/catch`, closures over outer variables,
and destructuring; compile workflow files with a modern target (ES2022+) and don't
instrument them with coverage tools (they rewrite the function source). Use
`js(({ nodes }) => …)` for logic outside the supported subset.

## Deploy is slow / seems to hang on a worker or app

Workers and apps **build server-side** — the reconciler uploads the bundle, waits
for the build, and promotes. This is expected to take longer than other resources.
Ensure the worker bundle dir has a built `index.js` (+ `manifest.json`,
`package.json`, `package-lock.json`) before deploying.

## A play or agent got orphaned (state lost)

Plays and agents have no slug, so `cargo.state.json` is the only link to them.
**Commit the state file.** If it's lost, find the live uuid via the matching
capability skill and rebind: `cargo-ai cdk import agent:<slug> <uuid>`. Never
delete `cargo.state.json` to "start clean" — you'll orphan every play/agent it
tracked.

## `plan` shows `create` for a resource that already exists

Its `kind:slug` id didn't match state. Either the slug in the `define*` changed, or
you migrated a workspace without importing — bind it: `cargo-ai cdk import <kind:slug> <uuid>`
(see [`../recipes/migrate-existing-workspace.md`](../recipes/migrate-existing-workspace.md)).

## Still stuck

File a report so the Cargo team sees it:
`cargo-ai workspaceManagement report create --title "<summary>" --description "<commands tried, errorMessage, expected vs actual>"`
— see [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md).
