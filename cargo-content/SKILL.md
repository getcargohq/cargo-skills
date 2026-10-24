---
name: cargo-content
description: "Manage the files a Cargo workspace holds — upload knowledge (PDF, CSV, text) and build native or connector-backed libraries agents retrieve from (RAG), and use files as plain storage: write and read by path, list a folder, hand out a signed or public link. Triggers: \"upload this PDF\", \"add these docs as knowledge\", \"build a knowledge base\", \"sync our help center into Cargo\", \"what files are in the workspace\", \"index this folder\", \"attach our pricing sheet\", \"store this file\", \"save the report somewhere\", \"give me a link to the file\", \"make this file public\". Skip when: wiring the file or library into an agent — use cargo-ai; uploading a CSV that drives a batch run — that is a workspace-management file upload."
version: "1.2.0"
compatibility: Requires @cargo-ai/cli (npm). Sign in or create an account with `cargo-ai login --email` (emailed code, no browser), `--oauth`, or an API token
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

# Cargo CLI — Content

Workspace **files**: upload and organize them (PDFs, CSVs, text) and group or sync them into **libraries** — the knowledge resources that ground agent responses (retrieval-augmented generation, RAG). Files are also **plain storage**: write one at a path, read it back, list a folder, and hand out a link, from the CLI, the HTTP objects API, a hosted worker, a workflow node, or an agent — see [Files as storage](#files-as-storage-paths-and-links).

> **New top-level domain (CLI ≥ 1.0.19).** Files and libraries moved out of the `ai` domain into the `content` domain — `cargo-ai content file …` and `cargo-ai content library …`. The old `cargo-ai ai file …` commands no longer exist; an `unknown command` error means you're on the old path.

> For **attaching** a file or library to an agent (via the release `resources` array), use [`cargo-ai`](../cargo-ai/SKILL.md).
> For **folders** that organize files, use [`cargo-workspace-management`](../cargo-workspace-management/SKILL.md) (`cargo-ai workspaceManagement folder …`).
> For batch-run **input** files (CSVs uploaded to drive a batch), that's a different surface — `cargo-ai workspaceManagement file upload` — documented in [`cargo-workspace-management`](../cargo-workspace-management/SKILL.md).

> See `references/examples/files.md` for end-to-end file, library, and attach-to-agent examples.
> See `references/objects.md` for files as storage: the path model, storage settings and their per-surface defaults, signed and public links, the context mirror, and the HTTP / worker / node / agent surfaces.
> See `references/response-shapes.md` for full JSON response structures.
> See `references/troubleshooting.md` for common errors and how to fix them.

## Bootstrap

Already signed in (`cargo-ai whoami` returns a workspace)? Skip to the next section.

```bash
npm install -g @cargo-ai/cli            # no global install? prefix every command with `npx @cargo-ai/cli`
cargo-ai login --email you@company.com  # emailed code, no browser; creates the account on first use
                                        # alternatives: --oauth (browser) · --token <api-token> (CI)
cargo-ai whoami                         # confirm the active workspace before any write
```

Every command prints JSON to stdout; failures exit non-zero with `{"errorMessage": "..."}`. Anything that creates a run or a batch is async — pass `--wait-until-finished` or poll the matching `get`. When the full skill bundle is installed, [`../cargo/references/prerequisites.md`](../cargo/references/prerequisites.md) adds the CLI version pin, token scopes, and the admin-only surface.

## Discover resources first

```bash
cargo-ai content file list                 # all uploaded files (uuid, name, contentType, size)
cargo-ai content library list              # knowledge libraries (native or connector-backed)
```

## Files

Upload files (PDFs, CSVs, text) so an agent can ground its responses in specific knowledge. The upload response includes the `uuid` you reference when attaching the file to an agent release (see [`cargo-ai`](../cargo-ai/SKILL.md)).

```bash
# List all files
cargo-ai content file list

# Get a single file
cargo-ai content file get <file-uuid>

# Upload a file (optionally straight into a folder)
cargo-ai content file upload --file ./knowledge-base.pdf
cargo-ai content file upload --file ./knowledge-base.pdf --folder-uuid <folder-uuid>

# Update a file's name or folder
cargo-ai content file update --uuid <file-uuid> --name "Q1 Research Notes"
cargo-ai content file update --uuid <file-uuid> --folder-uuid <folder-uuid>

# Remove a file
cargo-ai content file remove <file-uuid>
```

> **Content files in the context repo.** A file with `mirrorToContext: true` — the default for `upload`, web-app uploads and `defineFile` — is **committed and pushed** into the context repository under `.files/<path>` (commit `content(mirror): upsert <name>`; over 10 MB, a JSON metadata sidecar instead of the bytes), so a command in the context runtime sandbox can read it — e.g. `cargo-ai context runtime execute --command ls --args '["-1",".files"]'` — and anyone with access to that repo can too. Path writes (`put`, the objects API, workers, nodes, agents) default to `mirrorToContext: false` and stay out of git. `.files/` is read-only from the context runtime (`deniedPath`); change those files with `content file` here. See [`cargo-context`](../cargo-context/SKILL.md).

## Files as storage (paths and links)

A file's **path** is its folder chain plus its name (`reports/2026-q3/summary.pdf`). Writing to a path creates missing folders and overwrites the newest file of that name in place (same `uuid`, settings kept unless you pass new ones).

```bash
cargo-ai content file put reports/2026-q3/summary.pdf --file ./summary.pdf   # → { file, path }; any size
#   --content-type <mime> (guessed from the extension) · --index none|vectorStore (none)
#   --visibility private|public (private) · --mirror-to-context (off)
cargo-ai content file ls reports/ --limit 100            # prefix match, ordered by path; --limit ≤ 1000, --cursor <nextCursor>
cargo-ai content file download reports/2026-q3/summary.pdf --out ./copy.pdf
cargo-ai content file url reports/2026-q3/summary.pdf --expires 3600 [--download]   # → { url, expiresAt, publicUrl? }
cargo-ai content file visibility reports/2026-q3/summary.pdf public   # private revokes the public link at once
cargo-ai content file rm reports/2026-q3/summary.pdf
```

| Option | `upload` / web app / `defineFile` | `put` / objects API / worker / `writeFile` node | Agent write |
|---|---|---|---|
| `indexMode` (`--index`) | `vectorStore` | `none` | always `none` |
| `mirrorToContext` | `true` | `false` | always `false` |
| `visibility` | `private` | `private` | always `private` |

The same files over HTTP are **objects** — `PUT` / `GET` (`?meta=true` for details) / `DELETE /v1/content/objects/<path>`, `GET /v1/content/objects?prefix=` — and from a worker `createCargoObjects(env)` (`@cargo-ai/worker-sdk`); in a play, the `writeFile` / `readFile` / `getFileUrl` nodes; on an agent, a writable folder (`capability_file_write`). All of it in [`references/objects.md`](references/objects.md).

## Libraries

A library groups files. Agent release `resources` take file or folder items, not a library UUID, so an agent reaches a library through its files or the folder they land in. There are two kinds:

- **`native`** — workspace-managed collections of uploaded files (not creatable from the CLI: `library create` is connector-only).
- **`connector`** — synced from an external source (e.g. a help center or knowledge base) through an unstructured-data extractor (`--extractor-slug`). Get the `connectorUuid` from [`cargo-connection`](../cargo-connection/SKILL.md).

```bash
# List libraries (filter by kind or connector)
cargo-ai content library list
cargo-ai content library list --kind native
cargo-ai content library list --kind connector --connector-uuid <connector-uuid>

# Get a single library
cargo-ai content library get <library-uuid>

# Create a connector-backed library
cargo-ai content library create \
  --name "Help Center" \
  --connector-uuid <connector-uuid> \
  --extractor-slug <extractor-slug> \
  --folder-uuid <folder-uuid> \
  --config '{}'

# Update / remove
cargo-ai content library update --uuid <library-uuid> --name "Updated Name"
cargo-ai content library remove <library-uuid>
```

## Critical rules

- **A signed URL is unauthenticated.** Anyone holding it opens the file until it expires (default 3600 s, max 10800 s). A `public` file adds a stable no-auth link, `https://api.getcargo.io/files/public/<uuid>/<name>`, that works until the file is made private or deleted. Hand out either only when the user asked for the file to be shared, and never for record-level personal data.
- **`upload` and `put` default differently.** `upload` indexes (`vectorStore`, sent to OpenAI) and mirrors into the context repo; `put` does neither. A `put` file is not searchable by an agent — `capability_file_search` skips it and `capability_file_analyze` refuses it — until written with `--index vectorStore`.
- **A mirrored file is in git.** `mirrorToContext: true` commits the file to the context repository under `.files/`; pass `--index none` and keep mirroring off (`put`) for files that should stay in Content.
- **A path write overwrites without asking.** The newest file of that name in that folder is replaced in place, and its `uuid` (and every agent resource pointing at it) now serves the new bytes. A read-only (connector) folder refuses with `folderReadOnly`.

## Attaching to an agent

Files and libraries are knowledge **resources** — they do nothing until attached to an agent via that agent's draft release `resources` array, then deployed. That wiring lives in [`cargo-ai`](../cargo-ai/SKILL.md) (`ai release update-draft --resources …` → `ai release deploy-draft`). See `references/examples/files.md` for the upload → attach → deploy sequence.

## Help

Every command supports `--help`:

```bash
cargo-ai content file upload --help
cargo-ai content library create --help
```
