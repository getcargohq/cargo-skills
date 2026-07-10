# Interaction conventions — plan gates, choices, and presenting

How an agent working with Cargo communicates: when to stop and ask, how to offer choices, and how to present what happened. These defaults apply across every skill in this pack; recipes and runbooks link here instead of restating them.

They exist because Cargo work is collaborative and (often) paid: building a play, wiring a node graph, or fanning out a batch is a back-and-forth with the user, not a fire-and-forget task.

## 1. The plan gate — design approval before building

Before creating or editing a node graph, deploying a release, or launching anything beyond a trivial single-node change, present the plan and **wait for approval**:

- **Trigger** — how the play/workflow is launched (manual/CLI run, batch over a segment, schedule, segment change). Ask if it isn't stated; it shapes the whole graph (input shape, volume, where outputs land).
- **Nodes and data flow** — what each node does and what feeds it, in human-readable names.
- **Cost shape** — which nodes are paid, rough per-record estimate.

Treat this as a hard gate: don't start building from an unconfirmed plan. It complements the **cost gate** in [`../../cargo-gtm/references/cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md), which stays authoritative for spend (pilot → approval → full run): the plan gate approves the *design*, the pilot gate approves the *spend*. A trivial change (fix one expression, rename a node) doesn't need the ceremony — say what you changed and why.

## 2. Real choices: ask, with a recommended default

Many Cargo stages can be built more than one way — several providers cover the same enrichment, several actions do nearly the same thing, a step can be an agent node or a deterministic one. When alternatives genuinely differ:

- **Never pick silently.** List the options by human-readable name (never raw `actionSlug`s or UUIDs), with cost and what each is best at.
- **Mark a recommended default** and say why — the simplest option that fits the use case. The user should be able to accept in one word.
- **Batch related questions** into one round (trigger + provider + output destination), not a drip of one-offs.
- Don't ask when there's nothing to decide: one obvious option, or a pure read. Asking permission to look something up is friction, not collaboration.

```
How should this play be triggered?
1. Manual / CLI runs (recommended) — start with one-off test runs; attach a
   schedule or segment trigger later.
2. Segment change — every record entering the segment becomes a run.
3. Schedule — recurring batch over the segment.

And for email lookup: waterfall verify-first (~0.4 cr/row, recommended) or
FullEnrich premium (~1 cr/row, better coverage on small companies)?
```

## 3. Presenting defaults

- **Narrate meaningful steps.** One or two sentences before a change (what and why) and after it (what happened). Refer to nodes, actions, and plays by name.
- **Summarize, don't dump.** Raw JSON, full SQL results, or CSV contents are never the primary answer — turn them into a short table, a count, or a one-line takeaway, and keep large exports out of the conversation entirely (context discipline: [`../../cargo-gtm/references/cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md) §6). Show raw output only when the user asks.
- **Lead with the conclusion.** State what happened or what you found first; evidence after.
- **Show the structure at checkpoints.** After building or editing a graph, after a pilot, and when reporting a run: a compact node-flow sketch or table beats prose.
- **Always surface the URL.** Every created or touched resource gets its `app.getcargo.io` link (URL patterns: [`uuid-flow.md`](uuid-flow.md)) so the user can open it in the Cargo app.
- **Receipts after paid actions** are their own convention — format in [`cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md) §2.

## Where these apply most

- Building or editing plays/workflows (`cargo-orchestration`, and node-graph steps in `cargo-gtm` recipes).
- Activating GTM recipes end-to-end (`cargo-gtm` — the pilot gate already encodes §1's spirit for spend).
- Reporting diagnostics (`cargo-diagnostics` — conclusion-first tables).
- CDK plans (`cargo-cdk` — `cdk plan` output is the plan-gate artifact; present the diff, not the raw state).
