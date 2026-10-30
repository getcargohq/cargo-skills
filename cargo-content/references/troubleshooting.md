# Content troubleshooting

Common errors in the `content` domain and how to fix them.

## `unknown command 'file'` / `unknown command 'library'`

File and library commands moved from the `ai` domain to the new top-level **`content`** domain in CLI ≥ 1.0.19. Use `cargo-ai content file …` / `cargo-ai content library …` — the old `cargo-ai ai file …` path no longer exists. If you still hit this on the new path, bump the CLI: `npm install -g @cargo-ai/cli@latest`.

## `fileNotFound`

The file UUID does not exist or has been deleted. Run `cargo-ai content file list` to get the current list.

## `folderNotFound`

The folder UUID passed to `--folder-uuid` does not exist. Folders are managed by the [`cargo-workspace-management`](../../cargo-workspace-management/SKILL.md) skill — run `cargo-ai workspaceManagement folder list` to find valid folder UUIDs, or `cargo-ai workspaceManagement folder create --kind file ...` to create one.

## `folderReadOnly` / `invalidPath` on `put`

A folder on the path belongs to a connector library and is read-only — write somewhere else. `invalidPath` means an empty segment, `..`, or a name the path policy rejects; use a relative `/`-separated path like `reports/summary.md`.

## The agent can read a file but not search or analyze it

The file was stored with `indexMode: "none"` — the default for `content file put`, the objects API, workers, the `writeFile` node and every agent write. `capability_file_search` skips it and `capability_file_analyze` refuses it; `isIndexedInOpenAiVectorStore` will never turn true. Re-write it with `content file put <path> --file … --index vectorStore`, or upload it with `content file upload`.

## A file showed up in the context repo under `.files/`

It was stored with `mirrorToContext: true`, the default for `upload`, web-app uploads and `defineFile`. Mirrored files are committed and pushed to the context repository. To keep a file out of the repo, write it with `put` (mirroring off) or set `mirrorToContext: false` on its `defineFile`.

## Upload fails or times out

Large files may take longer to upload. Ensure the file path is correct and the file is not locked by another process. Since CLI 1.0.139 a failed upload prints the server's status and `errorMessage` instead of a bare `Upload failed`; read that first.

- **`502` with `indexingFailed`.** The file reached storage but OpenAI failed while indexing it (an outage, a timeout, vector store creation). The message says to retry, or to upload with `--index none`.
- **A video, archive or other type OpenAI won't index no longer fails.** Under the default `--index vectorStore`, a type outside OpenAI's file list (an MP4, a MOV) is stored with no OpenAI copy (`openAiFileId: null`), the same as `--index none`. The upload succeeds, but the file is not searchable by an agent; `capability_file_analyze` reads it with the file read tool instead. Spreadsheets and images (csv, xlsx, gif, jpeg, png) keep their OpenAI copy. Before cargo#6458 such uploads ended in a `500`.
- **Content type.** `content file upload` and `workspaceManagement file upload` send a type guessed from the file extension (CLI 1.0.140). Older CLIs sent none, and the server now infers it from the file name.

## `413 tooLarge` reading a file's raw bytes

`GET /v1/content/files/<uuid>/raw` refuses files too large to serve inline. Download it with `cargo-ai content file download <path> --out <local>`, or get a signed link with `cargo-ai content file url <path>` (`POST /v1/content/files/<uuid>/url`). The error message names both.

## Library created but the agent doesn't use it

A file or library is inert until it's attached to an agent's **deployed** release. Add it to the draft release `resources` array and deploy — see [`cargo-ai`](../../cargo-ai/SKILL.md) and `examples/files.md`.
