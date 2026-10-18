# Recipe: build an agent (model + tool + agent)

**Use when** the user wants an AI agent with a data model, a tool, and an LLM
connector — all declared in the project. Everything wires by handle, so the deploy runs in
dependency order.

## 1. The LLM connector

An agent needs a language-model provider connector. Adopt an existing one:

```ts
// connectors/openai.ts
import { defineConnector } from "@cargo-ai/cdk";
export const openai = defineConnector("open_ai", { integration: "openAi", default: true });
```

## 2. A tool, backed by a workflow

`defineWorkflow` compiles the logic (parsed, not executed); `defineTool` deploys it
as the tool's release. Reference other resources inside the body via `uses`.

```ts
// tools/enrich.ts
import { defineTool, defineWorkflow } from "@cargo-ai/cdk";
import { z } from "zod";
import { hunter } from "../connectors/hunter"; // a defineConnector("hunter", { integration: "hunter", … }) handle

const enrichFlow = defineWorkflow(
  "enrich-contact",
  {
    input: z.object({ email: z.string() }),
    output: z.object({ company: z.string(), enriched: z.boolean() }),
    uses: { hunter },
  },
  ({ input, uses }) => {
    const found = uses.hunter.enrichPerson({ email: input.email });
    return { company: found.data.employment.name, enriched: true };
  },
);

export const enrich = defineTool("enrich", {
  workflow: enrichFlow,
  description: "Enrich a contact with firmographic data.",
  emojiSlug: "mag",
});
```

> `uses.<connector>.<action>` is typed only after `cargo-ai project types` (it reads
> your workspace's integrations); unsynced, any action slug is accepted. Native
> helpers (`sendEmail`, `model.*`, …) need no sync. See
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
  uses: [{ ref: contacts, readOnly: true }, enrich],
  triggers: [{ type: "cron", cron: "0 9 * * *", text: "Daily qualification" }],
  evaluator: { rubric: "Did it correctly qualify the lead?", threshold: 0.8 },
});
```

Add a sub-agent to `uses` as `{ ref: enricher, waitUntilFinished: true }`, or a
connector action as `hunter.actions.findEmail` (or
`connectorActionRef(hunter, "findEmail")`).

## 4. Deploy

```bash
cargo-ai project types      # so uses.hunter.* in the workflow body typechecks
cargo-ai project plan       # orders: connector → tool (+ its workflow) → model → agent
cargo-ai project deploy
git add cargo.state.json && git commit -m "Add SDR agent"
```

Because `agent:sdr` has no slug, the deploy state is the **only** handle on it — so commit
the `cargo.state.json` pointer, or the next deploy can't find the state that names it
(recover the pointer with `project state bind <uuid>`, or the single resource with
`project import agent:sdr <uuid>`).
