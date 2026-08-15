# Diagramming a node graph

A workflow the user can't see is a workflow they can't approve. A node graph is a
directed graph with routing, fallbacks, and paid steps in it — prose flattens all
three. Draw it instead: it costs nothing, and the command renders two formats from
the same graph — ASCII for a terminal, Mermaid for anything that renders Mermaid
(GitHub, the Cargo docs, a published page). See [The ASCII format](#the-ascii-format-cli--1056).

`cargo-ai orchestration node diagram` does it (**CLI ≥ 1.0.54**; `unknown command`
means the pin hasn't moved yet — bump per [`../../cargo/SKILL.md`](../../cargo/SKILL.md)
§ "At session start"). Free, runs nothing, no credits — same family as
`node validate`.

## When to draw one

- **At the plan gate**, before `draft-release deploy` / `cdk deploy` — the diagram
  *is* the "nodes and data flow" half of the plan ([`../../cargo/references/interaction.md`](../../cargo/references/interaction.md) §1).
- **When explaining an existing workflow, tool, or play** — "what does this play
  do?" is one command against its `workflowUuid`.
- **When reporting a trace** — the graph with the failing node marked red, next to
  the error ([`../../cargo-diagnostics/references/run-trace.md`](../../cargo-diagnostics/references/run-trace.md)).

Skip it for a linear graph of three nodes or fewer, or a one-node change — say what
changed in a sentence instead. A diagram of `start → enrich → end` is ceremony.

## Generate it

```bash
# An existing workflow, tool, or play (workflowUuid from `tool list` / `play list`)
# --format ascii when SHOWING it to someone; drop it when pasting into a PR or doc
cargo-ai orchestration node diagram --workflow-uuid <uuid> --format ascii --raw

# The draft you are about to deploy — the plan-gate case
cargo-ai orchestration node diagram --workflow-uuid <uuid> --draft --raw

# A graph you are authoring, before it exists server-side
cargo-ai orchestration node diagram --nodes '[...]' --raw

# The graph a run executed, with the failing node marked
cargo-ai orchestration node diagram --run-uuid <uuid> --highlight <node-slug> --raw
```

Pass exactly one source: `--nodes` (or `-` to read stdin), `--file <path>`,
`--workflow-uuid` (deployed, `--draft` for the draft), `--release-uuid`, or
`--run-uuid`.

| Flag | Effect |
| --- | --- |
| `--format ascii\|mermaid` | `ascii` to show it in a terminal, `mermaid` to paste it somewhere that renders it (default). CLI ≥ 1.0.56. |
| `--title <text>` | Title rendered above the diagram. |
| `--direction TD\|LR` | Mermaid flow direction (default `TD`; `LR` reads better for long linear graphs). Ignored by `--format ascii`. |
| `--paid <slugs>` | Comma-separated node slugs/uuids that bill credits — marked 💳. |
| `--highlight <slugs>` | Comma-separated slugs/uuids to mark — red in Mermaid, `◀━` in ASCII. The failing node in a trace. |
| `--raw` | Print the diagram itself instead of JSON: plain text for `ascii`, a fenced block for `mermaid`. |

Without `--raw` it returns `{"diagram": "...", "format": "ascii"|"mermaid", "warnings": [...]}`
like every other command. **Read the `warnings`** — they carry the structural
problems a tidy drawing would otherwise hide (nodes unreachable from `start`,
dangling `childrenUuids`) and belong in what you tell the user.

`--run-uuid` handles both run shapes: a run from `action execute` carries its own
`nodes`, a run of a deployed tool or play carries only a `releaseUuid`, and the
command follows whichever it has.

## What maps to what

You rarely need this table — the command emits it — but it is what to check when
reading a diagram someone else produced, or hand-writing one for a graph that
isn't in Cargo yet.

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

## Rules that make the diagram true

Why to run the command rather than transcribe a graph by hand. Each of these was
hit against a live workspace, not imagined:

- **Nodes are keyed by `uuid`, never by `slug`.** Slugs repeat within a single
  release — a shipped waterfall has **six** nodes slugged `variables`, and a play
  has an `agent` node and a `variables` node both slugged `classify`. A slug-keyed
  diagram silently collapses them into one node and reroutes every edge that
  touched them. (Same trap downstream: `{{nodes.<slug>...}}` and
  `runContext.<slug>` are ambiguous for a repeated slug, so give any node you
  reference later a distinct slug.)
- **`childrenUuids` order carries meaning.** Index 0 of a `branch` is the matched
  path. Swapping the labels inverts what the workflow appears to do.
- **Fallback edges are the mechanism, not decoration.** In waterfall graphs each
  provider falls through to the next on failure; a diagram without those edges
  shows a chain of unrelated enrichments.
- **A `null` in `childrenUuids`, or a node unreachable from `start`, is a finding.**
  It arrives in `warnings`. Say it out loud rather than drawing a tidy graph over a
  broken one — an orphaned node never runs.
- **`tool` and `agent` nodes are drawn from `toolUuid` / `agentUuid`** (top-level
  node fields; these nodes have no `actionSlug`), so the box reads `tool e487d28e`.
  Resolve the real name with `orchestration tool get` / `ai agent get` when it
  matters to the reader.
- **Mark the paid nodes.** Which action bills is not in the release — check the
  provider playbook (`../../cargo-gtm/provider-playbooks/<slug>.md`) or
  `connection integration list`, then pass those slugs to `--paid`. This is the
  plan gate's "cost shape" made visible; the per-record estimate still goes in the
  text ([`../../cargo-gtm/references/cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md)).

## Worked example

```bash
cargo-ai orchestration node diagram --workflow-uuid b338e04b-… --draft \
  --title "Classify and score accounts" --paid enrich --raw
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

## The ASCII format (CLI ≥ 1.0.56)

`--format ascii` renders the same graph as a drawing that needs no Mermaid
renderer. **Pick the format by where the output goes**, not by preference:

| | `--format ascii` | `--format mermaid` (default) |
| --- | --- | --- |
| Showing it in a terminal or a chat reply | **yes** | no — the reader sees `n4{"branch"}` |
| Pasting into a PR body, a doc, a rendered page | no | **yes** |
| Node shapes, `classDef` colouring, group subgraphs | no | yes |
| Branch labels, fallback edges, `💳`, warnings | yes | yes |

Mermaid stays the default for compatibility. That default is wrong for most agent
replies, because most agent output is read in a terminal. On an older CLI that
rejects `--format`, fall back to the fenced Mermaid block plus a one-line path
summary — `start → branch(missing firmographics) → enrich 💳 → merge → agent →
score → end`.

```
                  start
                    │
                Aviato 💳
           Lookup LinkedIn URL
                    │
              LinkedIn URL?
                    │
                    ├──────────────┐
                   yes             no
                    │              │
                    │            Agent
                    │      Find LinkedIn URL
                    │              │
                    ├──────────────┘
                    │
              Lead Magic 💳
         Enrich LinkedIn profile
                    │
               Apollo.io 💳
          Find company headcount
                    │
                JavaScript
            ICP fit assessment
                    │
                 Tier 1?
                    │
         ┌──────────┴─────────┐
        yes                   no
         │                    │
       Slack             Salesforce
Send to #best-leads     Update record
```

| Mark | Meaning |
| --- | --- |
| centred `│` spine | the main line of the flow |
| `├───┐` … `├───┘` | a **detour**: a branch whose paths reconverge. The spine continues; the rail leaves and rejoins |
| `┌───┴───┐` | a **fork**: a branch whose paths never reconverge. Nothing continues past it |
| `┆` with `on failure` | a `fallbackChildUuid` edge: where the run goes if that step *errors*, as distinct from returning nothing |
| `💳` | the step bills credits (`--paid`) |
| `◀━` | the step was named in `--highlight` |
| `↑ <name>` | a step already drawn above, not repeated |

Each step is two lines: the system it runs on over what it does, both resolved
from the platform's catalogs, so a step reads `Apollo.io` / `Enrich person`
rather than `apolloio` / `enrichPerson`. A step keeps its own name where the
author set one. Branch steps get one line, because the labelled rails leaving them
already say that they route.

A `group` step draws its own graph in a captioned box, one level down, with
`--paid` / `--highlight` carried inside; a broken graph in a loop body is
reported against the loop.

**Width.** Rails stack rightward and each must clear the one below it, so a graph
branching at nearly every step of a long chain gets wide. A 29-node provider
waterfall draws at 57 columns; past 120 the command adds a warning pointing at
`--format mermaid`. It never truncates — a diagram that silently dropped an edge
would be worse than a wide one. Report that warning rather than pasting a drawing
that will wrap in the user's terminal.
