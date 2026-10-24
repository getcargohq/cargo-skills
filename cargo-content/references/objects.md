# Files as storage — paths, links, and every surface that writes them

A content file is also plain storage: bytes at a **path**, written and read the way an object store does it. The same file row backs every surface below, so a file a worker writes is the file a play reads, an agent lists, and `content file get <uuid>` returns.

## The path model

- A path is the file's **folder chain plus its name** — `reports/2026-q3/summary.pdf` is the file `summary.pdf` in folder `2026-q3` inside folder `reports`. It is not stored: renaming or moving a folder changes every path under it, by construction.
- **Writing to a path creates any missing folders** (file folders, `file_folder` emoji) and **overwrites the newest file of that name** in the leaf folder, in place: same `uuid`, new bytes. Sibling folder names are unique, file names are not, so a path names at most one folder and the newest file.
- An overwrite **keeps the existing file's settings** (`indexMode`, `visibility`, `mirrorToContext`) unless the write passes new ones. A new file gets the write surface's defaults (table below).
- A **read-only folder** anywhere on the chain (a connector library's) refuses the write with `folderReadOnly`, and so does creating a folder under it. A connector's own files are never overwritten by a path write.
- `..` and invalid segments → `invalidPath`.

## Storage settings

| Setting | Values | What it controls |
|---|---|---|
| `indexMode` | `none` · `vectorStore` | `none` stores the bytes in S3 only — nothing is sent to OpenAI, `openAiFileId` is `null` and `isIndexedInOpenAiVectorStore` stays `false` forever. `vectorStore` uploads to OpenAI and, for searchable types, to the workspace vector store. |
| `visibility` | `private` · `public` | `public` adds a stable unauthenticated link (below). |
| `mirrorToContext` | `true` · `false` | Also commit the file under `.files/<path>` in the context repo (below). |

**Defaults differ by surface — this is the trap:**

| Surface | `indexMode` | `mirrorToContext` | `visibility` |
|---|---|---|---|
| `content file upload`, web-app upload, `defineFile` | `vectorStore` | `true` | `private` |
| `content file put`, `PUT /v1/content/objects/*`, `POST /v1/content/files/import`, `createCargoObjects().put` | `none` | `false` | `private` |
| `writeFile` workflow node | `none` (settable) | not settable: `false` for a new file | `private` (settable) |
| Agent `capability_file_write` | **always** `none` | **always** `false` | **always** `private` |

So a file you `put` is **not searchable by agents** until you pass `--index vectorStore`; a file you `upload` is indexed and mirrored unless you pass `--index none`.

## What `indexMode: none` means for an agent

The agent can list and read the file but not search or analyze it:

- `capability_file_list` marks each file with `isSearchable`; an unindexed one carries a hint not to search it.
- `capability_file_search` refuses files with `isSearchable: false` ("None of these files are indexed for search …").
- `capability_file_analyze` refuses any file with no `openAiFileId` ("stored without indexing and cannot be analyzed").
- `capability_file_read` works on every file (pages of 20,000 characters by default, up to 100,000).

Attach a `put`-written file to an agent for retrieval only after re-writing it with `--index vectorStore` (or re-uploading it).

## Links

- **Signed URL** — `content file url <path>`, `POST /v1/content/files/<uuid>/url`, the `getFileUrl` node, `objects.url()`. **Anyone holding it can open the file, no auth**, until it expires: default 3600 s, maximum 10800 s (3 h). `--download` / `download: true` sets `Content-Disposition: attachment`. Returns `{ url, expiresAt, publicUrl? }`.
- **Public link** — a `public` file also answers at `https://api.getcargo.io/files/public/<uuid>/<name>` (the trailing name is cosmetic). It is stable and unauthenticated; each hit redirects to a fresh 5-minute signed URL with `Cache-Control: no-store`. Making the file `private`, deleting it, or it being temporary makes the link 404 **at once**. `publicUrl` appears in `url` results only while the file is public.

Treat both as publishing the file. Never hand out a signed URL or make a file public unless the user asked for the file to be shareable, and never for a file holding record-level personal data.

## The context mirror

A file with `mirrorToContext: true` is **committed and pushed** into the workspace's context repository at `.files/<path>` (commit `content(mirror): upsert <name>`; renames, moves and deletes are mirrored as `content(mirror): move …` / `remove …`). A file over 10 MB is mirrored as a JSON metadata sidecar instead of its bytes. Everyone with access to the context repo can therefore read a mirrored file — keep `mirrorToContext: false` for anything that should stay in Content only. `.files/` is read-only from the context runtime (`deniedPath`); change those files here.

## Surfaces

### CLI (paths)

```bash
cargo-ai content file put reports/2026-q3/summary.pdf --file ./summary.pdf \
  [--content-type application/pdf] [--index none|vectorStore] \
  [--visibility private|public] [--mirror-to-context]       # → { file, path }
cargo-ai content file ls reports/ [--limit 100] [--cursor <nextCursor>]   # → { objects: [{ file, path }], nextCursor }; limit ≤ 1000, ordered by path
cargo-ai content file download reports/2026-q3/summary.pdf --out ./copy.pdf  # stdout without --out
cargo-ai content file url reports/2026-q3/summary.pdf --expires 3600 --download
cargo-ai content file visibility reports/2026-q3/summary.pdf public       # or private: revokes the public link at once
cargo-ai content file rm reports/2026-q3/summary.pdf
```

`put` takes any size (multipart upload to the workspace area, then `files/import`). `--content-type` defaults from the extension. `--mirror-to-context` can only turn mirroring on; leaving it off keeps an existing file's setting. `ls` matches a string prefix, as in S3: `reports/` lists the folder and everything under it; omit it to list every file.

`upload` takes `--index` (default `vectorStore`) and `--visibility` (default `private`) but has no mirror flag — uploads always mirror.

### HTTP (objects)

| Route | Does |
|---|---|
| `PUT /v1/content/objects/<path>` | Write. Body is the raw bytes sent as `application/octet-stream`, **≤ 100 MB**; query `contentType`, `indexMode`, `visibility`, `mirrorToContext=true\|false`. `201 { file, path }`; failure `reason`: `invalidPath`, `folderNotFound`, `folderReadOnly`, `workspaceNotFound`, `noBody`. |
| `GET /v1/content/objects/<path>` | The bytes; `?meta=true` returns `{ file, path }` instead. |
| `DELETE /v1/content/objects/<path>` | Remove. |
| `GET /v1/content/objects?prefix=&cursor=&limit=` | List, `limit` 1–1000 (default 100); `invalidCursor` on a stale cursor. |
| `POST /v1/content/files/import` | Adopt bytes a workspace multipart upload already put in S3: `{ s3Filename, path, contentType, indexMode?, mirrorToContext?, visibility? }`. The route for anything over 100 MB. `invalidS3Filename` when the key is not this workspace's. |
| `POST /v1/content/files/<uuid>/url` | Signed URL: `{ expiresInSeconds? (1–10800), download? }`. |

Each path segment is URL-encoded. Object routes use the workspace-wide file read/write permissions. An object is a content file, so `/v1/content/files/<uuid>` reaches the same row.

### Hosted worker — `createCargoObjects`

```ts
import { createCargoObjects } from "@cargo-ai/worker-sdk";

const objects = createCargoObjects(env);               // reads env.CARGO_API_TOKEN
await objects.put("decks/acme.pdf", pdfBytes, { contentType: "application/pdf" });
const { url, publicUrl } = await objects.url("decks/acme.pdf", { expiresInSeconds: 3600 });
```

`put(path, body, { contentType?, indexMode?, visibility?, mirrorToContext? })` (≤ 100 MB; a string body defaults to `text/plain; charset=utf-8`), `get(path)` → `Blob`, `stat(path)` → `{ file, path }`, `list({ prefix, cursor, limit })`, `remove(path)`, `url(path, { expiresInSeconds?, download? })`, `setVisibility(path, visibility)`. The worker needs a `CARGO_API_TOKEN` secret — see [`../../cargo-hosting/SKILL.md`](../../cargo-hosting/SKILL.md).

### Workflow nodes — `writeFile`, `readFile`, `getFileUrl`

Native storage actions (node `config` fields; full table in [`../../cargo-orchestration/references/nodes.md`](../../cargo-orchestration/references/nodes.md)):

| Action | Config | Output |
|---|---|---|
| `writeFile` | `path`, `content`, `encoding?` (`text` default · `base64`), `contentType?` (`text/plain; charset=utf-8` / `application/octet-stream`), `visibility?`, `indexMode?` | `{ fileUuid, path, size, url, publicUrl? }` — `url` is a 1-hour signed link |
| `readFile` | `path`, `encoding?` (`text` · `base64`) | `{ fileUuid, path, contentType, size, content }` |
| `getFileUrl` | `path`, `expiresInSeconds?` (≤ 10800, default 3600), `download?` | `{ fileUuid, path, url, expiresAt, publicUrl? }` |

`writeFile` and `readFile` cap at **10 MB**; a bigger read fails with a pointer to `getFileUrl`. A **preview (dry) run of `writeFile` writes nothing** and returns a zero uuid. All three fail without retry (`File not found at <path>`, `File not written: <reason>`).

### Agents — `capability_file_write`

A file resource on an agent release with `isReadOnly: false` grants `capability_file_write` on the **folders** that resource lists (files listed in it stay read-only). The agent writes text it produced (≤ 1,000,000 characters) to a relative path inside one of those folders — never elsewhere in the workspace — and gets back `{ fileUuid, path, size, url }` with a 1-hour link. Every agent write is stored `private`, `indexMode: none`, `mirrorToContext: false`, even when it overwrites a public or indexed file. Wiring: [`../../cargo-ai/SKILL.md`](../../cargo-ai/SKILL.md) (CLI) or `defineAgent({ files })` in [`../../cargo-project/references/resources.md`](../../cargo-project/references/resources.md).

### Projects — `defineFile`

`defineFile` takes `index?` (default `vectorStore`), `visibility?` (default `private`) and `mirrorToContext?` (default `true`). Changing `index` or `mirrorToContext` re-uploads in place (same uuid); changing `visibility` updates in place. See [`../../cargo-project/references/resources.md`](../../cargo-project/references/resources.md).
