# Content response shapes

Full JSON response structures for the `content` domain. All commands output JSON to stdout; failures exit non-zero with `{"errorMessage": "..."}`.

## cargo-ai content file list

```json
{
  "files": [
    {
      "uuid": "file-uuid",
      "workspaceUuid": "...",
      "name": "knowledge-base.pdf",
      "s3Filename": "...",
      "openAiFileId": "...",
      "contentType": "application/pdf",
      "size": 1048576,
      "isTemporary": false,
      "folderUuid": null,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z"
    }
  ]
}
```

**Key fields:** `uuid` (used to reference in agent release `resources` — see [`cargo-ai`](../../cargo-ai/SKILL.md)), `name`, `contentType`, `size` (in bytes), `folderUuid` (null unless filed into a folder).

## cargo-ai content library list

> The exact JSON envelope isn't pinned here (capture it from a live `cargo-ai content library list` when you need field-level certainty). Each library carries at least: `uuid` (referenced in agent release `resources`), `name`, `kind` (`native` or `connector`), and — for `connector`-backed libraries — the `connectorUuid` and the extractor it syncs through. Filter the list with `--kind native|connector` and `--connector-uuid <uuid>`.
