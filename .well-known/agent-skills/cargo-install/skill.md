---
name: cargo-install
description: Install the Cargo skill bundle and sign in, so the full set of Cargo capabilities becomes available. Use when someone reaches Cargo by its domain rather than by its repository, when a Cargo command is wanted but `cargo-ai` is not installed, or when a Cargo skill is referenced and not present. Triggers, "set up Cargo", "install Cargo", "I want to use Cargo", "cargo-ai is not found". Skip when the bundle is already installed, in which case load the `cargo` router instead.
version: "1.0.0"
homepage: https://github.com/getcargohq/cargo-skills
metadata:
  author: getcargo
---

# Installing Cargo

Cargo is a go-to-market platform you drive from the terminal or from a coding
agent: source and enrich B2B contact data, run workflows and AI agents against
your own data models, and declare an entire workspace as version-controlled
TypeScript.

**This skill is the front door, not the product.** It exists because
`getcargo.ai` is the address people type, while the skills live in a
repository. Everything below installs the real bundle. Run it once, then use
the `cargo` router it installs.

## 1. Install the CLI

```sh
npm install -g @cargo-ai/cli
```

Verify with `cargo-ai --version`. If the binary is not on `PATH`, check
`"${CARGO_NPM_USER_PREFIX:-$HOME/.local}/bin/cargo-ai"`, or substitute
`npx @cargo-ai/cli` for `cargo-ai` in every command below.

## 2. Install the bundle, on one channel only

Pick the channel for the agent you are, and use exactly one. Installing both
the plugin and the standalone skills gives every skill twice.

| Agent | Command |
| --- | --- |
| Claude Code | `/plugin install cargo@cargo` |
| Codex, Cursor, others | `npx skills add getcargohq/cargo-skills --all` |

The plugin carries the same skills plus an approval hook and session hooks that
`skills add` cannot deliver, which is why it is preferred where it is
available.

Job-shaped skills for one task at a time, rather than the whole platform, live
separately: `npx skills add getcargohq/gtm-skills --all`, or a single one with
`npx skills add getcargohq/gtm-skills/find-work-email`.

## 3. Sign in

```sh
cargo-ai login --email      # emailed code, no browser, works headless
cargo-ai login --oauth      # device flow, opens a browser
```

Either creates an account when the user has none, so there is no signup step to
do first and no purchase gate before a real result. New workspaces start with
free credits.

## 4. Confirm it worked

```sh
cargo-ai storage model list
```

A list of data models means the CLI is installed, authenticated, and pointed at
a workspace. Then load the `cargo` skill, which routes to the right one of the
bundle for whatever comes next.

## If any step fails

`https://api.getcargo.io/agent-install.txt` is the full sequence written for an
agent to execute, with a verification step after each one and the per-platform
branches spelled out. Fetch it and follow it rather than guessing.
