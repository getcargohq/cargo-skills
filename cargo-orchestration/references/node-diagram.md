# Diagramming a node graph (Mermaid)

A workflow the user can't see is a workflow they can't approve. A node graph is a
directed graph with routing, fallbacks, and paid steps in it — prose flattens all
three. Render it as a Mermaid `flowchart` instead: it costs nothing, and it renders
in Claude Code, on GitHub, and in the Cargo docs.

## When to draw one

- **At the plan gate**, before `draft-release deploy` / `cdk deploy` — the diagram
  *is* the "nodes and data flow" half of the plan ([`../../cargo/references/interaction.md`](../../cargo/references/interaction.md) §1).
- **When explaining an existing workflow, tool, or play** — "what does this play
  do?" is answered by `release get-deployed` piped through the script below.
- **When reporting a trace** — the graph with the failing node marked red, next to
  the error ([`../../cargo-diagnostics/references/run-trace.md`](../../cargo-diagnostics/references/run-trace.md)).

Skip it for a linear graph of three nodes or fewer, or a one-node change — say what
changed in a sentence instead. A diagram of `start → enrich → end` is ceremony.

## Generate it

```bash
# An existing workflow, tool, or play (get the workflowUuid from `tool list` / `play list`)
cargo-ai orchestration release get-deployed --workflow-uuid <uuid> \
  | node <skill-dir>/scripts/workflow-to-mermaid.ts --title "<workflow name>"

# The draft you are about to deploy — the plan-gate case
cargo-ai orchestration release get-draft --workflow-uuid <uuid> \
  | node <skill-dir>/scripts/workflow-to-mermaid.ts

# A graph you are authoring locally, before it exists server-side
node <skill-dir>/scripts/workflow-to-mermaid.ts --file nodes.json

# The graph a specific run executed
cargo-ai orchestration run get <run-uuid> \
  | node <skill-dir>/scripts/workflow-to-mermaid.ts --highlight <failing-node-slug>
```

**Two kinds of run payload.** A run from `action execute` carries its inline
`nodes` and has no `releaseUuid` — diagram it directly. A run from a deployed
tool or play is the other way round: `releaseUuid`, no `nodes`, because the graph
lives on the release. The script detects that case and prints the `release get`
command to run instead of drawing an empty diagram.

| Flag | Effect |
| --- | --- |
| `--file <path>` | Read a file instead of stdin. Accepts `release get`, `release get-draft`, `template get`, an ad-hoc `run get`, or a bare `nodes` array. |
| `--title <text>` | Title above the diagram. |
| `--direction TD\|LR` | Flow direction (default `TD`; `LR` reads better for long linear graphs). |
| `--paid <slugs>` | Mark credits-billing nodes with 💳. |
| `--highlight <slugs>` | Mark nodes red — the failing node in a trace. |

The script needs Node ≥ 22.18 and has no dependencies. Prefer it over
transcribing by hand: it reads the graph by `uuid`, so it survives the duplicate
slugs and dangling children that real releases contain (see below). If it isn't
available, hand-write the diagram using the mapping table, and check the
[correctness rules](#rules-that-make-the-diagram-true) yourself.

## What maps to what

| Node | Mermaid | Rendered as |
| --- | --- | --- |
| `start` / `end` | `n0(["start"])` | stadium |
| `branch`, `filter`, `switch`, `split` | `n1{"Enterprise?"}` | diamond |
| `connector` | `n2["Enrich Company<br/>companyEnrich.enrichByDomain"]` | rectangle |
| `tool` | `n3[["tool e487d28e"]]` | subroutine box |
| `agent` (node kind or native action) | `n4{{"Apply the taxonomy"}}` | hexagon |
| `python`, `script` | `n5[/"Score and band"/]` | parallelogram |
| `variables`, `delay`, other native | `n6("Coalesce CRM over enrichment")` | rounded |
| `group` | rectangle + `subgraph` holding its `_nodes` | box-in-box |

Edges come from `childrenUuids`, in order, labelled by what the routing node means:

| Node | Edge labels |
| --- | --- |
| `branch` | `yes` (index 0, condition matched), `no` (index 1) |
| `filter` | `if true` — a false filter ends the run, so there is no second edge |
| `switch` | the `routes[i].name` matching each child index |
| `split` | `A <pct>%` / `B <100-pct>%` |
| `fallbackChildUuid` → a *different* node | a **dashed** `-. on failure .->` edge — the waterfall pattern |
| `fallbackChildUuid` → the node's own next step | a `↷` on the label, not a second arrow: a failure here doesn't stop the run |

Label each node with its `name` when it has one and its action underneath — users
recognise "LinkedIn URL found?", not `branch_3`.

## Rules that make the diagram true

These are the ways a hand-drawn diagram lies. Each was hit against a live
workspace, not imagined:

- **Key nodes by `uuid`, never by `slug`.** Slugs repeat within a single release —
  a shipped waterfall has **six** nodes with slug `variables`, and a play has an
  `agent` node and a `variables` node both called `classify`. A slug-keyed diagram
  silently collapses them into one node and reroutes every edge that touched them.
- **`childrenUuids` order carries meaning.** Index 0 of a `branch` is the matched
  path. Swapping the labels inverts what the workflow appears to do.
- **Draw `fallbackChildUuid` edges.** In waterfall graphs they *are* the mechanism —
  each provider falls through to the next on failure. A diagram without them shows
  a chain of unrelated enrichments.
- **A `null` in `childrenUuids`, or a node unreachable from `start`, is a finding.**
  The script emits both as `%%` comments. Say so out loud rather than drawing a tidy
  graph over a broken one — an orphaned node never runs.
- **`tool` and `agent` nodes carry `toolUuid` / `agentUuid` at the top level** of the
  node (not inside `config`), and no `actionSlug`. Resolve the name with
  `orchestration tool get` / `ai agent get` before showing the diagram, or the box
  reads `tool e487d28e` and tells the user nothing.
- **Mark the paid nodes.** Which action bills is not in the release — check the
  provider playbook (`../../cargo-gtm/provider-playbooks/<slug>.md`) or
  `connection integration list`, then pass those slugs to `--paid`. This is the
  plan gate's "cost shape" made visible; the per-record estimate still goes in the
  text ([`../../cargo-gtm/references/cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md)).

## Worked example

```bash
cargo-ai orchestration release get-draft --workflow-uuid b338e04b-… \
  | node <skill-dir>/scripts/workflow-to-mermaid.ts \
      --title "Classify and score accounts" --paid enrich
```

```mermaid
---
title: Classify and score accounts
---
flowchart TD
    n0(["start"])
    n1{"Missing revenue or headcount?<br/>branch"}
    n2["💳 Fill the gap (0.25 credits)<br/>companyEnrich.enrichByDomain"]
    n3("Coalesce CRM over enrichment<br/>variables")
    n4{{"Apply the taxonomy<br/>agent"}}
    n5("classify<br/>variables")
    n6[/"Score and band (deterministic)<br/>script"/]
    n7(["end"])
    n0 --> n1
    n1 -->|yes| n2
    n1 -->|no| n3
    n2 --> n3
    n3 --> n4
    n4 --> n5
    n5 --> n6
    n6 --> n7
```

Read out loud: enrichment only fires for records missing revenue or headcount (so
the credit line scales with the gap, not the segment), the model classifies, and
the score is deterministic afterwards. That sentence is what the user approves —
the diagram is what makes it checkable.

## If the surface can't render Mermaid

Some terminals and chat surfaces show the fenced block as text. Keep the fence (it
stays copy-pasteable into GitHub or the docs) and add a one-line path summary
beneath it — `start → branch(missing firmographics) → enrich 💳 → merge → agent →
score → end`. Don't replace the diagram with an ASCII drawing; it wastes context
and reads worse than the sentence.
