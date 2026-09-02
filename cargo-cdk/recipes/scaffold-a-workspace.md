# Recipe: scaffold a workspace from scratch

**Use when** the user wants to stand up a new Cargo workspace as code,
reproducibly. Follow these steps as your execution plan.

## 1. Scaffold

```bash
cargo-ai cdk init my-workspace                              # the repo, empty
cargo-ai cdk init my-workspace --cookbook tam-building      # the repo plus a worked example
```

The scaffold itself never varies — it is one GTM repo from
`getcargohq/cargo-manifest`, with the CDK project in `infra/`. What varies is
whether a cookbook is layered on top, so reach for `--cookbook <slug>` when the
user wants a working pipeline to adapt rather than an empty project.
`cargo-ai cdk cookbook list` names them; see
[`references/cookbooks.md`](../references/cookbooks.md).

## 2. Install and authenticate

```bash
cd my-workspace && npm install         # pulls @cargo-ai/cdk + zod
cargo-ai login                         # authenticate + select the target workspace
cargo-ai whoami                        # confirm the selected workspace
```

## 3. (Optional) Generate typed config

```bash
cargo-ai cdk types                     # types config against this workspace's integrations
```

Not required to deploy, but it makes `defineConnector`/`defineModel` config and
`integrations.*` in workflow bodies type-check. See
[`../guides/typed-config.md`](../guides/typed-config.md).

## 4. Set secrets

Any `secret("NAME")` in the code resolves from the environment at deploy time.
Export each one first:

```bash
export HUBSPOT_API_KEY=...             # matches secret("HUBSPOT_API_KEY") in connectors/hubspot.ts
```

A missing env var fails the deploy with an unresolved `${NAME}` placeholder.

## 5. Plan, then deploy

```bash
cargo-ai cdk plan                      # offline diff — review what will be created
cargo-ai cdk deploy                    # create everything, write cargo.state.json
```

`deploy` prompts for confirmation. Review the plan output first; it lists each
resource as create / update / no-op.

## 6. Commit state

```bash
git add cargo.state.json && git commit -m "Deploy initial workspace"
```

`cargo.state.json` is the link from code to the deployed resources — and the only
handle on deployed plays/agents. Commit it. The `.gitignore` scaffolded by
`cdk init` already excludes `.cargo-ai/`, the lock, backup, and audit files.

## 7. Iterate

Edit `define*` files, then `cargo-ai cdk plan` → `cargo-ai cdk deploy` again — only
what changed is applied. To tear the workspace back down:

```bash
cargo-ai cdk destroy --all
```

See [`../guides/authoring-resources.md`](../guides/authoring-resources.md) to add
resources and [`../guides/deploy-and-state.md`](../guides/deploy-and-state.md) for
prune/drift/rollback.
