# Recipe: deploy from CI — connect the repo, or run your own pipeline

**Use when** the user wants the workspace to stay in sync with the repo without anyone
running `cargo-ai project deploy` by hand — a plan on every pull request, a deploy on
every merge.

There are two ways. **Lead with the first.** Use exactly one per project: while Cargo
deploys a state from GitHub it **refuses every other deploy** of that state, so a
leftover Actions deploy fails on the lock.

| | **Connected repository** (recommended) | **Your own CI** (fallback) |
|---|---|---|
| Who runs it | Cargo, from the Cargo GitHub app | Your pipeline (GitHub Actions, …) |
| Setup | One `project state connect` | A token secret + a workflow file |
| PR plan | Commented on every PR, updated on every commit, as a `Cargo` check | Whatever your workflow prints |
| Merge deploy | `deploy --yes` as a service user, credential minted per run | `deploy --yes --json` with your token |
| Large-impact gate | Built in (`cargo:approve-impact` label) | None — you build it |
| `secret()` | **Unavailable** — use `workspaceEnv()` | Works (CI secrets as env vars) |
| Executions | Merge starts only what the PR previewed | Run on whatever deploy reaches them |

## A. Connect the repository

### Prerequisites

- The project pushed to GitHub, with **`cargo.json` and `cargo.state.json` committed**
  in its directory, `@cargo-ai/cdk` pinned in `package.json`, and a **lockfile**
  (Cargo runs the repo's own pinned cdk, not one of its own).
- `cargo.state.json` names a **workspace-held** state (`project state create` if it
  still holds the resource map inline).
- A GitHub connector in the workspace whose account **administers** the repo
  (`cargo-ai project add connector/github`), and the **Cargo GitHub app installed** on
  the repo with contents:read, checks:write, pull_requests:write and the push +
  pull_request events.

### Connect

```bash
cargo-ai project state connect                    # from the project directory
#   --branch <name>      production branch (default: origin's default branch, never the checked-out one)
#   --connector <uuid>   GitHub connector administering the repo (default: yours, else the workspace's first)
#   --no-auto-deploy     plan pull requests, but do not deploy pushes
#   --json
cargo-ai project state disconnect                 # stop planning and deploying; state and resources stay
```

The repository comes from `origin`, the directory from where `cargo.json` sits, the
state from `cargo.state.json`. `project init` offers to
connect once the scaffold is pushed. The web-app equivalent is **Settings → States**.

> **Connecting deploys immediately.** With auto-deploy on (the default), connect deploys
> the production branch head right away: `Connected this project to github.com/<repo> —
> pull requests get a plan, pushes to <branch> deploy. Deploying <branch> (<sha>) now.`
> Run `cargo-ai project plan` first and make sure what is on that branch is what you
> want live — including any pending executions. Pass `--no-auto-deploy` to start with
> plans only.

Cargo creates a service user named `GitHub <owner>/<repo>` holding the caller's
permissions and deploys as it; you can swap in any service user whose permissions you
hold (see [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md)).

Refusals: `repositoryNotAdministered` (403 — the connector's account is not a repo
admin; this is what stops another workspace claiming it), `appNotInstalled`,
`appSuspended`, `appAccessNotAccepted`, `productionBranchNotFound`,
`projectFileNotFound` (no `cargo.json` there on the production branch),
`statePointerNotFound` / `statePointerMismatch` (fix with `project state bind <uuid>`,
commit), `stateAlreadyConnected`, `githubUnavailable`. Locally it refuses without
`cargo.json`, a state uuid, an `origin` remote, or a GitHub connector, each with the
command to fix it.

### What a pull request does

- Cargo plans every PR and comments the plan, updating the same comment on every later
  commit. The plan is read-only. The check is named `Cargo` (or `Cargo (<directory>)`)
  and fails only when the project doesn't compile — make it **required** in branch
  protection.
- The comment's **"What a merge will set in motion"** table has one row per play
  created or updated and left enabled, and one per execution: Runs / Records /
  Sends, at most / Credits, at most. Counts assume every branch is taken; actions on a
  connector with your own API key count 0 credits; tool and agent steps are noted, not
  counted.
- A repo can hold several projects (one connection per directory). A PR plans only the
  projects whose directory changed — all of them when the root `package.json`,
  `package-lock.json` or `cargo.state.json` changed. Code imported from outside a
  project's directory doesn't count.
- PRs from forks are not planned. Private npm dependencies are not supported.

### Approving a large merge

The check fails with **`Needs approval: large impact`** when the merge, summed over its
plays and executions, would exceed any of:

| Effect | Threshold (strictly greater than) |
|---|---|
| Emails | 100 |
| LinkedIn actions | 100 |
| Chat messages | 100 |
| Audience adds | 5,000 |
| Credits | 2,500 |

…or when its impact **can't be counted**: its model or segment is created in the same
change, its steps can't be read, it sends inside a loop, or it is a `workflowRef` batch.
To proceed, a reviewer adds the label **`cargo:approve-impact`** (Cargo creates it) and
Cargo re-plans, passing; removing the label fails it again. Treat the label as the
approval step in [`../../cargo-gtm/references/cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md):
read the table, quote the record count and credit ceiling to the user, and add it only
on their explicit yes — never to unblock a merge yourself.

### What a merge does

- A push to the production branch runs `cargo-ai project deploy --yes` as the service
  user, with a credential minted for that run and revoked after. No workflow file, no
  token. Deploys of one project run one at a time; only the newest pending commit
  applies. `--prune` is shown in the comment but never applied — prune stays manual.
- An **execution** starts on merge only when a successful plan counted this exact
  version of it, that plan was approved (under the limits, or labelled), and its record
  count now is within the preview's allowance (10% growth, at least one record).
  Otherwise it is **`held`** and stays pending for the next PR to preview. One pushed
  straight to the production branch is held too. See
  [`../guides/executions.md`](../guides/executions.md).
- **`secret()` does not resolve** — a Cargo run has no `.env`. Store the value as a
  workspace env var and reference it with `workspaceEnv("NAME")` at secret-typed
  positions; for a worker or app `env`, which rejects `workspaceEnv()`, the workspace
  env var is inherited automatically.
- While Deploy on push is on, any other deploy of the state gets **409
  `stateAutoDeployed`** ("… If this run is a GitHub Actions deploy, delete
  .github/workflows/cargo-deploy.yml. To deploy by hand, turn auto-deploy off in
  Settings > States."). Delete any Actions deploy workflow when you connect.

## B. Your own CI (fallback)

Use when the repo isn't on GitHub, the Cargo app can't be installed, or the pipeline
needs `secret()` values. Don't run this for a connected state — its deploys are refused.

### Prerequisites

- **A workspace-scoped API token** (not OAuth) from **Settings → API**, stored as a CI
  secret (`CARGO_API_TOKEN`). See
  [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md)
  for `token create`; token values are secrets.
- **`cargo.json` and `cargo.state.json` committed** (the pointer
  `{"stateUuid": "…"}`; without it the deploy fails rather than recreating everything).
- **Any `secret()` env vars** set as CI secrets too (e.g. `HUBSPOT_API_KEY`).

### The CI steps

```bash
npm install -g @cargo-ai/cli@latest
npm ci
cargo-ai login --token "$CARGO_API_TOKEN"   # selects the token's workspace
cargo-ai project deploy --yes --json        # --yes is REQUIRED (no TTY to confirm at)
```

```yaml
# .github/workflows/deploy.yml
- run: npm install -g @cargo-ai/cli@latest && npm ci
- run: cargo-ai login --token "$CARGO_API_TOKEN"
  env:
    CARGO_API_TOKEN: ${{ secrets.CARGO_API_TOKEN }}
- run: cargo-ai project deploy --yes --json
  env:
    HUBSPOT_API_KEY: ${{ secrets.HUBSPOT_API_KEY }}
```

### Critical CI rules

- **`--yes` is mandatory.** `deploy`/`destroy` refuse to run non-interactively without it.
- **The workspace guard still applies.** Deploy refuses if the token's workspace ≠ the
  state's workspace. One state per environment.
- **CI does not need to commit state back** on a workspace-held state; a
  pre-remote-state project (resource map inline in `cargo.state.json`) does — migrate it
  with `project state create`.
- **Preview on pull requests** with `cargo-ai project plan --json` (read-only), and gate
  `deploy` to the protected branch.
- **There is no impact gate.** Nothing stops a merge that enrolls a whole model into a
  sending play, or a pending execution over a segment. Review the plan's plays and
  "Will execute once" lines against the cost gate before merging.
- **Prune deliberately.** Add `--prune` only when CI should delete resources removed
  from code.
