# Content response shapes

Full JSON response structures for the `content` domain. All commands output JSON to stdout; failures exit non-zero with `{"errorMessage": "..."}`.

## cargo-ai content file list

```json
{
  "files": [
    {
      "uuid": "file-uuid",
      "workspaceUuid": "...",
      "libraryUuid": "library-uuid",
      "userUuid": null,
      "name": "knowledge-base.pdf",
      "isTemporary": false,
      "folderUuid": null,
      "s3Filename": "...",
      "openAiFileId": "...",
      "contentType": "application/pdf",
      "size": 1048576,
      "isIndexedInOpenAiVectorStore": true,
      "externalId": null,
      "visibility": "private",
      "indexMode": "vectorStore",
      "mirrorToContext": true,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z",
      "deletedAt": null,
      "kind": "native"
    }
  ]
}
```

Each file is a discriminated union on `kind`: `"native"` (as above) or `"connector"`, which adds a `connectorUuid: string`.

**Key fields:** `uuid` (used to reference in agent release `resources` — see [`cargo-ai`](../../cargo-ai/SKILL.md)), `libraryUuid` (the library the file belongs to), `name`, `contentType`, `size` (in bytes), `folderUuid` (null unless filed into a folder), `isIndexedInOpenAiVectorStore` (whether it's retrievable for RAG yet — for an `indexMode: "none"` file it stays `false` forever, it is not pending), `openAiFileId` (`string | null`; `null` when the bytes were never sent to OpenAI), `indexMode` (`none` | `vectorStore`), `visibility` (`private` | `public`), `mirrorToContext` (whether the file is committed under `.files/` in the context repo), `kind` (`native` or `connector`; the latter carries `connectorUuid`).

## cargo-ai content file upload

The CLI prints the uploaded file's fields flat (no `file` wrapper); upload progress goes to stderr.

```json
{
  "uuid": "file-uuid",
  "s3Filename": "...",
  "contentType": "application/pdf",
  "name": "knowledge-base.pdf"
}
```

## Path commands (`put`, `ls`, `url`, `visibility`)

`content file put` and `ls` wrap the file in an object with its path; `visibility` prints the updated file.

```json
// content file put reports/2026-q3/summary.pdf --file ./summary.pdf
{ "file": { "uuid": "file-uuid", "name": "summary.pdf", "indexMode": "none", "mirrorToContext": false, "visibility": "private", "...": "…" },
  "path": "reports/2026-q3/summary.pdf" }

// content file ls reports/
{ "objects": [ { "file": { "...": "…" }, "path": "reports/2026-q3/summary.pdf" } ],
  "nextCursor": "…" }

// content file url reports/2026-q3/summary.pdf
{ "url": "https://…signed…", "expiresAt": "2026-10-23T13:00:00.000Z",
  "publicUrl": "https://api.getcargo.io/files/public/<uuid>/summary.pdf" }   // publicUrl only while the file is public
```

`put` failures carry a `reason`: `invalidPath`, `folderNotFound`, `folderReadOnly`, `invalidS3Filename`, `workspaceNotFound`. `url` on a missing file → `fileNotFound`. `download` writes the raw bytes (stdout, or `--out`), not JSON.

## cargo-ai content library list

```json
{
  "libraries": [
    {
      "uuid": "library-uuid",
      "workspaceUuid": "...",
      "name": "Help Center",
      "extractorSlug": "...",
      "config": {},
      "folderUuid": null,
      "lastSyncedAt": "2025-01-15T00:00:00Z",
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z",
      "deletedAt": null,
      "kind": "connector",
      "connectorUuid": "connector-uuid"
    }
  ]
}
```

`kind` is `native` or `connector`; only `connector` carries `connectorUuid`. `library get` returns one under `library`. Agent release `resources` take file or folder items (`{"kind":"file","fileUuid"}` / `{"kind":"folder","folderUuid"}`), not a library UUID: attach a library's files (each file's `libraryUuid` names its library) or the folder they land in. Filter the list with `--kind native|connector` and `--connector-uuid <uuid>`.
