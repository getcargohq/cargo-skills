# Security policy

## What this repository ships

`cargo-skills` is a bundle of agent skills: markdown instructions, plus a small
number of runnable files — the approval and session hooks under `hooks/`, the QA
helper scripts under `cargo-gtm/scripts/`, and the CI scripts under
`.github/scripts/`. It contains no server, no service, and no credentials. It
talks to Cargo only by telling an agent to invoke the separately-installed
[`@cargo-ai/cli`](https://www.npmjs.com/package/@cargo-ai/cli).

That shape sets the boundary for what belongs here:

- **In scope** — anything in this repository that could make an agent take an
  action its user did not authorize: an approval-hook bypass in `hooks/`, a
  command-injection or path-traversal bug in a runnable script, a skill
  instruction that leaks credentials or workspace data, a supply-chain weakness
  in the CI workflows, or a tampered/typosquatted release of this bundle.
- **Out of scope** — vulnerabilities in the `cargo-ai` CLI itself, in the Cargo
  platform or its API, or in the third-party data providers the skills call.
  Report those to Cargo directly rather than here; a report filed here about the
  platform will be forwarded, which only slows it down.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open the
[Security tab](https://github.com/getcargohq/cargo-skills/security/advisories/new)
of this repository and file a draft advisory. That channel is private to the
maintainers until an advisory is published.

**Please do not open a public issue or pull request for a security report** —
this repository is installed directly by agents, so a public report is a
disclosed exploit for every install at once.

A useful report includes the affected file and version (see
[`CHANGELOG.md`](CHANGELOG.md) and the `version` field in `cargo/SKILL.md`), what
an attacker can cause an agent to do, and the smallest reproduction you have.

You can expect an acknowledgement within three business days and an assessment
with a fix or mitigation plan within ten.

## Supported versions

Only the latest published version of the bundle is supported. Fixes ship as a
new version rather than as patches to older ones — agents install from the
default branch or from the latest release, so "upgrade" is always the remedy.

## Hardening this repository already applies

- Every `uses:` in `.github/workflows/` is pinned to a full commit SHA, and
  Dependabot moves those pins (`.github/dependabot.yml`).
- CI jobs default to a read-only `GITHUB_TOKEN` (`permissions: contents: read`);
  only the release-attach job is granted `contents: write`.
- The plugin bundle is scanned on every push and pull request by
  `.github/workflows/plugin-scanner.yml`.
- The approval hook (`hooks/approve-cli.sh`) auto-approves only a plain
  `cargo-ai` invocation, and never one that chains, redirects, or substitutes
  another program. Login/logout, token minting, report egress, and
  `cdk deploy`/`destroy` are gated back to the normal approval prompt, as is any
  invocation carrying a destructive verb.
