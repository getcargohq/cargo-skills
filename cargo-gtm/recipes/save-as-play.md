# Recipe — Save an ad-hoc run as a durable play or tool

Convert whatever was just run ad-hoc (a search, an enrichment chain, a signal pull) into a scheduled, always-on workflow in the workspace. This is the step that turns a session's exploration into infrastructure — every saved run compounds instead of evaporating.

## When to offer this (post-run convention)

After **any successful ad-hoc run whose result would be worth having again** — a signal pull, a persona search, a monitoring query — offer once, with the right cadence pre-picked:

> "Want this to run by itself? I can save this exact `<what it did>` as a `<play/tool>` that runs `<cadence>` — new results land without you asking."

Don't offer for one-shot lookups (a single LinkedIn resolution, one email verify) — only for repeatable pulls.

## Pick the shape: tool (cron) vs play (data-driven)

| The ad-hoc run was… | Save as | Trigger |
|---|---|---|
| A search/pull against an external provider (new hires, job postings, funding events) | **Tool** | Cron trigger |
| A per-record chain over records in a model/segment (enrich, verify, score, detect job change) | **Play** | Segment `changeKinds` (+ optional `schedule` for periodic re-evaluation) |

Cadence defaults by signal type:

| Signal | Cadence | Why |
|---|---|---|
| Job offers / hiring intent | Daily (`0 9 * * *`) | Postings are time-sensitive; stale = wasted outreach window |
| New hires / champion moves / job changes | Every 2 weeks (`0 9 1,15 * *`) | Job-change data refreshes slowly; tighter cadence re-bills the same rows |
| Funding events | Weekly (`0 9 * * 1`) | Announcements cluster; a weekly digest is fresh enough to act on |
| Persona search (quickstart-style) | Weekly (`0 9 * * 1`) | New matches accumulate slowly at persona granularity |

## Cost gate — a schedule multiplies spend

A saved play spends credits **every run, forever**. Before deploying, extend the [approval gate](../references/cost-discipline.md): state *per-run cost × cadence = monthly burn* ("~1.1 credits/run, weekly → ~4.4/month") and get an explicit yes on the recurring number, not just the one-off.

## Path A — save as a tool with a cron trigger

```bash
# 1. Create the tool shell
cargo-ai orchestration tool create \
  --name "Weekly RevOps-lead pull" \
  --description "Saved from ad-hoc run: salesNavigator.searchLeads for <persona>, limit 25"
# → Extract tool.uuid and tool.workflowUuid

# 2. Rebuild the ad-hoc run as a node graph: start → the exact action(s) you just
#    ran (same integrationSlug/actionSlug/config, connectorUuid at node top level)
#    → end node exposing the output fields. Validate before deploying:
cargo-ai orchestration node validate --nodes '[...start → action → end...]'
# → { "outcome": "valid" }

# 3. Deploy the graph to the tool's workflow
cargo-ai orchestration draft-release update \
  --workflow-uuid <tool.workflowUuid> \
  --nodes '[...validated nodes...]'
cargo-ai orchestration draft-release deploy \
  --workflow-uuid <tool.workflowUuid> \
  --nodes '[...validated nodes...]' \
  --form-fields 'null' \
  --description "v1 — saved from ad-hoc session run"
# ⚠️ Never pass --version to draft-release deploy (shadowed by the global flag —
#    prints the CLI version and exits WITHOUT deploying). Confirm with:
cargo-ai orchestration release get-deployed --workflow-uuid <tool.workflowUuid>
# → status must be "deployed"

# 4. Attach the cron trigger
cargo-ai orchestration tool update \
  --uuid <tool.uuid> \
  --triggers '[{"name":"Weekly","type":"cron","cron":"0 9 * * 1","data":{}}]'

# 5. Prove it works once, end to end (this run is the pilot for the schedule)
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{}' \
  --wait-until-finished
```

Node-graph syntax: see [`../../cargo-orchestration/references/examples/tools.md`](../../cargo-orchestration/references/examples/tools.md) ("Run with custom nodes") and [`../../cargo-orchestration/references/nodes.md`](../../cargo-orchestration/references/nodes.md). Check `cargo-ai orchestration template list` first — a template tagged your pattern beats authoring from zero.

## Path B — save as a play on a model segment

For chains that should re-run whenever records change (enrich every new company, detect job changes on the customer-contacts segment):

```bash
# 1. Create the play against the model it operates on
cargo-ai orchestration play create \
  --name "Enrich new companies" \
  --model-uuid <model-uuid> \
  --change-kinds created \
  --run-creation-rule once \
  --description "Saved from ad-hoc enrichment chain"
# → Extract play.uuid and play.workflowUuid
# (check `play create --help` for the allowed change-kind values)

# 2–3. Same as Path A: validate the node graph, draft-release update + deploy
#      against <play.workflowUuid>, confirm with release get-deployed.

# 4. Optional: scope + periodic re-evaluation
cargo-ai orchestration play update <play.uuid> \
  --filter '{...same shape as segmentation segment update...}' \
  --limit 500 \
  --schedule '{...cron re-evaluation, for signals that decay...}'

# 5. Pilot the play on a few records before enabling broadly
cargo-ai orchestration batch create \
  --workflow-uuid <play.workflowUuid> \
  --data '{"kind":"recordIds","modelUuid":"<model-uuid>","ids":["<one-record-id>"]}' \
  --wait-until-finished
```

Play mechanics (batch data kinds, `playNotCompatible`, monitoring): [`../../cargo-orchestration/references/examples/plays.md`](../../cargo-orchestration/references/examples/plays.md).

## Managing the workspace as code?

If the workspace is CDK-managed (`cargo-ai cdk` — resources defined in TypeScript and deployed via plan/deploy), don't create the play imperatively: add it as a `definePlay`/`defineTool` in the CDK project instead, so it's versioned with the rest of the infra. An imperatively-created play in a CDK workspace is drift.

## Close the loop

End with the receipt discipline: what was created (name + UUID + trigger), the recurring cost line, and where results will land. Then point at monitoring: `cargo-ai orchestration run list --workflow-uuid <uuid>` or the error-rate queries in [`../../cargo-analytics/SKILL.md`](../../cargo-analytics/SKILL.md).
