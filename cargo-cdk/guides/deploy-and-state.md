# Deploy & state

The deploy engine compiles your `define*` graph, diffs it against
`cargo.state.json`, and reconciles the difference to live Cargo infrastructure in
dependency order — persisting state after **each** resource so a mid-deploy crash
leaves a recoverable file.

For every flag, see [`../references/commands.md`](../references/commands.md).

## plan → deploy → destroy

```bash
# Offline: compile the graph and diff against cargo.state.json. No API calls.
cargo-ai cdk plan --dir my-workspace

# Create/update resources in dependency order; write cargo.state.json.
cargo-ai cdk deploy --dir my-workspace          # prompts for confirmation
cargo-ai cdk deploy --dir my-workspace --yes    # non-interactive (CI)

# Tear down.
cargo-ai cdk destroy --dir my-workspace --target model:contacts   # one resource
cargo-ai cdk destroy --dir my-workspace --all                     # everything in state
```

Re-running `deploy` only changes what changed — an unchanged workspace is a no-op.
`deploy` is idempotent: for each resource it updates by uuid if state has one,
otherwise adopts a slug-addressable match (connector/model) that already exists,
otherwise creates.

## `cargo.state.json` — commit it

`deploy` writes `cargo.state.json`: the link from your code to the resources Cargo
created. It records only `{hash, uuid, outputs}` per resource — **never secret
values**.

**Commit it.** It is the *only* handle on a deployed **play** or **agent**, which
have no slug (unlike connectors and models, which self-heal by slug). Losing state
orphans those resources. If it happens, re-establish a link with `import` (below).

Git-ignore the generated types and the CDK's working files (but **not**
`cargo.state.json`). `cargo-ai cdk init` scaffolds this:

```gitignore
.cargo-ai/
cargo.state.lock
cargo.state.bak.json
cargo.state.audit.jsonl
```

The `cargo.state.lock` prevents two deploys racing; `--force` steals a stale lock.

**Workspace guard:** state records the workspace it was deployed to; the CDK
refuses to `deploy`/`destroy` when the state's workspace ≠ the currently selected
workspace, so you can't accidentally reconcile a dev definition into prod. Select
the right workspace at `login` (or with the workspace flag) before deploying.

## Prune — deleting resources removed from code

`deploy` does **not** delete a resource just because you removed it from code —
that would make a typo destructive. To also remove resources that are in state but
no longer in code:

```bash
cargo-ai cdk deploy --dir my-workspace --prune
```

Prune deletes in reverse dependency order (dependents before their dependencies).
Adopted resources (linked via `adopt: true` or `import`) are **released** from
state, not deleted.

## Drift — `refresh` and `deploy --refresh`

A resource can change outside the CDK (someone edits an agent in the Cargo UI).
The CDK captures a fingerprint of each resource at deploy and compares on refresh:

```bash
cargo-ai cdk refresh --dir my-workspace          # read-only: report what drifted
cargo-ai cdk deploy  --dir my-workspace --refresh # re-read live, re-apply your code over drift
```

`refresh` reports resources changed or deleted out-of-band; `deploy --refresh`
makes your code the source of truth again.

## Adopting existing resources — `import`

To bring an already-live resource under CDK management, bind it into state by
mapping its **code id** to its **live uuid**:

```bash
cargo-ai cdk import model:contacts 6f0c8e2a-… --dir my-workspace
```

The code id is `kind:slug` (e.g. `connector:hubspot`, `model:contacts`,
`agent:sdr`). After import, `deploy` updates that resource instead of creating a
duplicate. Slug-addressable kinds (connector, model) can also self-adopt on deploy
by matching slug; uuid-only kinds (play, agent, capacity, territory, segment) need
`import` to recover a lost link. See
[`../recipes/migrate-existing-workspace.md`](../recipes/migrate-existing-workspace.md).

## Recovery — `rollback`

`deploy` snapshots the pre-deploy state to `cargo.state.bak.json`. If a deploy went
wrong, restore the snapshot:

```bash
cargo-ai cdk rollback --dir my-workspace
```

This restores the state file — it does not undo live API changes already made;
follow with a corrected `deploy`.

## Async resources — workers & apps

Most resources create synchronously. **Workers and apps build server-side**: on
deploy the reconciler uploads the bundle, waits for the build, and promotes it —
so a deploy touching a worker/app takes longer. Author worker runtime code with
`createWorker` (`@cargo-ai/worker-sdk`) and build to `index.js` before deploying;
the CDK validates the bundle files (`index.js`, `manifest.json`, `package.json`,
`package-lock.json`) exist at define time. The live URL is exposed on the handle
(`webhook.url`, `dashboard.url`). For imperative one-off hosting operations, see
[`../../cargo-hosting/SKILL.md`](../../cargo-hosting/SKILL.md).
