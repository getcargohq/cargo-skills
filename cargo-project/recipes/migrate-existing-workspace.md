# Recipe: bring an existing workspace under a project

**Use when** a workspace already has live resources (built in the UI or the
imperative CLI) and the user wants to manage them from a project going forward —
without creating duplicates.

The tool is `cargo-ai project import <id> <uuid>`, which binds a resource's **code id**
(`kind:slug`) to its **live uuid** in this project's deploy state. After import, `deploy`
updates that resource in place instead of creating a new one.

## 0. Make sure the repo is a project

Every `cargo-ai project` command needs a `cargo.json` at the project's root
(`@cargo-ai/cdk` ≥ 1.0.112) and stops without one. A repo started with
`project init` has it. One written by hand, or scaffolded before the file existed,
adds it, naming the folder that holds the `.ts` resources:

```bash
echo '{ "resources": "infra" }' > cargo.json
mv infra/cargo.state.json cargo.state.json   # only if an older layout left the state file in infra/
git add cargo.json cargo.state.json && git commit -m "Mark the project with cargo.json"
```

## 1. Write the `define*` for the resource

Describe the existing resource in code as accurately as you can. Match the slug you
want to address it by:

```ts
// models/contacts.ts — describe the live model
export const contacts = defineModel("contacts", {
  connector: connectorRef("<connector-uuid>"),
  extractSlug: "fetchRecords",
  config: { objectType: "contacts", columnSelectionMode: "all" },
});
```

## 2. Find the live uuid

Use the matching capability skill to look it up — e.g. models via
[`../../cargo-storage/SKILL.md`](../../cargo-storage/SKILL.md), connectors via
[`../../cargo-connection/SKILL.md`](../../cargo-connection/SKILL.md), agents via
[`../../cargo-ai/SKILL.md`](../../cargo-ai/SKILL.md):

```bash
cargo-ai storage model list        # find the model's uuid
```

## 3. Import each resource into state

```bash
cargo-ai project import model:contacts <model-uuid> --dir acme-gtm
cargo-ai project import connector:hubspot <connector-uuid> --dir acme-gtm
cargo-ai project import agent:sdr <agent-uuid> --dir acme-gtm
```

- The id is `kind:slug` — the same id the plan output uses.
- **No kind self-adopts by slug.** A `deploy` that meets a live resource already
  holding the slug fails with `duplicateSlug` and prints the `import` command to run,
  so `import` (or `cargo-ai project pull`, which generates the `define*` and adopts
  in one step) is how every kind is bound one at a time. If you lost only the *pointer*, `project state list`
  then `project state bind <uuid>` recovers everything at once; `import` is for when the
  state itself is gone.

## 4. Verify with a plan

```bash
cargo-ai project plan --dir acme-gtm
```

Imported resources should show as **update** or **no-op**, not **create**. A
`create` for something that already exists means the id/slug didn't match — fix the
`define*` slug or re-import with the right uuid.

## 5. Deploy and commit

```bash
cargo-ai project deploy --dir acme-gtm
git add cargo.state.json && git commit -m "Adopt the existing workspace into the project"
```

Imported/adopted resources are **released** (dropped from state), not deleted, if
you later `destroy` or `deploy --prune` them — a deploy won't delete something it
only adopted.
