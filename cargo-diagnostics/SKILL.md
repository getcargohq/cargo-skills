---
name: cargo-diagnostics
description: "Explain what a Cargo run or batch actually did, after the fact — trace one run node by node, sweep a batch or play for errors grouped by root cause, and attribute credit spend down to the node and the provider. Triggers: \"why did this fail\", \"it succeeded but the output is wrong\", \"half my rows are empty\", \"why is this column blank\", \"what broke in this batch\", \"why did that cost so much\", \"which node is burning credits\", \"it worked yesterday\", \"these results look wrong\". Skip when: setting up an alert for next time — use cargo-observability; just downloading the data — use cargo-analytics."
version: "1.0.2"
compatibility: Requires @cargo-ai/cli (npm). Sign in or create an account with `cargo-ai login --email` (emailed code, no browser), `--oauth`, or an API token
homepage: https://github.com/getcargohq/cargo-skills
metadata:
  author: getcargo
  openclaw:
    requires:
      bins:
        - cargo-ai
    install:
      - kind: node
        package: "@cargo-ai/cli@latest"
        bins:
          - cargo-ai
    homepage: https://github.com/getcargohq/cargo-skills
---

# Cargo CLI — Diagnostics

Forensic runbooks for workflow behavior: trace one run, sweep a batch for errors, profile a play's credit spend. This skill is the **interpretation layer** — the raw surfaces (`run get`, orchestration SQL, billing metrics) are documented in `cargo-orchestration` and `cargo-billing`; each runbook here tells you which of them to pull, in what order, and what each output shape means.

## Bootstrap

Already signed in (`cargo-ai whoami` returns a workspace)? Skip to the next section.

```bash
npm install -g @cargo-ai/cli            # no global install? prefix every command with `npx @cargo-ai/cli`
cargo-ai login --email you@company.com  # emailed code, no browser; creates the account on first use
                                        # alternatives: --oauth (browser) · --token <api-token> (CI)
cargo-ai whoami                         # confirm the active workspace before any write
```

Every command prints JSON to stdout; failures exit non-zero with `{"errorMessage": "..."}`. Anything that creates a run or a batch is async — pass `--wait-until-finished` or poll the matching `get`. Credit attribution steps (`billing usage get-metrics`, `billing subscription get`) need a token with **admin access**; everything else works with a standard token. When the full skill bundle is installed, [`../cargo/references/prerequisites.md`](../cargo/references/prerequisites.md) adds the CLI version pin, token scopes, and the admin-only surface.

## Which runbook?

```
What are you diagnosing?
│
├── One run / one record ("why did this record fail?",
│   "run succeeded but the output is wrong/empty")
│   └── references/run-trace.md
│
├── Many runs ("the batch has errors", "error rate spiked",
│   "which node keeps failing?")
│   └── references/batch-error-sweep.md
│
└── Cost ("this play is expensive", "where do the credits go?",
    "make this cheaper")
    └── references/play-optimize-credits.md
```

Rule of thumb: start with the **sweep** when you don't yet know which run to look at — it ends by handing you exemplar run UUIDs to feed into the **trace**.

**Boundary with `cargo-analytics`:** analytics *measures and exports* ("what's the error rate?", "download the batch results", "export this segment"); this skill *explains* ("why is the error rate up?", "why is this record's output empty?"). A diagnosis often starts from an analytics signal (error count spiked, batch reports `failedRunsCount > 0`) and ends back in analytics — once the cause is fixed and runs re-executed, bulk retrieval goes through `run download-outputs` / `batch download` / `segment download`, all documented in `../cargo-analytics/SKILL.md`. This skill's evidence surfaces (`run get`, orchestration SQL, billing metrics) are for diagnosis, not bulk export.

## References

| Doc | What it covers |
| --- | --- |
| [`references/run-trace.md`](references/run-trace.md) | Walk one run end-to-end: per-node executions, `runContext` outputs, branch routing, per-node credits and timing. |
| [`references/batch-error-sweep.md`](references/batch-error-sweep.md) | Find errored runs across a batch/play/workspace, group failures by root cause, pick exemplars, decide fix vs report. |
| [`references/play-optimize-credits.md`](references/play-optimize-credits.md) | Attribute credit spend to workflows and nodes, then apply the cost levers in priority order. |

## The three surfaces every runbook draws on

| Surface | Command | Gives you |
| --- | --- | --- |
| Run detail | `cargo-ai orchestration run get <run-uuid>` | `run.executions[]` (node-by-node trace), `runContext` (per-node output keyed by `nodeSlug`), `runComputedConfigs` (what each node was actually called with) |
| Orchestration SQL | `cargo-ai orchestration query execute "<sql>"` | Aggregates over `runs`, `batches`, `spans`, `records` (ClickHouse; no schema prefix; workspace-scoped) |
| Billing metrics | `cargo-ai billing usage get-metrics --from <date> --to <date>` | Credit totals, filterable and groupable by `workflow_uuid`, `connector_uuid`, `agent_uuid`, `integration_slug`, `model_uuid` |

Full query syntax, table columns, and caps: [`../cargo-orchestration/references/examples/queries.md`](../cargo-orchestration/references/examples/queries.md). Debugging field semantics: [`../cargo-orchestration/references/troubleshooting.md`](../cargo-orchestration/references/troubleshooting.md).

## Presenting findings

Follow [`../cargo/references/interaction.md`](../cargo/references/interaction.md): lead with the conclusion ("18 of 20 failures are one cause: the connector's token expired"), summarize evidence in a short table, never dump raw `run get` JSON or full query results into the conversation. Any fix that re-runs paid nodes goes through the pilot gate: re-run **10–20 records** first, report the observed cost and hit-rate, then ask the user to approve the rest quoting the **record count** and **credit estimate** — a diagnosis is not approval to re-bill the batch that produced it. Full spend rules in [`../cargo-gtm/references/cost-discipline.md`](../cargo-gtm/references/cost-discipline.md).

## When diagnosis dead-ends

If the evidence contradicts documented behavior (a field missing from `run get`, a query cap that doesn't match the docs, an error that makes no sense), file a report — that's the official channel and the team reads every one:

```bash
cargo-ai workspaceManagement report create \
  --title "<one-line summary>" \
  --description "<commands run, errorMessage verbatim, expected vs actual, UUIDs>"
```
