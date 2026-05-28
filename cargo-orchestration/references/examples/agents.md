# AI agent examples

## Basic chat: ask a question and get a response

```bash
# 1. Find the right agent by name
cargo-ai ai agent list
# → Match by name, extract agent uuid

# 2. Create a chat session
cargo-ai ai chat create \
  --trigger '{"type":"draft"}' \
  --agent-uuid <agent-uuid> \
  --name "Quick question"
# → Extract chat.uuid

# 3. Send a message
cargo-ai ai message create \
  --chat-uuid <chat-uuid> \
  --parts '[{"type":"text","text":"What is Acme Corp'\''s employee count?"}]'
```

Message create response:

```json
{
  "userMessage": { "uuid": "user-msg-uuid", "status": "success" },
  "assistantMessage": {
    "uuid": "assistant-msg-uuid",
    "status": "pending",
    "parts": []
  }
}
```

```bash
# 4. Poll for the response (repeat every 2s)
cargo-ai ai message get <assistant-msg-uuid>
```

Poll until `status` is `success` or `error`:

```json
{
  "message": {
    "uuid": "assistant-msg-uuid",
    "status": "success",
    "parts": [
      { "type": "text", "text": "Acme Corp has approximately 500 employees..." }
    ],
    "errorMessage": null
  }
}
```

Status values: `pending` → `generating` → `success` or `error`. On `error`, read `.message.errorMessage`.

## Multi-turn conversation

```bash
# 1. Create a chat
cargo-ai ai chat create \
  --trigger '{"type":"draft"}' \
  --agent-uuid <agent-uuid> \
  --name "Lead research"
# → Extract chat.uuid

# 2. First message
cargo-ai ai message create \
  --chat-uuid <chat-uuid> \
  --parts '[{"type":"text","text":"Find the VP of Sales at Acme Corp"}]'
# → Poll assistantMessage.uuid until success

# 3. Follow-up in the same chat (agent remembers context)
cargo-ai ai message create \
  --chat-uuid <chat-uuid> \
  --parts '[{"type":"text","text":"Now find their email address"}]'
# → Poll the new assistantMessage.uuid

# 4. Another follow-up
cargo-ai ai message create \
  --chat-uuid <chat-uuid> \
  --parts '[{"type":"text","text":"Draft a cold outreach email to them"}]'
# → Poll again
```

## Reuse an existing chat session

```bash
# 1. List existing chats for an agent
cargo-ai ai chat list --agent-uuid <agent-uuid> --limit 10
# → Find a chat by name or pick the most recent one

# 2. Send a message in the existing chat
cargo-ai ai message create \
  --chat-uuid <existing-chat-uuid> \
  --parts '[{"type":"text","text":"Any updates on the Acme deal?"}]'
# → Poll for response
```

## Send a message with actions

Give the agent access to specific actions for enrichment, CRM actions, etc.

```bash
cargo-ai ai message create \
  --chat-uuid <chat-uuid> \
  --parts '[{"type":"text","text":"Enrich this lead and add to Salesforce"}]' \
  --actions '[{"slug":"clearbit","kind":"tool","toolUuid": "<tool-uuid>","config":{}},{"slug":"salesforce","kind":"tool","config":{}}]'
# → The agent can use these actions during its response
```

## Send a message with model resources

Give the agent access to a data model to query.

```bash
# 1. Find the model UUID
cargo-ai storage model list

# 2. Send message with the model as a resource
cargo-ai ai message create \
  --chat-uuid <chat-uuid> \
  --parts '[{"type":"text","text":"Find all companies in France with more than 100 employees"}]' \
  --resources '[{"slug":"companies","kind":"model","integrationSlug":"salesforce","modelUuid":"<model-uuid>"}]'
```

## Use a specific language model and temperature

```bash
cargo-ai ai message create \
  --chat-uuid <chat-uuid> \
  --parts '[{"type":"text","text":"Write a creative subject line for this campaign"}]' \
  --language-model-slug gpt-4o \
  --temperature 0.9
```

Lower temperature (0.0–0.3) for factual/structured tasks, higher (0.7–1.0) for creative tasks.

## Send a message with actions, resources, and custom model

Full example combining all options.

```bash
cargo-ai ai message create \
  --chat-uuid <chat-uuid> \
  --parts '[{"type":"text","text":"Research Acme Corp, enrich their data, and update our CRM"}]' \
  --actions '[{"slug":"clearbit","kind":"tool","config":{}},{"slug":"salesforce","kind":"tool","config":{}}]' \
  --resources '[{"slug":"companies","kind":"model","integrationSlug":"salesforce","modelUuid":"<model-uuid>"}]' \
  --language-model-slug gpt-4o \
  --temperature 0.3 \
  --max-steps 10
```

## List messages in a chat

```bash
cargo-ai ai message list --chat-uuid <chat-uuid> --limit 20
# → Returns all messages in order (both user and assistant)
```

## Check all chats for an agent

```bash
# All chats
cargo-ai ai chat list --agent-uuid <agent-uuid>

# With pagination
cargo-ai ai chat list --agent-uuid <agent-uuid> --limit 5 --offset 0
```

## End-to-end: use an AI template to create an agent and run a research task

This example uses an AI template to bootstrap a lead researcher agent, then sends it a research task.

```bash
# Step 1 — Browse AI templates
cargo-ai ai template list
# → Find slug: "lead-researcher"
#   languageModelSlug: "gpt-4o", temperature: 0.3

# Step 2 — Create an agent
cargo-ai ai agent create \
  --name "Lead Researcher" \
  --icon-color purple --icon-face 🔍
# → Extract agent.uuid (e.g. "agent-abc")

# Step 3 — Configure the draft release with template settings
cargo-ai ai release update-draft --agent-uuid agent-abc \
  --system-prompt "You are a research assistant. Given a company domain and a contact name, find their role, LinkedIn profile URL, and email address. Return structured JSON with keys: role, linkedin_url, email." \
  --language-model-slug gpt-4o \
  --temperature 0.3

# Step 4 — Attach a knowledge file (optional — ICP criteria, product info, etc.)
cargo-ai ai file upload --file-path ./icp-criteria.pdf
# → Extract file.uuid

# Step 5 — Give the agent access to actions (optional — connectors as actions)
cargo-ai orchestration tool list
# → Find a "Find Email" tool, extract uuid

# Step 6 — Create a chat session
cargo-ai ai chat create \
  --trigger '{"type":"draft"}' \
  --agent-uuid agent-abc \
  --name "Lead research — Acme Corp"
# → Extract chat.uuid

# Step 7 — Send the research request
cargo-ai ai message create \
  --chat-uuid <chat-uuid> \
  --parts '[{"type":"text","text":"Research the VP of Sales at acme.com. Find their name, LinkedIn URL, and email address."}]' \
  --actions '[{"slug":"find_email","kind":"tool","toolUuid":"<email-finder-tool-uuid>","config":{}}]' \
  --max-steps 10
# → Extract assistantMessage.uuid

# Step 8 — Poll for the response (every 2s)
cargo-ai ai message get <assistant-msg-uuid>
# → Done when message.status is "success" (read .parts) or "error" (read .errorMessage)

# Step 9 — Follow up in the same chat
cargo-ai ai message create \
  --chat-uuid <chat-uuid> \
  --parts '[{"type":"text","text":"Now draft a personalised cold outreach email to this person."}]'
# → Poll again
```
