#!/usr/bin/env node
// cargo-statusline.mjs — optional Claude Code statusline with live Cargo context.
//
// Renders:  <model> | ⬢ cargo <workspace> · <credits> credits · CLI <pin-state>
//
// Wire it up in ~/.claude/settings.json (statuslines are user-level config —
// plugins cannot set one):
//
//   { "statusLine": { "type": "command",
//       "command": "node <path-to>/hooks/cargo-statusline.mjs" } }
//
// Design: the render path NEVER runs a network call — it reads a small cache
// file and, when the cache is older than TTL, spawns a detached refresh child
// (`--refresh`) that shells out to `cargo-ai whoami` / `billing subscription
// get` and rewrites the cache for the next render. Every failure degrades to
// showing less, never to blocking or crashing the statusline.

import { readFileSync, writeFileSync, mkdirSync, statSync, rmSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CACHE_PATH = join(homedir(), ".config", "cargo-ai", "statusline-cache.json");
const LOCK_PATH = CACHE_PATH + ".refreshing";
const TTL_MS = 120_000;
// A crashed refresh child leaves the lock behind — treat locks older than
// this as stale (comfortably above the child's summed exec timeouts).
const LOCK_STALE_MS = 60_000;

/**
 * At most one refresh child at a time: statuslines render on every message,
 * and without this guard each render past the TTL spawns another child until
 * the first one finishes writing the cache. Atomic create (flag "wx") closes
 * the race between two simultaneous renders.
 */
function acquireRefreshLock() {
  try {
    if (Date.now() - statSync(LOCK_PATH).mtimeMs < LOCK_STALE_MS) return false;
    rmSync(LOCK_PATH, { force: true }); // stale lock from a crashed child
  } catch {
    // no lock — fall through to create it
  }
  try {
    mkdirSync(dirname(LOCK_PATH), { recursive: true });
    writeFileSync(LOCK_PATH, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    return false; // someone else won the race
  }
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// --refresh: detached child — do the slow work, rewrite the cache, exit.
// ---------------------------------------------------------------------------

function cli(args) {
  const out = execFileSync("cargo-ai", args, { encoding: "utf8", timeout: 15_000 });
  // The CLI prints a leading "Loading..." line before the JSON payload.
  return JSON.parse(out.slice(out.indexOf("{")));
}

function refresh() {
  const cache = { at: Date.now() };
  try {
    cache.workspace = cli(["whoami"]).workspace?.name ?? null;
  } catch {
    cache.workspace = null; // not logged in — render degrades to bare "cargo"
  }
  try {
    const sub = cli(["billing", "subscription", "get"]).subscription;
    const remaining =
      sub.subscriptionAvailableCreditsCount - sub.subscriptionCreditsUsedCount;
    if (Number.isFinite(remaining)) cache.credits = Math.round(remaining);
  } catch {
    // billing needs an admin token — omit credits rather than fail
  }
  try {
    const pin = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "cargo", "cli-version"), "utf8").trim();
    const versionOutput = execFileSync("cargo-ai", ["--version"], { encoding: "utf8", timeout: 5_000 });
    // Exact semver equality — a substring test would let 21.0.29 satisfy pin
    // 1.0.29 and show a pinned state when versions differ.
    const installed = versionOutput.match(/\d+\.\d+\.\d+/)?.[0];
    if (installed) {
      cache.cli = installed === pin ? `v${pin}` : `v${installed}≠pin`;
    }
  } catch {
    // no CLI on PATH — omit
  }
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
  rmSync(LOCK_PATH, { force: true });
}

// ---------------------------------------------------------------------------
// render: fast path — stdin JSON in, one line out, no network ever.
// ---------------------------------------------------------------------------

function render() {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    // no stdin (manual invocation) — render Cargo segment only
  }

  const cache = readJsonSafe(CACHE_PATH);
  if ((!cache || Date.now() - (cache.at ?? 0) > TTL_MS) && acquireRefreshLock()) {
    try {
      spawn(process.execPath, [fileURLToPath(import.meta.url), "--refresh"], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } catch {
      rmSync(LOCK_PATH, { force: true }); // spawn failed — free the lock
    }
  }

  const parts = [];
  const model = input.model?.display_name;
  if (model) parts.push(model);

  const cargo = ["⬢ cargo"];
  if (cache?.workspace) cargo.push(cache.workspace);
  if (Number.isFinite(cache?.credits)) cargo.push(`· ${cache.credits} credits`);
  if (cache?.cli) cargo.push(`· CLI ${cache.cli}`);
  parts.push(cargo.join(" "));

  process.stdout.write(parts.join(" | ") + "\n");
}

if (process.argv.includes("--refresh")) refresh();
else render();
