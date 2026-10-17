# Response shapes

JSON response structures returned by Cargo CLI commands used in the `cargo-context` skill.

> Shapes below are taken from the `/v1/context` HTTP route schemas. Each command prints the success object on stdout; a failure exits non-zero and prints the error on stderr.

## Error shape (every command)

Failed commands exit non-zero (3 not authenticated, 4 permission denied, 5 not found, 1 otherwise) and, when stderr is not a TTY, print:

```json
{
  "error": "Not found: ...",
  "status": 404,
  "body": { "reason": "fileNotFound" }
}
```

`body.reason` is the machine-readable cause; some reasons also carry `body.errorMessage`. `cargo-ai context runtime edit` fails with `stringNotFound` or `stringNotUnique` (HTTP 409) when `--old-string` matches zero or multiple times in the target file. See `references/troubleshooting.md`.

## cargo-ai context runtime browse

Lists one directory level at the sandbox root (or under `--path`). Combine with `cargo-ai context runtime read --path <file>` to inspect any entry.

```bash
cargo-ai context runtime browse
cargo-ai context runtime browse --path persona
```

```json
{
  "path": "persona",
  "entries": [
    { "name": "vp-sales-mid-market.md", "path": "persona/vp-sales-mid-market.md", "kind": "file" }
  ]
}
```

`kind` is `file` or `folder`. Failure reasons: `repositoryNotFound`, `branchNotFound`, `pathNotFound`, `unknown` (with `errorMessage`).

## cargo-ai context runtime read

Returns the file content at `--path`, optionally restricted to `--start-line`/`--end-line` (1-indexed, inclusive). Use this to read frontmatter + body before editing.

```bash
cargo-ai context runtime read --path persona/vp-sales-mid-market.md
cargo-ai context runtime read --path play/inbound-trial-to-paid.md --start-line 1 --end-line 40
```

```json
{ "path": "play/inbound-trial-to-paid.md", "content": "---\ntitle: ...", "startLine": 1, "endLine": 40, "totalLines": 112 }
```

The range is clamped to the file: `endLine` past the end returns up to `totalLines`, and a `startLine` past the end returns empty `content` with `endLine` = `startLine - 1`. Failure reasons: `repositoryNotFound`, `fileNotFound`, `tooLarge` (with `sizeBytes`; reads cap at 10 MB), `unknown`.

## cargo-ai context runtime write

Creates (or overwrites) the file at `--path` and pushes a commit to the default branch. The `--commit-message` flag controls the commit subject (default `context(runtime): write <path>`).

```bash
cargo-ai context runtime write \
  --path persona/vp-sales-mid-market.md \
  --content "<file body with frontmatter>" \
  --commit-message "Add VP of Sales mid-market persona"
```

```json
{ "commit": { "sha": "3f2c...", "message": "Add VP of Sales mid-market persona" } }
```

Failure reasons: `repositoryNotFound`, `deniedPath` (writing under `.files/`; update those via Content instead), `failedToWrite` (with `errorMessage`, including a push that did not land), `unknown`. Frontmatter is **not** validated — a file missing `title`/`description` or with malformed frontmatter is written, not rejected.

## cargo-ai context runtime edit

Replaces a single exact substring in the file at `--path` and pushes a commit. `--old-string` must match **exactly once** unless `--replace-all` is passed. Read the file with `runtime read` first and copy the substring verbatim, whitespace included. Pass an empty `--new-string` to delete the match. Returns `{"commit": {"sha", "message"}}` on success, like `write`.

```bash
cargo-ai context runtime edit \
  --path global/positioning.md \
  --old-string "We help RevOps automate workflows." \
  --new-string "We help RevOps run AI-native GTM motions." \
  --commit-message "Refresh positioning one-liner"
```

Failure reasons: `stringNotFound`, `stringNotUnique`, `fileNotFound`, `noOp` (new string equals old), `deniedPath`, `failedToEdit` (with `errorMessage`), `repositoryNotFound`, `unknown`. Frontmatter is not validated, so an edit that strips `title`/`description` still applies.

## cargo-ai context runtime execute

Runs a shell command in the sandbox (90-second timeout) and returns its exit code and output. **Tracked working-tree changes the command leaves (additions, edits, deletions, renames) are auto-committed and pushed to the default branch**; gitignored paths are skipped. `--args` is a JSON array of string arguments; omit for a no-arg command. `--commit-message` overrides the auto-commit subject (default `context(runtime): execute <command>`).

```bash
cargo-ai context runtime execute --command grep --args '["-r","-l","persona/vp-sales-mid-market","."]'
cargo-ai context runtime execute --command ls --args '["-1","persona"]'
cargo-ai context runtime execute --command pwd
```

```json
{ "exitCode": 0, "stdout": "...", "stderr": "", "commit": { "sha": "...", "message": "..." } }
```

`commit` is present only when the command changed tracked files and the push landed. Failure reasons: `repositoryNotFound`, `readOnly`, `failedToExecute` (with `errorMessage`), `unknown`.

## cargo-ai context graph get

Returns the knowledge graph derived from every `.md`, `.mdx`, `.yaml`, and `.yml` file in the context repo (`.git/` and `_template.*` excluded). Shape used throughout `references/examples/graph-queries.md`:

```json
{
  "graph": {
    "nodes": [
      {
        "id": "persona/vp-sales-mid-market.md",
        "title": "VP of Sales, mid-market",
        "summary": "Owns pipeline, quota, and rep productivity at a 200–2,000-person company.",
        "cluster": "persona"
      }
    ],
    "edges": [
      { "source": "persona/vp-sales-mid-market.md", "target": "objection/we-already-have-an-ai-sdr.md", "origin": "wikilink" }
    ],
    "broken": [
      { "source": "persona/vp-sales-mid-market.md", "target": "medium/exec-warm-intro", "origin": "frontmatter" }
    ],
    "computedAt": "2026-10-16T09:00:00.000Z"
  }
}
```

**Key fields:**

- `graph.nodes[].id`: the repo-relative file path **including** its extension.
- `graph.nodes[].title`: frontmatter `title`, falling back to the filename. `summary`: frontmatter `summary`, then `description`, then the first body paragraph (280 chars); absent when none exists. `cluster`: the top-level folder (a root file is its own cluster).
- `graph.edges[]`: resolved links, `origin` one of `frontmatter`, `wikilink`, `mdlink`. Self-links and duplicates are dropped. `target` is a node `id`.
- `graph.broken[]`: links whose target matched no file; `target` is the raw string as written.

Failure reasons: `repositoryNotFound`, `tooManyFiles` (over 5,000 files; with `fileCount`, `limit`), `fileTooLarge` (a file over 1 MB; with `path`, `sizeBytes`, `limit`), `unknown`.

For ready-to-run queries (count per domain, dangling references, plays missing proof, inbound references to a node), see `references/examples/graph-queries.md`.
