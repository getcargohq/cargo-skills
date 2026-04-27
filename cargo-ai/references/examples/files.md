# File examples

## List all files

```bash
cargo-ai ai file list
```

## Upload a file

```bash
cargo-ai ai file upload --file-path ./knowledge-base.pdf
```

Supported content types include PDFs, CSVs, plain text, and other common document formats. The response includes the `uuid` and `s3Filename` needed to reference the file.

## Upload and attach to an agent

```bash
# 1. Upload the file
cargo-ai ai file upload --file-path ./product-docs.pdf
# → file.uuid

# 2. Add the file as a resource on the agent's draft release
cargo-ai ai release update-draft --agent-uuid <agent-uuid> \
  --resources '[{"kind":"file","slug":"product_docs","name":"Product Docs","description":null,"prompt":null,"items":[{"kind":"file","fileUuid":"<file-uuid>"}]}]'

# 3. Deploy
cargo-ai ai release deploy-draft --agent-uuid <agent-uuid> \
  --language-model-slug gpt-4o \
  --integration-slug openai
```

## Upload to a folder

```bash
# 1. Find the folder
cargo-ai workspace folder list

# 2. Upload and assign
cargo-ai ai file upload --file-path ./notes.pdf
# → file.uuid

cargo-ai ai file update --uuid <file-uuid> --folder-uuid <folder-uuid>
```

## Rename a file

```bash
cargo-ai ai file update --uuid <file-uuid> --name "Q1 Research Notes"
```

## Remove a file

```bash
cargo-ai ai file remove <file-uuid>
```

## Audit files by size

```bash
cargo-ai ai file list
# → Check the "size" field (in bytes) for each file
# → 1048576 bytes = 1 MB
```
