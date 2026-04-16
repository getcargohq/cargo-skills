---
name: cargo-cli-ai
description: Create and configure AI agents, upload files for RAG, manage MCP servers, and handle agent memories using the Cargo CLI. Use when the user wants to create or update agents, upload knowledge base files, connect MCP tool servers, or manage agent memories. For sending messages to agents, use the cargo-cli-orchestration skill instead.
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo API token
metadata:
  author: getcargo
  version: "1.0"
---

# Cargo CLI — AI

Agent resource management: creating and configuring agents, uploading files for retrieval-augmented generation (RAG), connecting MCP servers, and managing agent memories.

> For *using* agents (sending messages, multi-turn chat, polling), use `cargo-cli-orchestration`.

> See `references/response-shapes.md` for full JSON response structures.
> See `references/troubleshooting.md` for common errors and how to fix them.
> See `references/examples/agents.md` for agent CRUD and configuration examples.
> See `references/examples/files.md` for file upload and management examples.
> See `references/examples/mcp-servers.md` for MCP server creation and management examples.

## Prerequisites

```bash
npm install -g @cargo-ai/cli
cargo-ai login --token <your-api-token>
cargo-ai login --token <your-api-token> --workspace-uuid <uuid>
```

Verify with `cargo-ai whoami`. All commands output JSON to stdout. Without a global install, prefix every command with `npx @cargo-ai/cli` instead of `cargo-ai`.

Failed commands exit non-zero and return `{"errorMessage": "..."}`.

## Discover resources first

```bash
cargo-ai ai agent list                     # all agents (uuid, name, description)
cargo-ai ai template list                  # all AI agent templates (slug, name)
cargo-ai ai file list                      # all uploaded files (uuid, name, contentType)
cargo-ai ai mcp-server list                # all MCP servers (uuid, name)
cargo-ai ai memory list --scope agent --agent-uuid <uuid>  # agent memories
```

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
cargo-ai ai file list
cargo-ai ai file upload --file-path ./knowledge-base.pdf
cargo-ai ai file update --uuid <file-uuid> --name "Updated Name"
cargo-ai ai file remove <file-uuid>
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

# Move to a folder
cargo-ai ai agent update --uuid <agent-uuid> --folder-uuid <folder-uuid>

# Remove an agent
cargo-ai ai agent remove <agent-uuid>
```

**Agent icon:** `--icon-color` must be one of: `grey`, `green`, `purple`, `yellow`, `blue`, `red`. `--icon-face` is an emoji string.

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

**Agent configuration workflow:**

1. **Browse templates for inspiration**: `cargo-ai ai template list` — find a template close to your use case, then `cargo-ai ai template get <slug>` to see its system prompt, model, and temperature
2. Create the agent: `cargo-ai ai agent create --name "..." --icon-color blue --icon-face 🤖`
3. Get the draft release: `cargo-ai ai release get-draft --agent-uuid <uuid>`
4. Update the draft with actions, resources, prompt, model: `cargo-ai ai release update-draft --agent-uuid <uuid> ...`
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

## Files

Upload files (PDFs, CSVs, text) for retrieval-augmented generation (RAG). Agents reference uploaded files to ground their responses in specific knowledge.

```bash
# List all files
cargo-ai ai file list

# Upload a file
cargo-ai ai file upload --file-path ./knowledge-base.pdf

# Update a file's name or folder
cargo-ai ai file update --uuid <file-uuid> --name "Q1 Research Notes"
cargo-ai ai file update --uuid <file-uuid> --folder-uuid <folder-uuid>

# Remove a file
cargo-ai ai file remove <file-uuid>
```

Uploaded files are attached to agents via the release's `resources` configuration. Use `release update-draft` to add file resources to an agent.

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
cargo-ai ai file upload --help
cargo-ai ai mcp-server create --help
cargo-ai ai memory list --help
```
