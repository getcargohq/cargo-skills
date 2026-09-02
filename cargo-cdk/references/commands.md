# Command reference — `cargo-ai cdk`

All subcommands accept `--dir <path>` (the project root, default `.`) and `--json`
(machine-readable output). Run from the project root so `.cargo-ai/` and
`cargo.state.json` land in the right place. Confirm the surface live with
`cargo-ai cdk <subcommand> --help`.

| Command | What it does |
|---|---|
| `cargo-ai cdk init <directory>` | Scaffold a GTM repo from `getcargohq/cargo-manifest`, with the CDK project in `infra/`. `--name <name>`, `--cookbook <slug>` (install a cookbook into the new project), `--force` (write into a non-empty directory). There is no template flag: the scaffold never varies, and what varies is the cookbook layered on top. |
| `cargo-ai cdk add cookbook/<slug>` | Copy a worked example into this project — `infra/<slug>/` plus its procedure under the skills directories. `--overwrite` (replace existing files; default skips them), `--yes`. Omit the address to choose interactively. |
| `cargo-ai cdk add connector/<integration>` | Authorize a connector in the browser and write its `defineConnector`. `--connector-uuid <uuid>` adopts one already created there. |
| `cargo-ai cdk cookbook list\|search\|view` | Browse the cookbooks `add` installs — `view <slug>` shows what one deploys, what it will ask you for, and its declared adaptations. |
| `cargo-ai cdk types` | Generate per-workspace types into `.cargo-ai/` for typed config. |
| `cargo-ai cdk plan` | Offline: compile the graph and diff against `cargo.state.json`. No API calls. |
| `cargo-ai cdk deploy` | Create/update resources in dependency order; write state. Prompts unless `--yes`. |
| `cargo-ai cdk refresh` | Read-only: report resources that drifted from code (changed/deleted out of band). |
| `cargo-ai cdk import <id> <uuid>` | Bind an existing live resource (`kind:slug`) to a uuid in state. |
| `cargo-ai cdk rollback` | Restore `cargo.state.json` from the pre-deploy snapshot. |
| `cargo-ai cdk destroy` | Tear down resources recorded in state. `--target <id>` for one, `--all` for everything. |

## Common flags

- `--dir <path>` — project root (default `.`).
- `--yes` — skip the confirmation prompt (**required in CI / non-interactive**).
- `--json` — machine-readable output.
- `--force` — steal a stale `cargo.state.lock`.

## `deploy` modifiers

- `cargo-ai cdk deploy --prune` — also **delete** resources that are in state but
  removed from code (reverse dependency order; adopted resources are released, not
  deleted).
- `cargo-ai cdk deploy --refresh` — re-read live resources and re-apply your code
  over any out-of-band changes.

## `destroy` targets

- `cargo-ai cdk destroy --target <kind:slug>` — remove one resource (refused if
  other state resources still depend on it).
- `cargo-ai cdk destroy --all` — remove everything in state, dependents first.

## Examples

```bash
cargo-ai cdk init acme                        # scaffold
cargo-ai cdk add cookbook/tam-building --dir acme  # layer a worked example on
cargo-ai cdk types --dir acme                 # type config
cargo-ai cdk plan --dir acme                  # preview
cargo-ai cdk deploy --dir acme --yes          # apply (non-interactive)
cargo-ai cdk refresh --dir acme               # drift report
cargo-ai cdk import agent:sdr <uuid> --dir acme  # adopt a live agent
cargo-ai cdk destroy --dir acme --all --yes   # tear down
```
