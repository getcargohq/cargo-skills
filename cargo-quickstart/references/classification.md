# Goal classification

How to map a natural-language goal to one of the five execution paths in `SKILL.md`.

## Quick reference

| Phrase shape in the user's request                           | Path                          |
| ------------------------------------------------------------ | ----------------------------- |
| "enrich X", "score X", "verify X" — single record            | `action execute`              |
| "enrich these N", "for each of these records"                | `action execute-batch` with `--records` |
| "all X that Y", "everyone in segment Z"                      | `segmentation segment fetch`, then `action execute-batch` |
| "trigger / run / kick off the saved tool X"                  | defer to `cargo-orchestration` |
| "research X with the agent", "ask the agent about Y"         | `ai message create`           |
| "how many / which / what's the average / list me all"        | `system-of-record query`      |
| "export …", "download all …"                                 | `segmentation segment download` |

## Disambiguation prompts

Ask the user **one** clarifying question when:

- The goal could equally be a one-shot research call or a saved workflow run, and **both exist** in the workspace.
  → "Want to use the saved `<tool-name>` we already have, or run a fresh one-off?"
- The goal mentions a list but no source ("score the leads we have").
  → "Which segment / model should I pull from?"
- The goal implies write-back but the destination is ambiguous ("update the CRM").
  → "Push to HubSpot, Salesforce, or both?"

Do **not** ask for clarification when:

- The user is exploratory ("show me…", "how many…") — just run the SQL.
- The user has already been specific enough that one default path dominates (e.g. names a domain → single action).
- A discovery call (`tool list`, `connector list`) would answer the question faster than a chat round-trip — run it.

## Ambiguous cases worth memorizing

### "Find people who match X"

This is *almost always* `action execute` against a `find_people`-shaped native or connector action — not a saved workflow, not a batch. Find-people actions accept a search-spec as `--data` and return records inline. Only escalate to a saved workflow when the user explicitly says "set this up to run repeatedly" or "every time a new company gets added".

### "Sync to CRM" / "push to HubSpot"

If the user says "push *this list*" → `action execute-batch` with `--records`. If they say "set up a sync" → defer to `cargo-orchestration`. The quickstart is for one-shots, not for designing recurring automations.

### "Score the leads"

Use the AI agent path: `ai agent list` to find a scoring agent (usually named "Lead Scorer" or similar), then either `action execute --kind agent` per record, or fan-out across `--records` with `action execute-batch`. If the user references a saved scoring workflow, defer to `cargo-orchestration`.

### "How many X"

Always SQL via system-of-record. Get DDL first (`storage model get-ddl`) — never guess table names. The DDL output contains the qualified name like `datasets_default.models_companies`.

### "Enrich the new companies"

Resolve "new" to a segment if one exists ("New Companies", "Last 7 days"), otherwise to a recordIds batch. If neither maps cleanly, ask: "Which segment counts as 'new'?"

## Not a quickstart task

Push these back to the dedicated skill rather than trying to handle them in the dispatcher:

- "Create a Companies model with these columns" → `cargo-storage`
- "Connect our Clearbit account" → `cargo-connection`
- "Configure a new agent for outbound research" → `cargo-ai`
- "Invite alice@… as an admin" → `cargo-workspace-management`
- "Build a workflow that does A → B → C" → `cargo-orchestration` (custom node graph)

The quickstart's job is **execution**, not **construction**.
