# Report examples

`cargo-ai workspaceManagement report create` submits a report to **workspace management** — the Cargo team's official feedback channel for the CLI and its skills.

**Always send a report when:**

- A CLI command fails and the cause is not obvious from `--help`, `references/response-shapes.md`, or `references/troubleshooting.md`.
- The user or the AI agent is struggling to use the CLI: repeated failed attempts (≥ 2) on the same task, ambiguous flags, unclear JSON schemas, or commands that don't behave as documented.
- A capability seems to be missing entirely (no command exists for the operation needed).
- A response shape, error message, or async behavior contradicts what the skills describe.
- The CLI is being used incorrectly and the correct usage is not discoverable from the existing documentation.

Reports are how these skills and the CLI improve. **Do not give up silently — file a report.**

## Submit a report

```bash
cargo-ai workspaceManagement report create \
  --title "<one-line summary of the problem>" \
  --description "<exact command, error, expected vs actual, relevant UUIDs>"
```

Both `--title` and `--description` are required. The command returns the created report as JSON.

## What to include in the description

Always include, when relevant:

- The exact command(s) you ran, with secrets/tokens redacted.
- The full `errorMessage` from the JSON output.
- What you expected to happen and what actually happened.
- Any UUIDs referenced (run, batch, workflow, model, segment, agent, connector, …).
- How many times the failure was reproduced and any variations tried.
- The skill / reference page consulted before reporting (so the team knows what was already tried).

## Examples

### CLI command fails with an unhelpful error

```bash
cargo-ai workspaceManagement report create \
  --title "orchestration run create returns 'playNotCompatible' on a tool workflow" \
  --description "Ran: cargo-ai orchestration run create --workflow-uuid abc-123 --data '{\"domain\":\"acme.com\"}'. Got: {\"errorMessage\":\"playNotCompatible\"}. The workflow UUID was returned by 'orchestration tool list', so it should be a tool workflow. Skill consulted: cargo-orchestration/SKILL.md decision flowchart."
```

### Filter syntax is unclear / silently returns empty

```bash
cargo-ai workspaceManagement report create \
  --title "segment fetch returns 0 records despite UI showing matches" \
  --description "Ran: cargo-ai segmentation segment fetch --model-uuid <uuid> --filter '{\"conjonction\":\"and\",\"groups\":[{\"conjonction\":\"and\",\"conditions\":[{\"kind\":\"string\",\"columnSlug\":\"country\",\"operator\":\"is\",\"values\":[\"US\"]}]}]}'. Got 0 records. The same filter in the app UI shows 1,200 matches. Tried 'conjunction' and 'conjonction' spellings — both return 0."
```

### Agent is struggling with the CLI after multiple retries

```bash
cargo-ai workspaceManagement report create \
  --title "Agent unable to determine correct --action JSON for HubSpot company_create" \
  --description "Tried 4 variants of cargo-ai orchestration action execute --action '{\"kind\":\"connector\",\"integrationSlug\":\"hubspot\",\"actionSlug\":\"company_create\",\"config\":{}}' --data '{...}'. Each fails with a different validation error ('config.portalId required', then 'data.properties required', etc.). The required shape is not documented in cargo-connection or cargo-orchestration. Need a worked example or a schema reference."
```

### Missing capability

```bash
cargo-ai workspaceManagement report create \
  --title "No CLI command to bulk re-run failed records from a previous batch" \
  --description "Trying to re-run only the failed records from batch <uuid>. 'analytics run download --statuses error' produces a CSV but there is no documented way to feed that CSV back into 'orchestration batch create' as the input set without manual transformation. A '--from-failed-batch <uuid>' option (or equivalent) appears to be missing."
```

### Documentation contradicts observed behavior

```bash
cargo-ai workspaceManagement report create \
  --title "billing usage get-metrics --group-by workflow_uuid returns connector_uuid groupings" \
  --description "Ran: cargo-ai billing usage get-metrics --from 2025-01-01 --to 2025-01-31 --group-by workflow_uuid. Response groups results by connector_uuid instead of workflow_uuid. cargo-billing/SKILL.md says workflow_uuid is a valid --group-by value."
```

## After sending a report

The CLI prints the created report as JSON. Note the returned `uuid` so it can be referenced in any follow-up communication with the Cargo team. After reporting, fall back to the closest documented workaround (e.g. the Cargo app UI) so the user is unblocked.
