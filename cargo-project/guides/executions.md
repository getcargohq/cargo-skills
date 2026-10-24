# Executions — run a play, tool or workflow once, from code

A resource says what exists. An **execution** says what to do, **once**: enroll these
records into this play, run this tool on this input. You declare it in a `.ts` file,
`plan` lists it, and the next `deploy` starts it **after** the resources are applied.
A ledger in the workspace-held state remembers it, so it never runs again.

> **An execution acts on the outside world, exactly once, with no undo.** A play it
> enrolls records into may send email or LinkedIn actions and spend credits;
> reverting the code takes none of it back. An execution over a segment or filter
> **is a full batch** — it goes through the pilot gate in
> [`../../cargo-gtm/references/cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md)
> like any other: sample 10–20 records first (a small `filter` execution with a low
> `limit`, or `cargo-ai orchestration batch create` against the deployed workflow),
> report cost and hit-rate, and get the user's yes on the **record count** and the
> **credit estimate** before the execution that covers the whole audience is merged
> or deployed.

## `defineBatch` — once per record

```ts
// outputs/2026-10-14-expansion-pilot/pilot.ts
import { defineBatch } from "@cargo-ai/cdk";
import { contacts } from "../../infra/models/contacts";
import { expansion } from "../../infra/plays/expansion";

export const pilot = defineBatch("2026-10-14-expansion-pilot", {
  workflow: expansion,                       // a play, a tool, workflowRef(uuid), or an inline defineWorkflow(...)
  data: { kind: "filter", model: contacts, filter: { conjonction: "and", groups: [/* … */] }, limit: 50 },
});
```

- **`id`** — what the ledger remembers: `^[a-z0-9][a-z0-9_-]{0,127}$` (lowercase,
  digits, `-`, `_`, ≤ 128 chars). Unique per project — a second declaration with a
  different spec throws `Duplicate execution "…"`. Prefix it with a date: pending
  executions run in **id order**.
- **`workflow`** — a `definePlay` / `defineTool` handle, `workflowRef(uuid)` (the
  workflow *behind* a play or tool), or an inline `defineWorkflow(...)` (runs as custom
  nodes, never deployed as a resource). `playRef` / `toolRef` are **refused** — they
  carry the play's or tool's own uuid, not its workflow's.
- **`data`** — where the records come from:

| `kind` | Shape | Notes |
|---|---|---|
| `filter` | `{ model, filter?, limit }` | `limit` is **required** — nothing else bounds a filter. |
| `segment` | `{ segment }` | Every record in the segment at run time. |
| `recordIds` | `{ model, ids }` | Exactly these records. |
| `form` | `{ records }` | Records written in code; each is checked against the workflow's form. |
| `file` | `{ path, mappings? }` | A CSV in the repo, **≤ 50 MB**, uploaded by the deploy that runs it. `path` resolves like `defineFile` paths (relative → project dir; `new URL("./leads.csv", import.meta.url).pathname` from the batch's own file). `mappings` renames CSV headers to inputs. |

A **play** batch takes every kind except `file`, and its model must be the play's own.
A tool or inline-workflow batch takes any kind. Models, segments and workflows the
project doesn't define go by ref: `modelRef`, `segmentRef`, `workflowRef`.

## `defineRun` — once, on one input

```ts
import { defineRun } from "@cargo-ai/cdk";
import { backfillOwners } from "../../infra/tools/backfillOwners";

export const backfill = defineRun("2026-10-15-backfill-owners", {
  workflow: backfillOwners,          // a tool, workflowRef, or inline workflow — never a play
  data: { since: "2026-01-01" },     // the workflow's input; omit when it takes none
});
```

## Where they live

Every `.ts` file under **`outputs/`** beside `cargo.json`, at any depth, is imported —
even when `cargo.json` names no `executions` key. `"executions": [...]` in `cargo.json`
**replaces** that default; a `*` segment matches any non-hidden folder, in name order,
so an archive whose entries also hold scripts can name only their execution folders:

```json
{ "resources": "infra", "executions": ["outputs/*/executions"] }
```

Paths must stay inside the folder holding `cargo.json`. Nothing outside the named
folders is imported, so scripts and tests beside them never run.

## Plan and deploy

`plan` lists what will run and what already has:

```
Will execute once, after the resources (id order):
  ! batch  2026-10-14-expansion-pilot — expansion on contacts matching its filter (at most 50)

In the ledger, so never run again (edits to these are ignored):
  = batch  2026-10-01-backfill started on 2026-10-01
  = batch  2026-10-08-reengage refused on 2026-10-08: No records.
```

`deploy` applies resources first (so an execution can use a play created in the same
change), then starts each pending execution as a batch or run:

| Prints | What happened | In the ledger |
|---|---|---|
| `started` | Cargo started the batch or run | Yes — never runs again |
| `refused` | Cargo would not take it; nothing ran | Yes — fix it, give it a **new id** |
| `unconfirmed` | No answer came back; it **may** have started | Yes — check `orchestration batch list` before reissuing |
| `not started` | Failed before reaching Cargo (e.g. the CSV upload) | No — the next deploy retries it |
| `held` | Connected repo only: the merge's preview did not approve it | Stays pending; the next PR previews it again |

The deploy exits non-zero when any execution did not start, but still starts the ones
after it. Read the batch it started with `cargo-ai orchestration batch get <uuid>`.

## Exactly once — the ledger decides, not the code

| You change | What happens |
|---|---|
| The file's name or folder | Nothing — the id is the same |
| A batch's CSV, after it ran | Nothing — it was read once, when it ran |
| An execution that already ran | Nothing — `plan` lists it under "In the ledger" |
| The id | A new execution, which runs on the next deploy |
| Delete one that has not run | It never runs |
| `project rollback` | Nothing — rollback restores resources and **keeps** the ledger |

There is **no retry**; to run something again, add an execution with a new id.

- **Executions need workspace-held state.** On a project whose `cargo.state.json`
  still holds the resource map inline, a deploy with a pending execution stops:
  `Executions run only on a state in your workspace, where every deploy shares one ledger. Run \`cargo-ai project state create\` …`.
- **`deploy --draft` never runs them** (`Executions do not run with --draft. Deploy without it to run them.`).
- **From a connected GitHub repo** the PR comment previews each execution and the
  merge starts only what that preview approved — see
  [`../recipes/deploy-from-ci.md`](../recipes/deploy-from-ci.md).
