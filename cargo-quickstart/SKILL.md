---
name: cargo-quickstart
description: Goal-oriented dispatcher for Cargo. Use this when the user states a real-world outcome (e.g. "find 5 CTOs in NYC and get their emails", "score these new leads", "enrich acme.com with Clearbit") rather than a CLI command. This skill picks the right execution path across orchestration / connection / ai / storage and runs it end-to-end.
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo API token
metadata:
  author: getcargo
  version: "1.0"
---

# Cargo Quickstart — Goal → Result

This skill turns a natural-language goal into a single executed Cargo action. Use it as the **first** skill when the user says something like:

- "Find 5 CTOs in NYC and get their verified work emails."
- "Enrich acme.com with Clearbit."
- "Score the leads added this week."
- "Push our new MQLs to HubSpot."
- "How many companies in our model are headquartered in the US?"

If the user instead wants to *build infrastructure* (create a model, set up a connector, design a node graph), defer to the relevant skill (`cargo-storage`, `cargo-connection`, `cargo-orchestration`).

## The dispatch flow

```
User states a goal
       │
       ▼
┌─────────────────────────────────────────────┐
│ 1. AUTH CHECK                               │
│    cargo-ai whoami                          │
│    └─ if it fails → see "Bootstrap" below   │
└─────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│ 2. CLASSIFY THE GOAL                        │
│                                             │
│ Goal mentions…       → Run…                 │
│ ───────────────────────────────────────     │
│ a single record /    → action execute       │
│   one domain                                │
│ a list of records /  → action execute-batch │
│   "for each of these"  (with --records)     │
│ a segment, "all X    → segment fetch first, │
│   that Y"              then action          │
│                        execute-batch        │
│ "score / research /  → ai message create    │
│   ask the agent"       (chat-uuid)          │
│ "how many / which /  → system-of-record     │
│   what's the avg"      query (after DDL)    │
│                                             │
│ Anything that needs a saved workflow        │
│   → defer to cargo-orchestration            │
└─────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│ 3. DISCOVER THE UUIDS YOU NEED              │
│    (only fetch what the chosen path needs)  │
│                                             │
│ Need a connector action  → connection       │
│   (Clearbit, HubSpot…)     integration get  │
│ Need a built-in action   → connection       │
│   (find_people, …)         native-          │
│                            integration get  │
│ Need a saved tool        → orchestration    │
│                            tool list        │
│ Need a model + DDL       → storage model    │
│   (for SQL or segments)    list / get-ddl   │
│ Need an AI agent         → ai agent list    │
└─────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│ 4. EXECUTE                                  │
│    Pass --wait-until-finished when sane     │
│    (single record, small batch). Otherwise  │
│    poll per cargo-orchestration/polling.md  │
└─────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│ 5. SUMMARIZE                                │
│    Report: what ran, how many records,      │
│    success/error counts, where to find      │
│    full results in the UI                   │
└─────────────────────────────────────────────┘
```

If any step fails twice in a row and the cause is not obvious, **submit a workspace report** before trying a third time — see `cargo-workspace-management/SKILL.md` (Reports) and the top-level `SKILL.md`.

## Canonical recipes

Each recipe is a worked example for one of the dispatch branches above. Pick the closest match, then swap variables.

### R1 — Find people matching a description (research goal)

User: *"Find 5 CTOs in NYC and get their verified work emails."*

```bash
# 1. Discover the people-finder action (typically a native action or a tool)
cargo-ai connection native-integration get | jq '.actions[] | select(.slug | test("people|prospect|search"))'

# 2. Execute as a one-shot action
cargo-ai orchestration action execute \
  --action '{
    "kind": "native",
    "actionSlug": "find_people",
    "config": {}
  }' \
  --data '{
    "title": "CTO",
    "location": "New York, NY, US",
    "limit": 5
  }' \
  --wait-until-finished

# 3. (optional) Enrich each result with email-verification
cargo-ai orchestration action execute-batch \
  --action '{
    "kind": "connector",
    "integrationSlug": "<email-provider>",
    "actionSlug": "verify_email",
    "config": {"connectorUuid": "<uuid>"}
  }' \
  --records '[ ...output of step 2... ]' \
  --wait-until-finished
```

> If the workspace already has a saved tool that does this end-to-end, prefer `orchestration tool list` and `run create --workflow-uuid`. Always check for existing tools before composing from scratch.

### R2 — Enrich one record

User: *"Enrich acme.com with Clearbit."*

```bash
cargo-ai connection connector list | jq '.connectors[] | select(.integrationSlug=="clearbit")'
cargo-ai connection integration get clearbit  # confirm actionSlug

cargo-ai orchestration action execute \
  --action '{
    "kind": "connector",
    "integrationSlug": "clearbit",
    "actionSlug": "company_enrich",
    "config": {"connectorUuid": "<uuid>"}
  }' \
  --data '{"domain":"acme.com"}' \
  --wait-until-finished
```

### R3 — Run an action across every record in a segment

User: *"Enrich every company in our 'New Inbound' segment with Clearbit."*

```bash
MODEL_UUID=$(cargo-ai storage model list | jq -r '.models[] | select(.slug=="companies") | .uuid')

# Pull the segment's records
cargo-ai segmentation segment fetch \
  --model-uuid "$MODEL_UUID" \
  --filter '{"conjonction":"and","groups":[{"conjonction":"and","conditions":[
    {"kind":"string","columnSlug":"lifecycle_stage","operator":"is","values":["new_inbound"]}
  ]}]}' > /tmp/records.json

# Run the action across them
cargo-ai orchestration action execute-batch \
  --action '{
    "kind":"connector",
    "integrationSlug":"clearbit",
    "actionSlug":"company_enrich",
    "config":{"connectorUuid":"<uuid>"}
  }' \
  --records "$(jq -c '.records' /tmp/records.json)" \
  --wait-until-finished
```

### R4 — Ask an AI agent

User: *"Use the lead researcher to find each contact's LinkedIn."*

```bash
cargo-ai ai agent list                                  # find agentUuid
cargo-ai ai chat create --agent-uuid <agentUuid>        # → chatUuid
cargo-ai ai message create \
  --chat-uuid <chatUuid> \
  --parts '[{"type":"text","text":"Find the LinkedIn for ..."}]' \
  --wait-until-finished
```

### R5 — Answer a question from the warehouse

User: *"How many companies have employee_count > 500 and country = US?"*

```bash
cargo-ai storage model list                             # find Companies modelUuid
cargo-ai storage model get-ddl <modelUuid>              # exact table name
cargo-ai system-of-record client query \
  "SELECT count(*) FROM datasets_default.models_companies
   WHERE employee_count > 500 AND country = 'US'"
```

## Bootstrap (when `whoami` fails)

If `cargo-ai whoami` errors out, the user has not authenticated. Tell them — do not attempt to proceed.

```bash
# Install the CLI if missing
npm install -g @cargo-ai/cli

# Authenticate
cargo-ai login --token <api-token-from-Settings-API>

# Verify
cargo-ai whoami
```

After auth, re-run the goal.

## What this skill is NOT

- **Not a substitute** for `cargo-orchestration` when designing a new node graph from scratch — load that skill once you know you need custom nodes.
- **Not a substitute** for `cargo-storage` when the user wants to *create* models / columns / relationships.
- **Not a substitute** for `cargo-workspace-management` when the user wants to invite users, create tokens, or organize folders.

This skill is the **front door**: classify, dispatch, execute, summarize.

## References

- `references/classification.md` — extended phrase-to-path matching, ambiguous cases, when to ask the user a clarifying question vs. proceed.
- `references/recipes.md` — additional worked recipes beyond R1–R5 (CRM push-back, monitoring, exports, multi-step research).
- Top-level `SKILL.md` — the master index, UUID-flow table, async polling table.
- `cargo-orchestration/SKILL.md` — for any execution detail beyond the dispatcher.
