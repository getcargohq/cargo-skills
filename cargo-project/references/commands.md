# Command reference — `cargo-ai project`

Every subcommand except `init` and `cookbook` accepts `--dir <path>` (where to start looking for `cargo.json`, default `.`), and most accept `--json`
(machine-readable output; not `types`, `rollback` or `state bind`). Each one walks up from there to the nearest
`cargo.json` (stopping at the repo root) and runs in that project; with none it stops and prints
`echo '{ "resources": "infra" }' > cargo.json`. `cargo.state.json` is read and written beside `cargo.json`.
Confirm the surface live with `cargo-ai project <subcommand> --help`.

| Command | What it does |
|---|---|
| `cargo-ai project init <directory>` | Scaffold a GTM repo from the Cargo template (`getcargohq/cargo-manifest`): `cargo.json` and `cargo.state.json` at the root, the resources in `infra/`. `--name <name>`, `--cookbook <slug>` (install a cookbook into the new project), `--force` (write into a non-empty directory). There is no template flag: the scaffold never varies, and what varies is the cookbook layered on top. |
| `cargo-ai project add cookbook/<slug>` | Copy a worked example into this project — resources under `infra/<slug>/`, any helper scripts under `scripts/<slug>/`, and its procedure (`SKILL.md`, `references/`, `evals/`) under **both** `.claude/skills/<slug>/` and `.agents/skills/<slug>/`. Runs `check` afterwards so a duplicate slug surfaces immediately; never deploys, and never touches your `package.json`/`tsconfig.json`. `--overwrite` (replace existing files; default skips them), `--yes`. Omit the address to choose interactively. |
| `cargo-ai project add connector/<integration>` | Authorize a connector in the browser and write its `defineConnector`. `--connector-uuid <uuid>` adopts one already created there. |
| `cargo-ai project cookbook list\|search\|view` | Browse the cookbooks `add` installs — `view cookbook/<slug>` shows what one deploys, what it will ask you for, and its declared adaptations. |
| `cargo-ai project types` | Generate per-workspace types into `.cargo-ai/` for typed config. |
| `cargo-ai project check` | Offline: validate the resource tree — every body / slug / graph error in one pass, **without** computing the diff, so it needs no state. The fast, CI/editor-friendly subset of `plan`. `--json`. |
| `cargo-ai project plan` | Compile the graph and diff against this project's deploy state (read from the workspace). Creates nothing. `--draft` (preview as `deploy --draft`), `--state-file <path>` (diff against a local state file, no credentials), `--workspace-env-keys <path>` (JSON array of catalog keys, so `workspaceEnv()` names are checked offline), `--json`. **Signed out**, it plans against `cargo.state.cache.json` — the last cloud read, gitignored, rewritten on every read — and says so ("may be stale"); with no cache every resource plans as a create, and a domain's per-record DNS diff is skipped. |
| `cargo-ai project info` | Print the resolved project — every declared resource, the file that declared it, whether it is deployed, and any diagnostics. Offline, and never fails. `--json`. |
| `cargo-ai project deploy` | Create/update resources in dependency order, then start pending executions; write state. Prompts unless `--yes`. `--dry-run` (show the plan, apply nothing, take no lock), `--draft`, `--prune`, `--refresh`, `--recreate-deleted`, `--force`, `--json` — see "`deploy` modifiers" below. |
| `cargo-ai project refresh` | Read-only: report resources that drifted from code, **naming the drifted fields** — `modified externally: agent:sdr (release.systemPrompt, release.temperature)`, `deleted externally: folder:archive`. Field names only (state keeps a hash per field, never the value); a resource last deployed by an older CLI shows no fields until its next deploy; a transient read error reports `unknown`, never a deletion. `--json`. |
| `cargo-ai project graph` | Print the resource graph — every resource and what it points at — as a Mermaid flowchart. Reads the **live workspace** by default; `--project` draws the local project offline (no API calls); `--plan` (needs `--project`) marks each resource create/update/delete against state; `--json` (CargoGraph JSON). |
| `cargo-ai project import <id> <uuid>` | Bind an existing live resource (`kind:slug`) to a uuid in state. |
| `cargo-ai project pull` | Generate `define*` source from a live workspace **and adopt it** into this project's deploy state, so the next deploy is a no-op rather than a duplicate-create. `--types <kinds>` (comma-separated; default all — connector, customIntegration, model, relationship, segment, folder, capacity, territory, tool, play, mcpServer, agent, alert, file, worker, app, context, mailbox, role; a file's non-default `index`/`visibility`/`mirrorToContext` and an agent's writable `files` entries come across), `--dry-run`, `--no-adopt` (write files but skip adoption — leaves a repo whose deploy would duplicate; advanced), `--force`, `--json`. |
| `cargo-ai project rollback` | Restore the deploy state from the snapshot taken before the last deploy/destroy/import. |
| `cargo-ai project state list\|create\|bind\|remove` | Inspect, repoint and remove this project's deploy state — the workspace-held record of which live resource each declared one became. See [`../guides/deploy-and-state.md`](../guides/deploy-and-state.md). |
| `cargo-ai project state connect` | Connect this project's state to its GitHub repo: every PR gets a plan comment, pushes to the production branch deploy (as a service user). `--branch <name>` (default: origin's default branch), `--connector <uuid>` (GitHub connector whose account administers the repo), `--no-auto-deploy` (plan PRs only), `--json`. **Deploys the production branch immediately** unless `--no-auto-deploy`. See [`../recipes/deploy-from-ci.md`](../recipes/deploy-from-ci.md). |
| `cargo-ai project state disconnect` | Stop planning and deploying from GitHub. The state and its resources stay. |
| `cargo-ai project destroy` | Tear down resources recorded in state. `--target <id>` for one, `--all` for everything. |

## Common flags

- `--dir <path>` — where the `cargo.json` lookup starts (default `.`).
- `--yes` — skip the confirmation prompt (**required in CI / non-interactive**).
- `--json` — machine-readable output.
- `--force` — steal a stale `cargo.state.lock`.

## `deploy` modifiers

- `cargo-ai project deploy --prune` — also **delete** resources that are in state but
  removed from code (reverse dependency order; adopted resources are released, not
  deleted).
- `cargo-ai project deploy --refresh` — re-read live resources and re-apply your code
  over any out-of-band changes. A resource **deleted** outside the project stops it:
  `N resource(s) were deleted outside the project (…). Re-run with --recreate-deleted to
  restore them, or remove them from your code if the deletion was intentional.`
- `cargo-ai project deploy --refresh --recreate-deleted` — also recreate those
  (only valid with `--refresh`; a recreated play/agent/alert gets a **new uuid**).
- `cargo-ai project deploy --draft` — stage plays, tools, agents, apps and workers as
  unpublished drafts (creating the row if missing), create brand-new supporting infra
  they reference, leave existing live config unchanged. Never runs executions. Re-run
  plain `deploy` to promote.
- `cargo-ai project deploy --dry-run` — print the plan without applying; takes no lock.

## `destroy` targets

- `cargo-ai project destroy --target <kind:slug>` — remove one resource (refused if
  other state resources still depend on it).
- `cargo-ai project destroy --all` — remove everything in state, dependents first.

## Examples

```bash
cargo-ai project init acme                        # scaffold
cargo-ai project add cookbook/tam-building --dir acme  # layer a worked example on
cargo-ai project types --dir acme                 # type config
cargo-ai project plan --dir acme                  # preview
cargo-ai project deploy --dir acme --yes          # apply (non-interactive)
cargo-ai project refresh --dir acme               # drift report
cargo-ai project import agent:sdr <uuid> --dir acme  # adopt a live agent
cargo-ai project destroy --dir acme --all --yes   # tear down
```
