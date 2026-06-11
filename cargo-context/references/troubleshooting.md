# Troubleshooting

Common errors and solutions for `cargo-ai context` commands.

## General

**`{"errorMessage": "..."}`**
All failed commands exit non-zero and return an error JSON. Read the `errorMessage` for the specific issue.

**`Unauthorized` / `403`**
Your API token may lack the required permissions, or the workspace's context repository isn't configured. Verify with `cargo-ai whoami`; if a context repo hasn't been set up for the workspace, ask an admin (or do it via the Cargo app under workspace settings).

## Runtime — browse / read

**Path not found**
The path does not exist in the runtime sandbox. Use `cargo-ai context runtime browse --path <parent>` to confirm the file layout before reading. Paths are relative to the repo root, no leading slash (`persona/vp-sales.md`, not `/persona/vp-sales.md`).

**Out-of-range lines**
`--start-line` and `--end-line` are 1-indexed and inclusive on both ends. If they fall outside the file's line count the read fails. Read the file without a range first to confirm length, or omit one end (e.g. only `--start-line`) to read to EOF.

## Runtime — write

**Push fails / commit not appearing**
`write` pushes to the context repo's default branch. Pushes fail if the configured GitHub connector lost permissions or the branch was deleted/renamed. Verify the connector via `cargo-ai connection connector list` and check the default-branch setting in the Cargo app under workspace settings.

**No `_template.md` for the domain**
Some workspaces customize their context repo. If a domain doesn't ship a template, browse the domain (`cargo-ai context runtime browse --path <domain>`) and model the new file after an existing entry.

**`reason: "invalidContent"` (HTTP 422) on write**
`write` validates `.md`/`.mdx` frontmatter **before** committing — nothing is pushed when it fails. The `errorMessage` names the problem and shows the expected block. Causes and fixes:
- **Missing/empty `title` or `description`** — add a frontmatter block with both fields non-empty, then retry.
- **Malformed frontmatter YAML** — e.g. an unquoted value containing `": "`. Quote the value (`description: "Owns pipeline: quota, ramp"`) and retry. (Validation is strict here even though the graph builder itself fails soft on such files.)
Only `.md`/`.mdx` files are checked; YAML data files and mirrored `.files/` are exempt.

**Frontmatter rejected by `context graph get`**
Both `title` and `description` are required on every file (and now enforced at `write`/`edit` time — see above). Empty or missing values cause the graph builder to skip the node and any cross-refs to it will dangle. Always set both before pushing.

## Runtime — edit

**`--old-string` not found**
`--old-string` did not match any substring in the file. Whitespace must match exactly — escape newlines (`\n`) where present, and watch for trailing spaces. Read the file first and copy the substring verbatim.

**`--old-string` matches more than once**
`edit` requires the match to be unique. Add enough surrounding context to make the match unique (extend with the line before or after), or do multiple targeted edits in sequence.

**`reason: "invalidContent"` (HTTP 422) on edit**
`edit` validates the **resulting** file: a change that strips or empties `title`/`description`, or breaks the frontmatter YAML, is rejected and nothing is written. Two common cases:
- **Edit removes the frontmatter** — don't delete or blank `title`/`description`; keep both fields populated in the new content.
- **Editing an older file that has no frontmatter** — the file still loads in the graph, but any edit is blocked until frontmatter exists. Add the `title`/`description` block first (a full-content `write`, or include the block in the edit), then proceed.

**Edits not appearing in GitHub**
`edit` commits and pushes; `execute` does **not** push. If you ran a shell command that modified files (e.g. `sed -i`, redirecting into a file), the change stays in the ephemeral sandbox and is discarded. Use `write` or `edit` for any change that should land in git.

## Runtime — execute

**Command output is empty / unexpected**
The runtime sandbox starts clean for each call; mutations from prior `execute` calls are not preserved between invocations. Don't rely on state across `execute` runs — chain operations in a single `--command` (e.g. via `sh -c`) instead.

**Side effects not pushed**
By design, `execute` does not commit. Use `execute` for inspection (`grep`, `ls`, `find`, counting, validation); use `write`/`edit` for any persistent change.

**Argument escaping**
`--args` is a **JSON array** of strings, not a shell-quoted list. Wrap the whole thing in single quotes so the shell doesn't mangle the JSON:

```bash
# Correct
cargo-ai context runtime execute --command grep --args '["-r","vp-sales","."]'

# Wrong — shell will eat the inner double quotes
cargo-ai context runtime execute --command grep --args ["-r","vp-sales","."]
```

## Graph

**Stale results after writes**
`graph get` is cached. After a series of writes, expect a short delay before the graph reflects them. Re-run after a few seconds, or restructure logic so it does not depend on immediately-fresh graph data.

**Broken cross-references**
If a file references `domain/slug` and that target doesn't exist, the link won't resolve in the graph. Use `cargo-ai context runtime browse --path <domain>` to verify the target exists before writing the reference, or pipe `graph get` through `jq` to enumerate dangling refs (see `references/examples/graph-queries.md`).

## When to escalate

If the CLI errors and `--help` plus the notes above don't get you unstuck — **file a workspace management report** rather than retrying silently. See [`cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md) (Reports section).

```bash
cargo-ai workspaceManagement report create \
  --title "context <subcommand> fails with <errorMessage>" \
  --description "Ran: cargo-ai context ...   Got: {...errorMessage...}   Expected: ..."
```
