# File & library examples

> **CLI ≥ 1.0.19:** files and libraries live in the top-level **`content`** domain (`cargo-ai content file …`, `cargo-ai content library …`). The old `cargo-ai ai file …` commands no longer exist.

## Files

### List all files

```bash
cargo-ai content file list
```

### Upload a file

```bash
cargo-ai content file upload --file ./knowledge-base.pdf
```

Supported content types include PDFs, CSVs, plain text, and other common document formats. The response prints `uuid`, `s3Filename`, `contentType` and `name` at the top level (no `file` wrapper).

### Upload and attach to an agent

```bash
# 1. Upload the file
cargo-ai content file upload --file ./product-docs.pdf
# → .uuid

# 2. Add the file as a resource on the agent's draft release
cargo-ai ai release update-draft --agent-uuid <agent-uuid> \
  --resources '[{"kind":"file","slug":"product_docs","name":"Product Docs","description":null,"prompt":null,"items":[{"kind":"file","fileUuid":"<file-uuid>"}]}]'

# 3. Deploy
cargo-ai ai release deploy-draft --agent-uuid <agent-uuid> \
  --language-model-slug gpt-4o \
  --integration-slug openAi \
  --actions '[]' --mcp-clients '[]' --capabilities '[]' --suggested-actions '[]' \
  --resources '<same resources array as step 2>'
```

### Let an agent write into a folder

A file resource with `"isReadOnly": false` grants the agent `capability_file_write` on the **folders** it lists. The agent saves text it produced (≤ 1,000,000 characters) to a path inside one of them and gets a 1-hour link back; its writes are always private, unindexed and unmirrored. It can write nowhere else.

```bash
cargo-ai ai release update-draft --agent-uuid <agent-uuid> \
  --resources '[{"kind":"file","slug":"outputs","name":"Outputs","description":null,"prompt":"Save each report here as markdown.","isReadOnly":false,"items":[{"kind":"folder","folderUuid":"<folder-uuid>"}]}]'
# then deploy-draft with the same resources array
```

### Store a file and share a link

```bash
cargo-ai content file put decks/acme.pdf --file ./acme.pdf          # stored only: not indexed, not mirrored
cargo-ai content file url decks/acme.pdf --expires 3600 --download   # signed: anyone with it can open it for an hour
cargo-ai content file visibility decks/acme.pdf public               # stable no-auth link; `private` revokes it
```

### Upload to a folder

Folders are managed by the [`cargo-workspace-management`](../../../cargo-workspace-management/SKILL.md) skill — see its `references/examples/folders.md` for create/list/update.

```bash
# 1. Find the folder (kind: "file")
cargo-ai workspaceManagement folder list

# 2a. Upload straight into the folder…
cargo-ai content file upload --file ./notes.pdf --folder-uuid <folder-uuid>

# 2b. …or move an existing file afterwards
cargo-ai content file update --uuid <file-uuid> --folder-uuid <folder-uuid>
```

### Rename a file

```bash
cargo-ai content file update --uuid <file-uuid> --name "Q1 Research Notes"
```

### Remove a file

```bash
cargo-ai content file remove <file-uuid>
```

### Audit files by size

```bash
cargo-ai content file list
# → Check the "size" field (in bytes) for each file
# → 1048576 bytes = 1 MB
```

## Libraries

A library groups files. Agent release resources reference its files or folder, not the library UUID. `native` libraries are workspace-managed (the CLI cannot create one: `library create` is connector-only); `connector`-backed libraries sync documents from an external source through an unstructured-data extractor.

```bash
# List libraries, optionally filtered
cargo-ai content library list
cargo-ai content library list --kind native
cargo-ai content library list --kind connector --connector-uuid <connector-uuid>

# Get one
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
