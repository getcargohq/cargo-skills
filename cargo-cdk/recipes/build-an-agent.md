# Recipe: build an agent (model + tool + agent)

**Use when** the user wants an AI agent with a data model, a tool, and an LLM
connector — all as code. Everything wires by handle, so the CDK deploys in
dependency order.

## 1. The LLM connector

An agent needs a language-model provider connector. Adopt an existing one:

```ts
// connectors/openai.ts
import { defineConnector } from "@cargo-ai/cdk";
export const openai = defineConnector("open_ai", { integration: "openAi", adopt: true });
```

## 2. A tool, backed by a workflow

`defineWorkflow` compiles the logic (parsed, not executed); `defineTool` deploys it
as the tool's release. Reference other resources inside the body via `uses`.

```ts
// tools/enrich.ts
import { defineTool, defineWorkflow } from "@cargo-ai/cdk";
import { z } from "zod";

const enrichFlow = defineWorkflow(
  "enrich-contact",
  {
    input: z.object({ email: z.string() }),
    output: z.object({ company: z.string(), enriched: z.boolean() }),
  },
  ({ input, integrations }) => {
    const found = integrations.hunter.companyEnrichment({ domain: input.email });
    return { company: found.name, enriched: true };
  },
);

export const enrich = defineTool("enrich", {
  workflow: enrichFlow,
  description: "Enrich a contact with firmographic data.",
  emojiSlug: "mag",
});
```

> `integrations.*` is typed and callable only after `cargo-ai cdk types` (it reads
> your workspace's integrations). `native.*` works without it. See
> [`../guides/typed-config.md`](../guides/typed-config.md).

## 3. The agent, referencing model + tool + connector

Pass each dependency as a handle — bare, or `{ ref, …options }` when it needs
options:

```ts
// agents/sdr.ts
import { defineAgent } from "@cargo-ai/cdk";
import { openai } from "../connectors/openai";
import { contacts } from "../models/contacts";
import { enrich } from "../tools/enrich";

export const sdr = defineAgent("sdr", {
  connector: openai,
  languageModel: "gpt-4o",
  systemPrompt: "You qualify inbound leads and enrich missing contact info.",
  maxSteps: 12,
  capabilities: ["webSearch", "memory"],
  models: [{ ref: contacts, readOnly: true }],
  tools: [enrich],
  triggers: [{ type: "cron", cron: "0 9 * * *", text: "Daily qualification" }],
  evaluator: { rubric: "Did it correctly qualify the lead?", threshold: 0.8 },
});
```

Add a sub-agent with `subAgents: [{ ref: enricher, waitUntilFinished: true }]`, or a
raw connector action with
`connectorActions: [{ integration: "hunter", actionSlug: "emailFinder" }]`.

## 4. Deploy

```bash
cargo-ai cdk types      # so integrations.* in the workflow body typecheck
cargo-ai cdk plan       # orders: connector → tool (+ its workflow) → model → agent
cargo-ai cdk deploy
git add cargo.state.json && git commit -m "Add SDR agent"
```

Because `agent:sdr` has no slug, `cargo.state.json` is the **only** handle on it —
commit it, or the next deploy can't find it (recover with `cdk import agent:sdr <uuid>`).
