# Authoring resources

Every Cargo resource has a `define*` builder imported from `@cargo-ai/cdk`. Each
returns a **handle**; you wire resources together by passing one handle into
another builder. **Importing a `.ts` file is registration** — each `define*` call
registers itself as a side effect, so there is no manifest to maintain. The loader
imports every `.ts` under the project directory (skipping worker/app bundle
sub-directories, which have their own `package.json`).

For the exact spec fields and outputs of each builder, see
[`../references/resources.md`](../references/resources.md).

## The handle / ref model (the one thing to internalize)

Pass the **handle** a builder returned — never `handle.uuid`:

```ts
export const contacts = defineModel("contacts", {
  dataset: hubspot, // ← the connector handle, not hubspot.datasetUuid
});
```

The CDK reads the dependency (connector → model), deploys the connector first, and
injects its real dataset uuid at deploy time. Your variable graph *is* the
dependency graph.

For a resource you did **not** define in code (an existing connector, folder,
etc.), use a `xxRef("uuid")` helper — it produces the same handle shape from a
literal uuid:

```ts
import { defineModel, connectorRef } from "@cargo-ai/cdk";

export const leads = defineModel("leads", {
  dataset: connectorRef("6f0c…"), // an already-authenticated connector, by uuid
});
```

Ref helpers: `connectorRef`, `datasetRef`, `modelRef`, `folderRef`, `playRef`,
`memberRef` (from `@cargo-ai/cdk`) and `toolRef`, `agentRef` (re-exported from the
workflow SDK). Each is branded by kind, so a model can't be passed where a
connector is expected.

**Per-call options:** where a reference takes options, wrap it as
`{ ref, …options }`:

```ts
models: [{ ref: contacts, readOnly: true }],   // handle + options
subAgents: [{ ref: enricher, waitUntilFinished: true }],
tools: [enrich],                               // bare handle when no options
```

## Secrets — `secret()` + `env()`

Wire credentials with `secret("ENV_VAR")`. The value is read from the environment
**at deploy time**, kept out of the content hash and out of `cargo.state.json`, so
rotating the token never reads as drift:

```ts
import { defineConnector, secret } from "@cargo-ai/cdk";

export const hubspot = defineConnector("hubspot", {
  integration: "hubspot",
  config: { method: "privateApp", accessToken: secret("HUBSPOT_API_KEY") },
});
```

`secret()` is only accepted where a credential/encryption field is expected. Use
`env("NAME")` for non-secret config values that come from the environment. Export
the variables before deploying — a missing one fails deploy with an unresolved
`${NAME}` placeholder rather than sending a literal to the API.

## The builder catalog

Data & schema:

```ts
// Connector — a data source or LLM provider. Creating a data connector
// auto-creates a dataset that models source from. OAuth connectors that can't be
// declared in code use `adopt: true` to link the existing authenticated instance.
export const hubspot = defineConnector("hubspot", {
  integration: "hubspot",
  config: { method: "privateApp", accessToken: secret("HUBSPOT_API_KEY") },
});
export const openai = defineConnector("open_ai", { integration: "openAi", adopt: true });

// Model — a table sourced from a connector's dataset by an extractor.
export const contacts = defineModel("contacts", {
  dataset: hubspot,                 // connector handle → its dataset is injected
  extractSlug: "fetchRecords",
  config: { objectType: "contacts", columnSelectionMode: "all" },
  folder: modelsFolder,
  schedule: { type: "cron", cron: "0 * * * *" },
});
```

Automation:

```ts
// Tool — backed by a workflow. defineWorkflow compiles the logic; defineTool
// creates the tool and deploys that workflow as its release.
const enrichFlow = defineWorkflow(
  "enrich-contact",
  { input: z.object({ email: z.string() }), output: z.object({ company: z.string() }), uses: { enricher } },
  ({ input, uses }) => ({ company: uses.enricher({ prompt: `Company for ${input.email}?` }) }),
);
export const enrich = defineTool("enrich", { workflow: enrichFlow, emojiSlug: "mag" });

// Play — runs a per-row workflow as a data model's rows change.
export const onboarding = definePlay("onboarding", {
  model: contacts,
  workflow: onboardRow,
  changeKinds: ["added", "updated"],
  runCreationRule: "always",
  schedule: { type: "watch" },
});

// Agent — references models, tools, sub-agents, connector actions, and the LLM
// connector, each by handle.
export const sdr = defineAgent("sdr", {
  connector: openai,
  languageModel: "gpt-4o",
  systemPrompt: "Qualify inbound leads.",
  models: [{ ref: contacts, readOnly: true }],
  tools: [enrich],
  subAgents: [{ ref: enricher, waitUntilFinished: true }],
  connectorActions: [{ integration: "hunter", actionSlug: "emailFinder" }],
  folder: agentsFolder,
});

// MCP server — bundles tools, agents, and models behind one MCP endpoint.
export const crm = defineMcpServer("crm", { tools: [enrich], agents: [sdr], models: [{ ref: contacts }] });
```

Organization & knowledge:

```ts
// Folder — per-kind (a "model" folder and an "agent" folder are separate).
export const modelsFolder = defineFolder("crm-models", { kind: "model", name: "CRM" });

// RECOMMENDED: route every CDK-managed resource into a dedicated, clearly
// labelled folder (via each builder's `folder:`), so a human in the UI sees at a
// glance that these resources are owned by code and shouldn't be hand-edited —
// manual UI changes read back as drift on the next `plan`. Because folders are
// per-kind, give each kind its own but share ONE short, recognizable prefix, e.g.
// `🔒 CDK` (or `🔒 CDK Models`, `🔒 CDK Agents`). Keep names short — long labels
// truncate in the folder tree; the lock emoji is the "don't touch" cue.
export const cdkModels = defineFolder("cdk-models", { kind: "model", name: "🔒 CDK Models" });
export const cdkAgents = defineFolder("cdk-agents", { kind: "agent", name: "🔒 CDK Agents" });

// File — content uploaded from a local path (hashed at define time, so edits show as drift).
export const playbook = defineFile("playbook", {
  path: new URL("./playbook.md", import.meta.url).pathname,
  name: "SDR Playbook",
});

// Context — the workspace's git-backed GTM knowledge base as code. Singleton;
// additive (files added in the UI are left in place).
export const context = defineContext({ dir: "context" });
```

Revenue org & segmentation:

```ts
// Segment — a saved view over a model (filter is required; model is immutable).
export const hotLeads = defineSegment("hot-leads", { model: contacts, filter: { /* … */ } });

// Capacity / Territory — revenue-org planning over members and a model.
export const capacity = defineCapacity("ae-capacity", { model: contacts, /* … */ });
export const territory = defineTerritory("west", { model: contacts, members: [memberRef("…")] });
```

Hosting (async builds — see [`deploy-and-state.md`](deploy-and-state.md)):

```ts
// Worker — the hosted worker slot. `path` points at a BUILT bundle dir
// (index.js + manifest.json + package.json + package-lock.json). Author the
// runtime code with createWorker from @cargo-ai/worker-sdk and build to index.js.
export const webhook = defineWorker("webhook", {
  path: new URL("./webhook", import.meta.url).pathname,
  description: "Receives inbound lead webhooks.",
});

// App — a hosted Vite SPA. `path` points at the app package root.
export const dashboard = defineApp("dashboard", {
  path: new URL("./dashboard", import.meta.url).pathname,
});
```

The full `full` template wires all of the above together end-to-end — see
[`../references/examples/full-workspace.md`](../references/examples/full-workspace.md).

## Workflow bodies (`defineWorkflow`) — parsed, not executed

`defineTool` and `definePlay` take a `workflow:` built with `defineWorkflow`. The
body callback is **parsed, not executed** — the SDK reads the function's source
and lowers it into the engine's node graph. So the body must be a supported JS
subset (no `await`, `throw`, `try/catch`, closures, or destructuring).

```ts
defineWorkflow(
  "onboard-contact",
  {
    input: z.object({ email: z.string() }),
    output: z.object({ welcomed: z.boolean(), message: z.string() }),
    uses: { enrich }, // reference tools/agents by handle here (or toolRef/agentRef)
  },
  ({ input, uses, ai, integrations, native }) => {
    const enriched = uses.enrich({ email: input.email }); // typed to the tool's I/O
    const message = ai(`Welcome ${input.email} at ${enriched.company}.`);
    return { welcomed: true, message };
  },
);
```

- **`uses.<key>(input)`** calls a referenced tool/agent; it's typed to that
  resource's input and returns a `Ref` you can dot-access (`enriched.company`).
- **`integrations.<slug>.<action>({…})`** calls a connector action. The
  `integrations` registry is **empty until you run `cargo-ai cdk types`** (see
  [`typed-config.md`](typed-config.md)); `native.*` works without a sync.
- Control flow lowers idiomatically: `if/else` → branch, `else if` → switch,
  `for (const x of xs)` → group. `ai("…")` inline-completes; `js(({nodes}) => …)`
  is the escape hatch for logic outside the supported subset. Flow helpers:
  `balance`, `split`, `humanReview`, `memory`.

For the full workflow-authoring surface (per-call retry/fallback, the supported-JS
table, toolchain requirements), that lives in the `@cargo-ai/workflow-sdk` docs —
`defineWorkflow` is re-exported from `@cargo-ai/cdk`, so you import it from the one
package.
