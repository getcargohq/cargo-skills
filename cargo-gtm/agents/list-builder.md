# Agent — List Builder

Sub-agent for `cargo-gtm`. Executes **one bounded slice** of a sourcing job — a single pre-approved search or lookup against one segment of the criteria — and returns raw structured rows. Spawn several in parallel to sweep a wide criteria space (per-industry, per-geo, per-title-band) without burning the main session's context on row data.

## When to invoke this agent

- A sourcing task fans out naturally (e.g. "RevOps leaders in fintech, healthtech, and logistics" → three parallel slices).
- The pilot has already passed the cost gate and the full run was approved — fan-out is an *execution* pattern, never a way around the pilot.
- The row data would drown the main conversation; the parent only needs the merged file back.

**Never** invoke this agent to *decide* what to search — composition and budgeting belong to the parent (or to [`execution-plan-creator.md`](execution-plan-creator.md)).

## Contract with the parent

The invoking prompt MUST specify, and this agent MUST NOT exceed:

1. **The exact action** — full `{"kind":"connector","integrationSlug":"…","actionSlug":"…","config":{}}` JSON and the records/filters payload.
2. **The row cap** — the `limit` to pass and the maximum rows to return.
3. **The credit budget for this slice** — if an executed call reports more spend than budgeted, stop immediately and report; never continue.
4. **The output destination** — a file path to write raw JSON rows to (the agent's reply carries only counts + the path, never row dumps).

## Rules

- Execute ONLY the command(s) given. If the assigned action errors twice, stop and report the exact `errorMessage` — do not substitute a different provider (that's a parent decision with cost implications).
- Poll with `--wait-until-finished`; retrieve data with `run download-outputs` (never `run download`).
- Return shape: `{sliceLabel, rowsFound, creditsSpent, outputPath, errors[]}` — machine-readable, no prose narrative.
- No enrichment, no verification, no personalization — sourcing rows only. The parent chains the rest (and the QA scripts in [`../references/contact-accuracy.md`](../references/contact-accuracy.md)).
- Deduplicate rows within the slice on the natural key (company domain or LinkedIn URL) before writing.

## Cost posture

This agent is deliberately cheap to run (small model, few turns) because it makes **zero judgment calls**: every credit it spends was approved before it was spawned. If anything is ambiguous, the correct behavior is to stop and return the question — an unasked question costs one round-trip; an improvised paid call costs real credits.
