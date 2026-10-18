# Typed config — `cargo-ai project types`

`defineConnector`/`defineModel` config, agent language models, and connector actions
called through `uses.<key>.<action>` in workflow bodies are typed against **your workspace's real integration schemas**.
Those types aren't bundled (they're workspace-specific) — you generate them:

```bash
cargo-ai project types --dir acme-gtm
```

Typing is a **bonus, never a gate**: an integration you haven't synced (or a
custom one) falls back to a loose `Record<string, unknown>`, so `deploy` works
without ever running `project types`.

## What it generates

Everything lands in `.cargo-ai/` (git-ignored):

- **`.cargo-ai/cargo-types.d.ts`** — `declare module` augmentations:
  - types `@cargo-ai/cdk`'s `defineConnector`/`defineModel` `config` against your
    connector and extractor schemas. E.g. HubSpot's config becomes a discriminated
    union — the editor completes `method` and requires the matching credential,
    and `secret()` is accepted wherever a credential is expected.
  - adds your workspace's integration slugs to the `Integrations` interface, so
    `uses.<key>.<action>({ … })` on a connector handle in a workflow body
    typechecks against the real action schema.
  - types model columns and agent `languageModel` per connector.

That one file is all it writes: it is types only, with nothing to import at runtime.

Re-run `cargo-ai project types` whenever your workspace's integrations change (added a
connector, changed an extractor).

## Wiring it into your project

`project init` sets this up; for a hand-rolled project, one step:

1. **Add the glob to `tsconfig.json` `include`.** A bare `.cargo-ai` (a dot-dir) is
   ignored by TypeScript — you must use an explicit glob:

   ```jsonc
   // tsconfig.json
   "include": ["**/*.ts", ".cargo-ai/**/*.d.ts"]
   ```

Native actions need no generation: they are identical in every workspace, so the
helpers (`model.*`, `sendEmail`, `delay`, …) ship typed with the SDK. Connectors,
tools and agents are not a registry either: reference them by handle through
`defineWorkflow`'s `uses`.

## Symptoms that mean "run `project types`"

- `config` on a `defineConnector` isn't autocompleting / isn't rejecting a wrong
  credential shape → types not generated (or `.cargo-ai/**/*.d.ts` not in
  `include`).
- `uses.<key>.<action>` accepts any action slug / untyped input → types not
  generated, or stale after an integration change.
- A connector `deploy` fails with `Invalid configuration` → often the credential
  wasn't wrapped in `secret()`; generating types surfaces the required shape at
  author time. See [`../references/troubleshooting.md`](../references/troubleshooting.md).
