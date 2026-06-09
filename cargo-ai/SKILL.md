---
name: cargo-ai
description: Create and configure AI agents, attach knowledge for RAG, manage MCP servers, and handle agent memories using the Cargo CLI. Use when the user wants to create or update agents, configure agent releases, connect MCP tool servers, or manage agent memories. To upload knowledge files or build knowledge libraries, use the cargo-content skill. For sending messages to agents, use the cargo-orchestration skill instead.
version: "2.2.0"
compatibility: Requires @cargo-ai/cli (npm) and a Cargo account (browser sign-in via --oauth, or an API token)
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

# Cargo CLI — AI

Agent resource management: creating and configuring agents, attaching knowledge for retrieval-augmented generation (RAG), connecting MCP servers, and managing agent memories.

> For *using* agents (sending messages, multi-turn chat, polling), use `cargo-orchestration`.
> For uploading knowledge **files** and building knowledge **libraries** (the `content` domain), use [`cargo-content`](../cargo-content/SKILL.md). This skill covers how that knowledge attaches to an agent.
> For workspace administration — folders (used to organize agents and files), users, API tokens, roles, and submitting reports when the CLI fails — use [`cargo-workspace-management`](../cargo-workspace-management/SKILL.md).

> See `references/response-shapes.md` for full JSON response structures.
> See `references/troubleshooting.md` for common errors and how to fix them.
> See `references/examples/agents.md` for agent CRUD and configuration examples.
> See `references/examples/mcp-servers.md` for MCP server creation and management examples.

## Prerequisites

See [`../cargo/references/prerequisites.md`](../cargo/references/prerequisites.md) for install, login (`--oauth` / `--token`), JSON output conventions, and error shapes. Verify the session with `cargo-ai whoami` before running any of the commands below.

## Discover resources first

```bash
cargo-ai ai agent list                     # all agents (uuid, name, description)
cargo-ai ai template list                  # all AI agent templates (slug, name)
cargo-ai ai mcp-server list                # all MCP servers (uuid, name)
cargo-ai ai memory list --scope agent --agent-uuid <uuid>  # agent memories
# Knowledge files & libraries live in the content domain — see cargo-content:
#   cargo-ai content file list   /   cargo-ai content library list
```

**Retrieve in the UI:** agents live at `app.getcargo.io/workspaces/<WORKSPACE_UUID>/agents/<AGENT_UUID>`. Get `<WORKSPACE_UUID>` from `cargo-ai whoami` under `workspace.uuid`.

## Quick reference

```bash
cargo-ai ai agent list
cargo-ai ai agent get <agent-uuid>
cargo-ai ai agent create --name <name> --icon-color blue --icon-face 🤖
cargo-ai ai agent update --uuid <agent-uuid> --name <name>
cargo-ai ai agent remove <agent-uuid>
cargo-ai ai release list --agent-uuid <uuid>
cargo-ai ai release get <release-uuid>
cargo-ai ai release get-draft --agent-uuid <uuid>
cargo-ai ai release update-draft --agent-uuid <uuid> --language-model-slug gpt-4o
cargo-ai ai release deploy-draft --agent-uuid <uuid>
cargo-ai ai template list
cargo-ai ai template get <slug>
cargo-ai ai mcp-server list
cargo-ai ai mcp-server create --name "Internal Tools"
cargo-ai ai mcp-server update --uuid <mcp-server-uuid> --name "Updated Name"
cargo-ai ai mcp-server remove <mcp-server-uuid>
cargo-ai ai memory list --scope agent --agent-uuid <uuid>
cargo-ai ai memory update --mem0-id <id> --scope agent --agent-uuid <uuid> --content "Updated memory"
cargo-ai ai memory remove --mem0-id <id> --scope agent --agent-uuid <uuid>
```

## Agents

Agents are AI resources with configured instructions, a language model, actions, and optional resources.

**Before creating an agent from scratch, check existing templates — they capture proven patterns for common use cases (lead research, classification, email drafting) and give you a ready-made system prompt, model, and temperature to start from:**

```bash
cargo-ai ai template list          # browse available patterns
cargo-ai ai template get <slug>    # inspect system prompt, model, and actions
```

```bash
# List all agents
cargo-ai ai agent list

# Get a single agent (includes deployed release details)
cargo-ai ai agent get <agent-uuid>

# Create an agent
cargo-ai ai agent create \
  --name "Lead Researcher" \
  --icon-color blue --icon-face 🤖 \
  --description "Researches leads and enriches data"

# Update an agent
cargo-ai ai agent update --uuid <agent-uuid> \
  --name "Senior Lead Researcher" \
  --description "Updated description"

# Move to a folder (find folder UUIDs via cargo-workspace-management)
cargo-ai ai agent update --uuid <agent-uuid> --folder-uuid <folder-uuid>

# Remove an agent
cargo-ai ai agent remove <agent-uuid>
```

**Agent icon:** `--icon-color` must be one of: `grey`, `green`, `purple`, `yellow`, `blue`, `red`. `--icon-face` is an emoji string.

**Folders:** Folder creation, listing, and management lives in [`cargo-workspace-management`](../cargo-workspace-management/SKILL.md) (`cargo-ai workspaceManagement folder list/create/...`). Use that skill to discover or create the `<folder-uuid>` you pass to `--folder-uuid` here.

## Releases

Releases are versioned snapshots of an agent's configuration (system prompt, actions, resources, model, temperature). Agents execute against their deployed release.

```bash
# List releases for an agent
cargo-ai ai release list --agent-uuid <uuid>

# Get a specific release
cargo-ai ai release get <release-uuid>

# Get the current draft release (editable)
cargo-ai ai release get-draft --agent-uuid <uuid>

# Update the draft release
cargo-ai ai release update-draft --agent-uuid <uuid> \
  --system-prompt "You are a lead research assistant..." \
  --language-model-slug gpt-4o \
  --temperature 0.3 \
  --max-steps 10

# Deploy the draft release (makes it live)
cargo-ai ai release deploy-draft --agent-uuid <uuid> \
  --integration-slug openai \
  --language-model-slug gpt-4o \
  --actions '[]' \
  --mcp-clients '[]' \
  --resources '[]' \
  --capabilities '[]' \
  --suggested-actions '[]' \
  --description "Added research actions"
```

### Structured output & heartbeat — not yet exposed as CLI flags

The release API payload (both `draft/update` and `draft/deploy`) accepts two fields that **`release update-draft` / `release deploy-draft` do not surface as flags** (verified against the CLI source — there is no `--output` / `--output-schema` or `--heartbeat`):

| Field | Shape | Purpose |
|---|---|---|
| `output` | `{"type":"text"}` **or** `{"type":"jsonSchema","jsonSchema": <standard JSON Schema object>}` | Force the agent to return structured output matching a JSON Schema. |
| `heartbeat` | `{"intervalMinutes": number, "maxMessages": number, "prompt": string \| null}` | Periodically re-wake the chat (`intervalMinutes`) until it reaches `maxMessages`; `prompt` is the wake message (null = generic "continue"). |

The generic `--options` flag does **not** carry these — the API's `options` only holds `{connectorUuidsByIntegrationSlug, modelUuidsByIntegrationSlug}`. Until the flags ship, set these with a direct API call against the same endpoints the CLI uses:

```bash
# Structured (JSON Schema) output on the draft release
curl -sS -X PUT "$CARGO_API_BASE/v1/ai/releases/draft/update" \
  -H "Authorization: Bearer $CARGO_TOKEN" -H "Content-Type: application/json" \
  -d '{"agentUuid":"<uuid>","output":{"type":"jsonSchema","jsonSchema":{"type":"object","properties":{"score":{"type":"number"}},"required":["score"]}}}'
# Deploy carries the same fields — POST .../v1/ai/releases/draft/deploy
```

Send these payloads alongside the other fields you're updating (the endpoint replaces the draft config). **File a `workspaceManagement report`** (see [`../cargo-workspace-management/SKILL.md`](../cargo-workspace-management/SKILL.md)) to request first-class `--output` / `--heartbeat` flags — this is the documented feedback channel for CLI/UI parity gaps.

**Agent configuration workflow:**

1. **Browse templates for inspiration**: `cargo-ai ai template list` — find a template close to your use case, then `cargo-ai ai template get <slug>` to see its system prompt, model, and temperature
2. Create the agent: `cargo-ai ai agent create --name "..." --icon-color blue --icon-face 🤖`
3. Get the draft release: `cargo-ai ai release get-draft --agent-uuid <uuid>`
4. Update the draft with configured actions, resources, prompt, model: `cargo-ai ai release update-draft --agent-uuid <uuid> ...`
5. Deploy: `cargo-ai ai release deploy-draft --agent-uuid <uuid> ...`

## Templates

Templates are pre-built agent configurations that capture proven patterns for common use cases. **Always check templates before designing an agent from scratch** — they give you a ready-made system prompt, recommended language model, temperature, and tool configuration that you can adopt as-is or adapt.

```bash
# List available agent templates
cargo-ai ai template list

# Get a template by slug — inspect its system prompt, model, and settings
cargo-ai ai template get <slug>
```

Templates include a system prompt, actions, resources, and recommended model settings. Use them as a starting point and customize via `release update-draft`. See `references/examples/templates.md` for the full guide including an end-to-end example of creating an agent from a template.

## Model and temperature guidance

| Use case | Recommended model | Temperature |
|---|---|---|
| Classification, extraction, scoring | `gpt-4o-mini` or `claude-3-5-haiku` | `0.0` – `0.2` |
| Research, summarization, analysis | `gpt-4o` or `claude-3-5-sonnet` | `0.2` – `0.5` |
| Copywriting, personalization | `gpt-4o` or `claude-3-5-sonnet` | `0.5` – `0.8` |
| Brainstorming, creative ideation | `gpt-4o` or `claude-opus` | `0.7` – `1.0` |

Low temperature (`0.0`–`0.2`) = deterministic, consistent outputs. High temperature (`0.7`+) = creative, varied outputs. For production workflows processing thousands of records, prefer low temperature.

## Knowledge for RAG (files & libraries)

Knowledge that grounds agent responses (retrieval-augmented generation, RAG) comes from the **`content`** domain — see [`cargo-content`](../cargo-content/SKILL.md):

- **Files** — uploaded binaries (PDFs, CSVs, text).
- **Libraries** — collections that group files, either `native` (workspace-managed) or `connector`-backed (synced from an external source via an unstructured-data extractor).

> Files and libraries moved out of `ai` into the top-level **`content`** domain in CLI ≥ 1.0.19 (`cargo-ai content file …` / `cargo-ai content library …`). The old `ai file …` commands are gone. Everything content-related now lives in [`cargo-content`](../cargo-content/SKILL.md).

### Attaching knowledge to an agent

A file or library is inert until attached to an agent via the draft release's `resources` array and deployed. Upload files / build libraries in [`cargo-content`](../cargo-content/SKILL.md), then wire them in here with `release update-draft --resources …` followed by `release deploy-draft`. See [`../cargo-content/references/examples/files.md`](../cargo-content/references/examples/files.md) for the full upload → attach → deploy sequence.

## MCP servers

MCP (Model Context Protocol) servers expose additional actions to agents. Once connected, agents can call MCP actions automatically during conversations or workflow runs.

```bash
# List all MCP servers
cargo-ai ai mcp-server list

# Create an MCP server
cargo-ai ai mcp-server create --name "Internal Tools"

# Update an MCP server
cargo-ai ai mcp-server update --uuid <mcp-server-uuid> --name "Updated Tools"

# Remove an MCP server
cargo-ai ai mcp-server remove <mcp-server-uuid>
```

MCP clients (connections to MCP servers) are configured on agent releases. Use `release update-draft` to attach MCP clients to an agent.

## Memories

Memories are pieces of information an agent stores from conversations for future reference. They can be scoped to a workspace, user, or specific agent.

```bash
# List agent memories
cargo-ai ai memory list --scope agent --agent-uuid <uuid>

# List workspace-wide memories
cargo-ai ai memory list --scope workspace

# List user-scoped memories
cargo-ai ai memory list --scope user

# Update a memory
cargo-ai ai memory update \
  --mem0-id <id> \
  --scope agent --agent-uuid <uuid> \
  --content "Updated memory content"

# Remove a memory
cargo-ai ai memory remove \
  --mem0-id <id> \
  --scope agent --agent-uuid <uuid>
```

## Help

Every command supports `--help`:

```bash
cargo-ai ai agent create --help
cargo-ai ai release update-draft --help
cargo-ai ai mcp-server create --help
cargo-ai ai memory list --help
```
