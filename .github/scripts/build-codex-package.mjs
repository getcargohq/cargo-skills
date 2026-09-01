#!/usr/bin/env node
// build-codex-package.mjs — build the uploadable plugin archive for the
// OpenAI Plugins Directory (ChatGPT + Codex).
//
// Why this exists: every other channel tracks the repo on its own. skills.sh
// and the Gemini gallery crawl it, ClawHub publishes on push to main, and the
// Claude community catalog pins a SHA that CI bumps. The OpenAI directory does
// not — its docs are explicit that "published plugins do not update those
// skills live". It is a submission-time snapshot, and every change needs a new
// version, a fresh review, and a manual publish.
//
// So the archive has to be reproducible rather than hand-assembled, or the one
// listing that cannot self-update becomes the one nobody can rebuild.
//
//   node .github/scripts/build-codex-package.mjs           # -> dist/cargo-skills-codex.zip
//   node .github/scripts/build-codex-package.mjs --out DIR
//
// The archive layout follows OpenAI's documented convention, which differs
// from this repo's on two points:
//
//   - Skills live under `skills/`, not at the package root, so the manifest
//     says `"skills": "./skills/"` rather than the repo's `"./"`.
//   - `skills/` here holds real directories. In the repo they are symlinks
//     (added for the Gemini CLI extension); symlinks do not survive a zip
//     round-trip reliably, so they are resolved on the way in.
//
// Skills-only on purpose: the upload dialog asks for a skills-only plugin, and
// `hooks/codex-hooks.json` invokes `${CLAUDE_PLUGIN_ROOT}` — a Claude Code
// variable — so bundling hooks here would ship an unverified path into review.
//
// Rules the OpenAI validator enforces that no other channel does, normalised
// here so the repo keeps serving the channels that want the fuller form:
//
//   - Skill `description` capped at 1024 characters. Two of ours run longer
//     because they enumerate every integration and provider — genuinely useful
//     for routing elsewhere, too long here. See SHORT_DESCRIPTIONS: deliberate
//     rewrites, not truncations, so no list is cut off mid-name.
//   - No `metadata` in SKILL.md frontmatter. Ours carries OpenClaw install
//     directives, which mean nothing to OpenAI, so the block is dropped from
//     the packaged copy only.
//   - `interface` needs displayName, shortDescription, and two square icons.
//
// The rest of the checks below exist because there is no submission API — the
// portal is the only path, every version is human-reviewed, and a rejection
// costs a whole review cycle. So every documented rule is asserted at build
// time instead. Note LIMITS targets the stricter of the two published tiers.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { writeAllMetadata } from "./skills-metadata.mjs";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Two tiers of validation exist and they disagree. The uploader enforces the
// looser "package" limits; the final directory submission enforces much tighter
// ones on the same fields. Building to the package limits gets you an accepted
// archive that is rejected later, so everything here targets the STRICTER tier.
// https://developers.openai.com/plugins/deploy/submission-errors
const LIMITS = {
  pluginName: 64,
  pluginDescription: 1024,
  authorName: 120,
  displayName: 30, // package allows 80
  shortDescription: 30, // package allows 240
  skillDescription: 1024,
  skillIdentity: 64, // "plugin-name:skill-name"
  archiveEntries: 5000,
  archiveBytes: 100 * 1024 * 1024,
  iconMinPx: 48,
  iconMaxPx: 4096,
  iconBytes: 5 * 1024 * 1024,
  pathSegments: 20,
};

const SKILL_DESCRIPTION_LIMIT = LIMITS.skillDescription;

// Rewrites for skills whose repo description exceeds OpenAI's limit. Every
// trigger phrase is kept — those are what routing actually matches on — and the
// exhaustive integration/provider rosters are cut to a representative sample
// plus a count. Anything over the limit without an entry here fails the build
// rather than getting silently truncated into a rejected upload.
const SHORT_DESCRIPTIONS = {
  "cargo-connection":
    'Connect Cargo to an external system and find out what it can do — authenticate connectors, browse the integration catalog, and resolve the `connectorUuid` and `actionSlug` a workflow node needs. Triggers: "connect my HubSpot", "is Salesforce connected", "what integrations do you support", "can Cargo talk to <tool>", "what actions does <provider> have", "I need the connector UUID", "set up the API key for", "it is asking for credentials again", "why is this connector failing auth", "list my connectors". 138 integrations including HubSpot, Salesforce, Attio, Pipedrive, Outreach, Salesloft, Slack, Snowflake, BigQuery, Postgres, Stripe, and Google/LinkedIn ad audiences. Skip when: choosing between enrichment providers for a GTM job — use cargo-gtm and its provider playbooks.',
  "cargo-gtm":
    "Business-to-business go-to-market work on Cargo \u2014 research accounts and buying committees, enrich and verify B2B contact records from licensed data providers, score and qualify leads, draft outreach for the user's own sequencer, sync to CRM, and monitor buying signals. Runs on audiences with a documented lawful basis, screens every contact step against a workspace-wide suppression list, and requires per-recipient relevance; the skill sends no messages itself. Triggers: \"build me a list of\", \"find 50 <title> at <segment>\", \"who works at\", \"find work emails for these accounts\", \"enrich this CSV\", \"verify these emails\", \"build a TAM\", \"who fits our ICP\", \"score these leads\", \"write a first-touch email\", \"push these to my CRM\", \"who changed jobs\", \"who just raised funding\", \"companies using <tech>\", \"who is hiring <role>\", \"find the buying committee\", \"upload this audience to Google/LinkedIn ads\". Licensed B2B data providers only. Skip when: a run already happened and misbehaved \u2014 use cargo-diagnostics.",
};

// Skills held out of this package. The directory review rejected
// cargo-mailbox-management under "Spam mass abuse": it provisions sending
// mailboxes and runs a 5-to-40/day warm-up ramp, which is the shape of
// cold-email infrastructure whatever the gates around it. Holding it out ships
// a package with no sending surface, which is the honest version of the same
// answer. The alternative — deleting the refusal lists and ramp documentation
// until the keywords stop matching — would ship a *less* guarded skill in order
// to pass a safety review, so the repo copies stay exactly as written for the
// channels that do carry the skill.
const EXCLUDED_SKILLS = ["cargo-mailbox-management"];

// Capabilities dropped from cargo-gtm for this channel. Each is a person-level
// surface that is hard to defend in a directory listing whatever the gates
// around it: de-anonymising site visitors, inferring personality traits (OCEAN
// /DISC) from a profile, looking up a *personal* mailbox and phone, harvesting
// a platform's event attendees, reading a social platform's posts. The rest of
// the skill — company research, work-email enrichment from licensed providers,
// scoring, CRM sync, signal monitoring — is unchanged. This is a real narrowing
// of what the packaged skill can do, not a rewording of what it says it does.
// A whole-file swap, for a skill this channel cannot take as written.
// cargo-quickstart's demo pulls 25 named people; the directory rejected it under
// "Spam mass abuse" for the same reason it rejected the two before it. The
// override runs the same two-minute arc at the same 0.5-credit cost against
// company-level hiring intent instead — the skill's own fallback rung 2, which
// it already describes as "same wow, different angle". Editing this into place
// line by line would be a dozen brittle anchors through a rewritten spine, so it
// ships as a file. The version guard below is what keeps the copy honest.
const PACKAGE_OVERRIDES = {
  "cargo-quickstart/SKILL.md": ".github/package-overrides/cargo-quickstart.SKILL.md",
};

const EXCLUDED_FILES = [
  "cargo-gtm/provider-playbooks/snitcher.md",
  "cargo-gtm/provider-playbooks/forager.md",
  "cargo-gtm/provider-playbooks/x.md",
];

// Asserted against the built archive. `scope` is the path prefix the term must
// be absent from — extractEventAttendees survives in cargo-connection, which
// documents the catalog rather than recommending the action, and which the
// directory already approved.
const REMOVED_TERMS = [
  { term: "snitcher", scope: "skills/" },
  { term: "forager", scope: "skills/" },
  { term: "analyzePersonality", scope: "skills/" },
  // Not just the slug: the playbook pitched the capability in prose that
  // named no action, and a slug-only check waved it through.
  { term: "personality", scope: "skills/" },
  { term: "attendee", scope: "skills/cargo-gtm/provider-playbooks/linkedin.md" },
  { term: "provider-playbooks/x.md", scope: "skills/" },
  { term: "extractEventAttendees", scope: "skills/cargo-gtm/" },
];

// Excluding a skill leaves cross-references to it in the ones that remain: a
// router table row, an ASCII diagram box, a recap section, link targets in
// cargo-gtm and cargo-cdk. Each is removed here, in the packaged copy only.
// Every `find` must match exactly once or the build fails — these are anchored
// to prose that will drift, and a silent no-op would ship a dangling link.
const PACKAGE_EDITS = [
  {
    file: "cargo/SKILL.md",
    find: "cdk, mailbox management, workspace management)",
    replace: "cdk, workspace management)",
  },
  {
    file: "cargo/SKILL.md",
    find: "and sixteen **capability skills**",
    replace: "and fifteen **capability skills**",
  },
  {
    file: "cargo/SKILL.md",
    find: "| [`cargo-mailbox-management`](../cargo-mailbox-management/SKILL.md) ([recap](#cargo-mailbox-management))        | Provision sending mailboxes Cargo owns, run warm-up and the 5\u219240/day send ramp, send with the `sendEmail` action, and read threads, replies, delivery events, and suppressions |\n",
    replace: "",
  },
  {
    file: "cargo/SKILL.md",
    find: "             \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n             \u2502        cargo-mailbox-management       \u2502\n             \u2502  Sending inboxes Cargo owns: warm-up, \u2502\n             \u2502  send ramp, threads, replies, events, \u2502\n             \u2502  suppressions. The send itself is the \u2502\n             \u2502  `sendEmail` orchestration action.    \u2502\n             \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n   (owns the mailbox; orchestration owns the send \u2014 and every\n    send is gated by cargo-gtm's acceptable-use checks)\n\n",
    replace: "",
  },
  {
    file: "cargo/SKILL.md",
    find: "- `cargo-mailbox-management` owns **sending inboxes** (the `mailboxManagement` domain) \u2014 provisioning, warm-up, the send ramp, threads, events, and the workspace suppression list. It deliberately does **not** send: delivery is the `sendEmail` native action under `cargo-orchestration`, which is why a send inherits orchestration's pacing, retry and credit accounting. The mailbox itself is also declarable as code via CDK's `defineMailbox` (with `defineDomain` for the sending domain).\n",
    replace: "",
  },
  {
    file: "cargo/SKILL.md",
    find: "`defineAlert`/`defineDomain`/\n`defineMailbox`) and reconcile",
    replace: "`defineAlert`) and reconcile",
  },
  {
    file: "cargo/SKILL.md",
    find: "### cargo-mailbox-management\n\n**Critical rules:**\n\n- **A mailbox is a *monthly, recurring* credit charge**, not a per-record one \u2014 100\u2013160 credits per mailbox per month (`mailboxManagement pricing get` for live figures), for as long as it exists. `mailbox remove` is the only way to stop it; there is no pause. Quote the fleet size and the **credit estimate** per month, and get an explicit yes, before the first `create`.\n- **This domain does not send.** Delivery is the native action `sendEmail` (`{\"kind\":\"native\",\"actionSlug\":\"sendEmail\"}`, inputs in `--data`), **0.1 credits per send**, run through `cargo-orchestration`. A play that calls it **re-bills** \u2014 and re-contacts \u2014 on every run.\n- **Volume is a ramp, not a setting.** Real sends go 5/day \u2192 40/day linearly over 45 days from `warmupStartedAt`. A mailbox that never ran `start-warmup` is pinned at 5/day forever, `stop-warmup` resets the anchor to day 0, and `dailySendLimit` can only *tighten* the ramp, never loosen it.\n- **Every send is gated by `../cargo-gtm/references/acceptable-use.md` \u00a73** (basis, suppression, relevance). Suppression is workspace-wide, checked before every send, has no removal command, and `List-Unsubscribe` writes to it automatically. Raising the ramp \u2014 or spreading one campaign across extra mailboxes to clear the same volume \u2014 is the \u00a72 evasion refusal.\n- **Nothing here is async** \u2014 no run to poll. The exception that looks like one: `mailbox create` returns `status: \"pending\"`, cleared by `mailbox refresh-status`, not by `run get`.\n- `--type outlook` is accepted by the flag and **always** fails (`transportNotSupported` \u2014 Graph delivery hasn't shipped). `--statuses`/`--kinds`/`--reasons` are comma-separated **with no spaces**. `mailbox list` is the only list with **no `count`**, and `mailbox`/`suppression` lists have **no default limit** (max 1000) where message/thread/event default to 50.\n- **`bounced` has no producer yet** \u2014 nothing parses delivery-status notifications, so bounces write no events and do not auto-suppress. Never report an empty bounce count as a clean list.\n- **There is no CLI surface for sending domains.** `mailbox create --domain-uuid` is required and `domainManagement` has no `cargo-ai` commands \u2014 take the UUID from the web app or CDK's `defineDomain`. Permissions are `mailboxManagement:read` / `:write` (not admin-only).\n\n",
    replace: "",
  },
  {
    file: "cargo-gtm/SKILL.md",
    find: "| **Actually sending the drafted copy from a mailbox Cargo owns** (rather than handing off to the user's own sequencer) | [`../cargo-mailbox-management/SKILL.md`](../cargo-mailbox-management/SKILL.md) + [`references/acceptable-use.md`](references/acceptable-use.md) (\u00a73 checks, blocking) | Provisioning and warm-up, the 5\u219240/day send ramp that caps volume, the `sendEmail` action (0.1 credits/send), the workspace suppression list, and replies/opens/clicks as events. |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/references/acceptable-use.md",
    find: "It is not a bulk-messaging tool. Nothing in *this* skill sends mail: the outreach recipes stop at send-ready variables and hand off to a sequencer, under that sequencer's sending limits and identities. Where that sequencer is Cargo's own \u2014 a mailbox the workspace provisioned through [`../../cargo-mailbox-management/SKILL.md`](../../cargo-mailbox-management/SKILL.md) \u2014 nothing on this page relaxes: the three checks in \u00a73 run before the first send, the mailbox's warm-up ramp is the ceiling, and an unsubscribe writes a workspace-wide suppression that no later send may work around. Cargo owning the inbox changes who presses send, not whether the message should be sent.",
    replace: "It is not a bulk-messaging tool. Nothing in *this* skill sends mail: the outreach recipes stop at send-ready variables and hand off to a sequencer, under that sequencer's sending limits and identities.",
  },
  {
    file: "cargo-gtm/references/acceptable-use.md",
    find: "- Respect the sequencer's and mailbox's own limits \u2014 this skill never proposes raising them, and a request to work around them is an evasion refusal under \u00a72. On a Cargo-owned mailbox that limit is the warm-up ramp (5/day rising to 40/day over 45 days, read with `mailbox get-send-allowance`): it is a ceiling, not a target, and spreading one campaign across extra mailboxes to clear the same volume is the same refusal wearing a fleet \u2014 see [`../../cargo-mailbox-management/references/warmup-and-allowance.md`](../../cargo-mailbox-management/references/warmup-and-allowance.md).",
    replace: "- Respect the sequencer's own sending limits \u2014 this skill never proposes raising them, and a request to work around them is an evasion refusal under \u00a72.",
  },
  {
    file: "cargo-gtm/references/acceptable-use.md",
    find: "- Sending from a Cargo-owned mailbox \u2014 warm-up ramp, suppression list, delivery events: [`../../cargo-mailbox-management/SKILL.md`](../../cargo-mailbox-management/SKILL.md)\n",
    replace: "",
  },
  {
    file: "cargo-gtm/recipes/outreach-activation.md",
    find: "The handoff target is the workspace's sequencer of choice (Outreach, Salesloft, Apollo, HubSpot Sequences, Salesforce Cadences). The recipe stops at \"send-ready variables\" and points at `cargo-ai connection integration get <slug>` for the final push. Cargo's own mailboxes are a fourth option for that final push \u2014 see [`../../cargo-mailbox-management/SKILL.md`](../../cargo-mailbox-management/SKILL.md); the gates in [`../references/acceptable-use.md`](../references/acceptable-use.md) are identical either way, and a Cargo-owned mailbox adds its own volume ceiling (the warm-up ramp) on top of them.",
    replace: "The handoff target is the workspace's sequencer of choice (Outreach, Salesloft, Apollo, HubSpot Sequences, Salesforce Cadences). The recipe stops at \"send-ready variables\" and points at `cargo-ai connection integration get <slug>` for the final push.",
  },
  {
    file: "cargo-cdk/SKILL.md",
    find: "- **`defineMailbox` bills monthly, and `defineDomain` rewrites a DNS zone.** A\n  mailbox is 100\u2013160 credits *per month* for as long as it exists (`cargo-ai\n  mailboxManagement pricing get` for live figures), so a `+ create mailbox:\u2026` line\n  in the plan is a recurring charge the user approves, not a one-off. Its `domain`,\n  `username` and `type` are **create-only** \u2014 changing any of them is destroy +\n  recreate, i.e. a brand-new inbox back at the bottom of a 45-day warm-up ramp. The\n  deploy polls `refreshStatus` for up to 5 minutes waiting for `active`. On\n  `defineDomain`, `dnsRecords` is the **whole zone, not a patch**: declaring it\n  replaces every live record (including the ones the registrar wrote at purchase),\n  and omitting it leaves the zone untouched. Use `adopt: true` for a domain or\n  mailbox bought in the UI. Ramp, suppression and sending:\n  [`../cargo-mailbox-management/SKILL.md`](../cargo-mailbox-management/SKILL.md).\n",
    replace: "",
  },
  {
    file: "cargo-cdk/references/resources.md",
    find: "| `defineMailbox(slug, spec)` | Sending inbox on a domain (**monthly credit charge**) | `domain`, `type` (`google`/`shared`/`private` \u2014 no `outlook`), `username?` (defaults to slug), `firstName`, `lastName`, `signature?`, `folder?`, `adopt?` | `domain`, `folder` | `uuid` |\n",
    replace: "",
  },
  {
    file: "cargo-cdk/references/resources.md",
    find: "| `defineDomain(name, spec)` | Sending domain + its DNS zone | `adopt?`, `dnsRecords?` (**replaces the whole zone**) | \u2014 | `uuid` |\n",
    replace: "",
  },
  {
    file: "cargo-mcp/SKILL.md",
    find: "| Provision mailboxes, warm up, send | **CLI** ([`cargo-mailbox-management`](../cargo-mailbox-management/SKILL.md)) |\n",
    replace: "",
  },
  {
    file: "cargo-mcp/SKILL.md",
    find: "a CDK deploy, warehouse SQL, or a mailbox \u2014 use the CLI skills",
    replace: "a CDK deploy, or warehouse SQL \u2014 use the CLI skills",
  },
  {
    file: "README.md",
    find: "| **Mailboxes**     | Provision sending inboxes Cargo owns on a sending domain, run provider warm-up and the 5\u219240/day send ramp, deliver with the `sendEmail` action (0.1 credits/send), and read back threads, replies, opens, clicks, and the workspace suppression list |\n",
    replace: "",
  },
  {
    file: "README.md",
    find: "and sixteen **capability skills**",
    replace: "and fifteen **capability skills**",
  },
  {
    file: "cargo-gtm/SKILL.md",
    find: "`searchPeople` / `reverseLookup` / `analyzePersonality` (0.05)",
    replace: "`searchPeople` / `reverseLookup` (0.05)",
  },
  {
    file: "cargo-gtm/SKILL.md",
    find: " Have a **LinkedIn event URL**? `linkedin.extractEventAttendees` sources the attendee list directly.",
    replace: "",
  },
  {
    file: "cargo-gtm/SKILL.md",
    find: ", and `analyzePersonality` (0.05) is catalog-unique",
    replace: "",
  },
  {
    file: "cargo-gtm/SKILL.md",
    find: "- [`provider-playbooks/snitcher.md`](provider-playbooks/snitcher.md) \u2014 website-visitor identification; the recurring extractor is the cost trap.\n",
    replace: "",
  },
  {
    file: "cargo-gtm/SKILL.md",
    find: "- [`provider-playbooks/forager.md`](provider-playbooks/forager.md) \u2014 personal-email + phone from a LinkedIn URL.\n",
    replace: "",
  },
  {
    file: "cargo-gtm/SKILL.md",
    find: "- [`provider-playbooks/x.md`](provider-playbooks/x.md) \u2014 public X posts and profiles at 0.02 an action; a signal rung, gated by acceptable use.\n",
    replace: "",
  },
  {
    file: "cargo-gtm/references/credits-cost-table.md",
    find: "| 0 / item | `snitcher` | enrichment | `searchSessions` | Search and retrieve website visitor sessions with filtering options for date ranges, URLs, and referrers |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/references/credits-cost-table.md",
    find: "| 0.05 | `aiArk` | enrichment | `analyzePersonality` | Analyze a LinkedIn profile to get personality insights (OCEAN, DISC) and tailored selling and hiring guidance |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/references/credits-cost-table.md",
    find: "| 2 | `forager` | enrichment | `findPersonalEmail` | Find a person's personal email |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/references/credits-cost-table.md",
    find: "| 2 | `forager` | enrichment | `findWorkEmail` | Find a person's work email |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/references/credits-cost-table.md",
    find: "| 5 | `forager` | enrichment | `findPhone` | Find a person's phone number |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/references/stage-action-map.md",
    find: "| forager | findPhone | 5 |   | Mid-tier. |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/references/stage-action-map.md",
    find: "| snitcher | searchSessions | 0 | Free credits-tier. De-anonymize site visitors. |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/references/alternatives.md",
    find: "| Visitor de-anonymization | (none \u2014 niche) | snitcher.searchSessions (0) | Always for visitor ID \u2014 free credits-tier. |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/references/alternatives.md",
    find: "|   |   | forager.findPhone (5) | Mid-tier. |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/references/acceptable-use.md",
    find: "- Personal-mailbox routing: [`../provider-playbooks/forager.md`](../provider-playbooks/forager.md)\n",
    replace: "",
  },
  {
    file: "cargo-gtm/provider-playbooks/FullEnrich.md",
    find: "(e.g., from `snitcher.searchSessions` or a webform)",
    replace: "(e.g., from a webform)",
  },
  {
    file: "cargo-gtm/provider-playbooks/FullEnrich.md",
    find: "(webforms, `snitcher.searchSessions`)",
    replace: "(webforms)",
  },
  {
    file: "cargo-gtm/provider-playbooks/aiArk.md",
    find: "| `analyzePersonality` | **0.05** | `linkedinUrl` | Personality insights (OCEAN, DISC) + tailored **selling and hiring guidance**. Bills **0** on no match. |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/provider-playbooks/aiArk.md",
    find: "- \u2705 **Personalization signal** \u2014 `analyzePersonality` (0.05) is unique: OCEAN/DISC + selling guidance to feed the WRITE step.\n",
    replace: "",
  },
  {
    file: "cargo-gtm/provider-playbooks/aiArk.md",
    find: "- **Personality analysis at scale \"for color\".** `analyzePersonality` earns its 0.05 on qualified, about-to-be-contacted leads feeding the WRITE step \u2014 not on a raw sourced list.\n",
    replace: "",
  },
  {
    file: "cargo-gtm/provider-playbooks/aiArk.md",
    find: "- `analyzePersonality` \u2014 **WRITE/personalization input**, outside the credits spine's find-and-verify path.\n",
    replace: "",
  },
  {
    file: "cargo-gtm/provider-playbooks/aiArk.md",
    find: "never schedule blanket re-enrichment; `analyzePersonality` belongs in a play's WRITE step on newly qualified rows, not on a timer (see anti-patterns).",
    replace: "never schedule blanket re-enrichment.",
  },
  {
    file: "cargo-gtm/provider-playbooks/linkedin.md",
    find: "| `extractEventAttendees` | 0.05/item | `linkedinEventUrl`, `identityIds` (required) | Attendees of a LinkedIn event \u2192 event-based sourcing. |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/guides/finding-companies-and-contacts.md",
    find: "  \u251c\u2500 \"Find people I know who can intro\":      theSwarm.searchWarmIntrosToCompany / Person (2 cred)\n  \u2514\u2500 Visitor de-anonymization:                snitcher.searchSessions (0 cred) \u2192 cargo.matchProspect\n",
    replace: "  \u2514\u2500 \"Find people I know who can intro\":      theSwarm.searchWarmIntrosToCompany / Person (2 cred)\n",
  },
  {
    file: "cargo-gtm/guides/finding-companies-and-contacts.md",
    find: "| **snitcher** | Anonymous website visitor identification | 0 (free credits-tier) |\n",
    replace: "",
  },
  {
    file: "cargo-gtm/recipes/custom-datapoints.md",
    find: "**Website-visitor identification is not in that group.** `snitcher` de-anonymizes the companies browsing the seller's site, and most of them are cold \u2014 [`../provider-playbooks/snitcher.md`](../provider-playbooks/snitcher.md) calls identified visitors \"the warmest cold segment there is\" and files them in the SIGNAL stage beside job-change and funding. It belongs in a net-new schema. What it *isn't* is a sourceable attribute: you cannot fill it across a 4,100-account TAM, because it only exists for accounts that already visited. So it fails Step 4's gate on a different axis than the fields above \u2014 not \"no source at any price\" but **arrival-driven**, and only if the seller runs Snitcher's tracking script on their own site.\n\n",
    replace: "",
  },
  {
    file: "cargo-gtm/recipes/custom-datapoints.md",
    find: "Treat it accordingly: a `last_seen` / `pages_viewed` column populated by the extractors, scored as a timing signal on the accounts that have it, and neutral (never negative) on the ones that don't \u2014 the same `Unknown`-scores-neutral rule as everywhere else, and the reason it can coexist with a sourced schema instead of skewing it. Watch the cost shape too: `searchSessions` is free, but the `fetchOrganisations` extractor bills **3 credits per identified company on every sync**, which is the most expensive line in this recipe if it is switched on for a high-traffic site without sizing the traffic first.\n\n",
    replace: "",
  },
  {
    file: "cargo-gtm/recipes/ads-audience-activation.md",
    find: "- **Personal email is a different lookup from work email.** The standard find-email chain returns *work* addresses \u2014 including `aiArk.enrichPerson` (0.1 from a LinkedIn URL, and the right pick when a work address is enough, as it is for LinkedIn Matched Audiences). The personal mailbox needs [`forager.findPersonalEmail`](../provider-playbooks/forager.md) (2, LinkedIn URL in), which is the only action in the catalog that offers it. Reach for it only when the destination is Google Customer Match and the probe in step 5 shows work addresses matching poorly \u2014 2 credits/row is a real budget line at audience scale.\n",
    replace: "",
  },
  {
    file: "cargo/references/glossary.md",
    find: "anonymous website visits, ",
    replace: "",
  },
  {
    file: "cargo/references/glossary.md",
    find: ", `snitcher.searchSessions`",
    replace: "",
  },
  {
    file: "cargo/SKILL.md",
    find: "**Already have LinkedIn URLs (or an event URL)?**",
    replace: "**Already have LinkedIn URLs?**",
  },
  {
    file: "cargo/SKILL.md",
    find: "(`enrichProfile`/`enrichCompany` 0.25, `extractEventAttendees`)",
    replace: "(`enrichProfile`/`enrichCompany` 0.25)",
  },
  {
    file: "cargo-gtm/references/credits-cost-table.md",
    find: "| 0.05 / item | `linkedin` | enrichment | `extractEventAttendees` | Extract the attendees of a LinkedIn event. |\n",
    replace: "",
  },
  {
    file: "cargo/SKILL.md",
    find: "Fresh workspace \u2192 real deliverable (25 leads for the user's persona, with a cost receipt) in under two minutes",
    replace: "Fresh workspace \u2192 real deliverable (the accounts matching the user's persona, sized for free and sampled for a quarter of a credit) in under two minutes",
  },
  {
    file: "cargo/SKILL.md",
    find: "one persona question \u2192 25 leads in under two minutes \u2192 cost receipt \u2192 save as a recurring play",
    replace: "one persona question \u2192 a free pool count and 25 matching accounts, in under two minutes \u2192 cost receipt \u2192 save as a recurring play",
  },
  {
    file: "README.md",
    find: "one question (\"who do you sell to?\") \u2192 25 leads matching that persona in under two minutes",
    replace: "one question (\"who do you sell to?\") \u2192 the accounts matching that persona in under two minutes",
  },
  {
    file: "cargo/SKILL.md",
    find: "The [quickstart demo](../cargo-quickstart/SKILL.md) spends about **0.5**.",
    replace: "The [quickstart demo](../cargo-quickstart/SKILL.md) spends about **0.25**.",
  },
  {
    file: "README.md",
    find: "the [two-minute quickstart demo](#onboarding--cargo-quickstart) spends about 0.5 of them",
    replace: "the [two-minute quickstart demo](#onboarding--cargo-quickstart) spends about 0.25 of them",
  },
  {
    file: "cargo-gtm/provider-playbooks/aiArk.md",
    find: "with an unusually cheap enrich-and-email combo, a personality-analysis action nothing else in the catalog has, and per-record search",
    replace: "with an unusually cheap enrich-and-email combo and per-record search",
  },
  {
    file: "cargo-gtm/provider-playbooks/aiArk.md",
    find: "**All nine actions run on cargo's managed connection** \u2014 seven credits-based,",
    replace: "**All eight actions run on cargo's managed connection** \u2014 six credits-based,",
  },
  {
    file: "cargo-gtm/provider-playbooks/aiArk.md",
    find: "need a **mobile phone** cheaply (0.5 vs the 3+ phone tier), want **lookalike-company** discovery (0.01/record), or need **personality/selling guidance** for personalization.",
    replace: "need a **mobile phone** cheaply (0.5 vs the 3+ phone tier), or want **lookalike-company** discovery (0.01/record).",
  },
  {
    file: "cargo-gtm/provider-playbooks/linkedin.md",
    find: "- \u2705 **Engagement-based sourcing** \u2014 commenters/reactors on a competitor-topic post, event attendees: warm pools no search filter can express.",
    replace: "- \u2705 **Engagement-based sourcing** \u2014 commenters/reactors on a competitor-topic post: warm pools no search filter can express.",
  },
  {
    file: "cargo-gtm/provider-playbooks/linkedin.md",
    find: "**Per-item billing on activity pulls.** Comments, reactions, event attendees, profile activity, and viewers bill",
    replace: "**Per-item billing on activity pulls.** Comments, reactions, profile activity, and viewers bill",
  },
  {
    file: "cargo-gtm/provider-playbooks/linkedin.md",
    find: "Company URLs are `/company/...`, jobs `/jobs/view/...`, events `/events/...` \u2014 pass the wrong shape",
    replace: "Company URLs are `/company/...`, jobs `/jobs/view/...` \u2014 pass the wrong shape",
  },
];

// Applies PACKAGE_EDITS to the staged tree. Returns what didn't match.
const applyPackageEdits = () => {
  const errors = [];
  for (const { file, find, replace } of PACKAGE_EDITS) {
    const staged = /^(README|LICENSE)/.test(file) ? file : join("skills", file);
    const path = join(stageDir, staged);
    if (existsSync(path) === false) {
      errors.push(`PACKAGE_EDITS targets ${file}, which is not in the package`);
      continue;
    }
    const before = readFileSync(path, "utf8");
    const hits = before.split(find).length - 1;
    if (hits !== 1) {
      errors.push(
        `PACKAGE_EDITS for ${file} matched ${hits} times, expected 1 — the source text moved: ${find.slice(0, 70).replace(/\n/g, " ")}…`,
      );
      continue;
    }
    writeFileSync(path, before.replace(find, replace), "utf8");
  }
  return errors;
};

// Frontmatter here is a flat map of top-level keys, some with indented blocks.
// Rather than take a YAML dependency for two edits, walk it line by line: a
// top-level key starts at column 0, and everything indented under it belongs to
// that key. Returns the rebuilt document.
const rewriteFrontmatter = (source, { drop = [], replace = {} }) => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (match === null) return null;

  const lines = match[1].split("\n");
  const blocks = [];
  for (const line of lines) {
    const key = /^([A-Za-z_-]+):/.exec(line);
    if (key === null && blocks.length > 0) {
      blocks[blocks.length - 1].lines.push(line);
    } else if (key !== null) {
      blocks.push({ key: key[1], lines: [line] });
    }
  }

  const kept = [];
  for (const block of blocks) {
    if (drop.includes(block.key)) continue;
    if (Object.hasOwn(replace, block.key)) {
      kept.push(`${block.key}: ${JSON.stringify(replace[block.key])}`);
      continue;
    }
    kept.push(...block.lines);
  }

  return `---\n${kept.join("\n")}\n---\n${source.slice(match[0].length)}`;
};

// The value as the validator counts it, with YAML quoting removed.
const frontmatterDescription = (source) => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (match === null) return null;
  const found = /^description:\s*([\s\S]*?)(?=\n[A-Za-z_-]+:|$)/m.exec(match[1]);
  if (found === null) return null;
  const raw = found[1].trim();
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw;
};

// Every .md under a directory, recursively.
const walkMarkdown = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walkMarkdown(join(dir, entry.name))
      : entry.name.endsWith(".md")
        ? [join(dir, entry.name)]
        : [],
  );

const outFlag = process.argv.indexOf("--out");
const outDir = resolve(
  repoRoot,
  outFlag === -1 ? "dist" : process.argv[outFlag + 1],
);

const stageDir = join(outDir, ".codex-package");
const zipPath = join(outDir, "cargo-skills-codex.zip");

const die = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

// The repo's Claude manifest is the single source of truth for the bundle
// version, so the uploaded package can never claim a version the repo doesn't.
const pluginJson = JSON.parse(
  readFileSync(join(repoRoot, ".claude-plugin/plugin.json"), "utf8"),
);
const { version } = pluginJson;
if (typeof version !== "string" || /^\d+\.\d+\.\d+$/.test(version) === false) {
  die(`.claude-plugin/plugin.json has no usable semver version (got ${version})`);
}

// A skill is any top-level directory holding a SKILL.md — the same rule
// skills-lint and skills-metadata use, so the three can never disagree.
const repoSkillDirs = readdirSync(repoRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => existsSync(join(repoRoot, name, "SKILL.md")))
  .sort();

if (repoSkillDirs.length === 0) {
  die("found no skill directories at the repo root");
}

for (const name of EXCLUDED_SKILLS) {
  if (repoSkillDirs.includes(name) === false) {
    die(`EXCLUDED_SKILLS names ${name}, which is not a skill in this repo`);
  }
}

const skillDirs = repoSkillDirs.filter((n) => EXCLUDED_SKILLS.includes(n) === false);

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(join(stageDir, ".codex-plugin"), { recursive: true });
mkdirSync(join(stageDir, "skills"), { recursive: true });

const descriptionErrors = [];

for (const name of skillDirs) {
  // dereference: true turns the repo's `skills/` symlinks into real files.
  cpSync(join(repoRoot, name), join(stageDir, "skills", name), {
    recursive: true,
    dereference: true,
  });

  const skillMdPath = join(stageDir, "skills", name, "SKILL.md");
  const source = readFileSync(skillMdPath, "utf8");
  const replace = {};

  const override = SHORT_DESCRIPTIONS[name];
  const current = frontmatterDescription(source);
  if (current === null) {
    die(`${name}/SKILL.md has no readable description in its frontmatter`);
  }

  if (override !== undefined) {
    if (override.length > SKILL_DESCRIPTION_LIMIT) {
      descriptionErrors.push(
        `SHORT_DESCRIPTIONS["${name}"] is ${override.length} chars, over the ${SKILL_DESCRIPTION_LIMIT} limit`,
      );
    }
    replace.description = override;
  } else if (current.length > SKILL_DESCRIPTION_LIMIT) {
    descriptionErrors.push(
      `${name}: description is ${current.length} chars, over OpenAI's ${SKILL_DESCRIPTION_LIMIT} limit. ` +
        `Add a rewrite to SHORT_DESCRIPTIONS in this script — do not shorten the repo copy, other channels use it.`,
    );
  }

  // OpenAI rejects any `metadata` in SKILL.md; ours is OpenClaw install config.
  const rewritten = rewriteFrontmatter(source, {
    drop: ["metadata"],
    replace,
  });
  if (rewritten === null) {
    die(`${name}/SKILL.md has no frontmatter block`);
  }
  writeFileSync(skillMdPath, rewritten, "utf8");
}

if (descriptionErrors.length > 0) {
  for (const e of descriptionErrors) console.error(`error: ${e}`);
  process.exit(1);
}

for (const file of ["README.md", "LICENSE"]) {
  if (existsSync(join(repoRoot, file))) {
    cpSync(join(repoRoot, file), join(stageDir, file));
  }
}

// The remaining skills and the README still describe a pack of nineteen. The
// count words are load-bearing prose ("and sixteen capability skills"), so
// derive the replacement from what actually shipped rather than hardcoding it.
const NUMBER_WORDS = {
  16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen", 20: "twenty",
};

const frontmatterVersion = (text) => /^version:\s*"?([^"\n]+)"?/m.exec(text)?.[1]?.trim();

for (const [target, source] of Object.entries(PACKAGE_OVERRIDES)) {
  const staged = join(stageDir, "skills", target);
  const override = join(repoRoot, source);
  if (existsSync(staged) === false) {
    die(`PACKAGE_OVERRIDES targets ${target}, which is not in the package`);
  }
  if (existsSync(override) === false) {
    die(`PACKAGE_OVERRIDES points at ${source}, which does not exist`);
  }
  // The override is a hand-maintained copy of a file that will keep moving. Tie
  // it to the repo skill's version so a bump upstream fails the build instead of
  // silently shipping last month's demo.
  const repoVersion = frontmatterVersion(readFileSync(staged, "utf8"));
  const overrideVersion = frontmatterVersion(readFileSync(override, "utf8"));
  if (repoVersion === undefined || overrideVersion === undefined) {
    die(`could not read a version from ${target} or ${source}`);
  }
  if (repoVersion !== overrideVersion) {
    die(
      `${source} is written against version ${overrideVersion}, but ${target} is now ${repoVersion} — ` +
        `review the upstream change, port what matters, and bump the override`,
    );
  }
  cpSync(override, staged);
}

for (const rel of EXCLUDED_FILES) {
  const path = join(stageDir, "skills", rel);
  if (existsSync(path) === false) {
    die(`EXCLUDED_FILES names ${rel}, which is not in the package`);
  }
  rmSync(path);
}

const editErrors = applyPackageEdits();
if (editErrors.length > 0) {
  for (const e of editErrors) console.error(`error: ${e}`);
  process.exit(1);
}

if (skillDirs.length !== repoSkillDirs.length) {
  const from = NUMBER_WORDS[repoSkillDirs.length];
  const to = NUMBER_WORDS[skillDirs.length];
  if (from === undefined || to === undefined) {
    die(`no number word for ${repoSkillDirs.length} or ${skillDirs.length} — extend NUMBER_WORDS`);
  }
  const markdown = [
    ...skillDirs.flatMap((n) => walkMarkdown(join(stageDir, "skills", n))),
    join(stageDir, "README.md"),
  ].filter((f) => existsSync(f));

  for (const file of markdown) {
    const before = readFileSync(file, "utf8");
    const after = before
      .replaceAll(`${repoSkillDirs.length} skills`, `${skillDirs.length} skills`)
      .replaceAll(from, to)
      .replaceAll(from[0].toUpperCase() + from.slice(1), to[0].toUpperCase() + to.slice(1));
    if (after !== before) writeFileSync(file, after, "utf8");
  }
}

// Every staged skill-metadata.json now describes a tree that no longer exists
// — regenerate them over what actually shipped.
writeAllMetadata(join(stageDir, "skills"));

// interface.composerIcon and interface.logo are required and must both point at
// a square image. assets/icon.png is the Cargo product mark at 512x512.
const iconSource = join(repoRoot, "assets/icon.png");
if (existsSync(iconSource) === false) {
  die("assets/icon.png is missing — the manifest requires a square icon");
}
mkdirSync(join(stageDir, "assets"), { recursive: true });
cpSync(iconSource, join(stageDir, "assets/icon.png"));

// `name` is kebab-case and stable — it is the directory identity and cannot be
// changed after first publish. `cargo` alone collides with Rust's package
// manager in a catalog shared with ChatGPT, hence `cargo-skills`.
const manifest = {
  name: "cargo-skills",
  version,
  description:
    `GTM engineering for coding agents — ${skillDirs.length} skills over the Cargo CLI: research accounts, enrich and verify B2B contact records from licensed data providers, score and qualify leads, sync to your CRM, monitor buying signals, and manage a whole workspace as code. Consent and suppression gates apply to every step that touches a person; the pack sends no messages itself.`,
  author: { name: "getcargo" },
  homepage: "https://getcargo.ai",
  repository: "https://github.com/getcargohq/cargo-skills",
  license: "MIT",
  keywords: [
    "gtm",
    "go-to-market",
    "sales",
    "prospecting",
    "lead-enrichment",
    "b2b-data",
    "crm",
    "revops",
    "data-enrichment",
    "outbound",
  ],
  skills: "./skills/",
  interface: {
    displayName: "Cargo Skills",
    // 30 chars in the directory, not the 240 the uploader accepts.
    shortDescription: "GTM engineering for agents",
    composerIcon: "./assets/icon.png",
    logo: "./assets/icon.png",
    capabilities: ["Read", "Write"],
  },
};

const manifestErrors = [];
const check = (ok, message) => {
  if (ok === false) manifestErrors.push(message);
};

check(
  /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(manifest.name) &&
    manifest.name.length <= LIMITS.pluginName,
  `name "${manifest.name}" must be ASCII alphanumeric/_/- , start alphanumeric, and be <= ${LIMITS.pluginName} chars`,
);
check(
  /^\d+\.\d+\.\d+$/.test(manifest.version),
  `version "${manifest.version}" must be semver`,
);
check(
  manifest.description.length > 0 &&
    manifest.description.length <= LIMITS.pluginDescription,
  `description is ${manifest.description.length} chars, limit ${LIMITS.pluginDescription}`,
);
check(
  manifest.author.name.length <= LIMITS.authorName,
  `author.name is ${manifest.author.name.length} chars, limit ${LIMITS.authorName}`,
);
for (const [field, limit] of [
  ["displayName", LIMITS.displayName],
  ["shortDescription", LIMITS.shortDescription],
]) {
  const value = manifest.interface[field];
  check(
    typeof value === "string" && value.length > 0 && value.length <= limit,
    `interface.${field} is ${value?.length ?? 0} chars, directory limit ${limit}`,
  );
  check(
    /[\n\r]/.test(value ?? "") === false,
    `interface.${field} must be a single line`,
  );
}
for (const url of [manifest.homepage, manifest.repository]) {
  check(url.startsWith("https://"), `${url} must be HTTPS`);
}
for (const name of skillDirs) {
  const identity = `${manifest.name}:${name}`;
  check(
    identity.length <= LIMITS.skillIdentity,
    `skill identity "${identity}" is ${identity.length} chars, limit ${LIMITS.skillIdentity}`,
  );
}

if (manifestErrors.length > 0) {
  for (const e of manifestErrors) console.error(`error: ${e}`);
  process.exit(1);
}

writeFileSync(
  join(stageDir, ".codex-plugin/plugin.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

rmSync(zipPath, { force: true });
execFileSync(
  "zip",
  ["-qr", zipPath, ".", "-x", "*.DS_Store", "__MACOSX*"],
  { cwd: stageDir },
);

// Verify the archive rather than the staging directory: what ships is what the
// zip contains, and a symlink or a missing SKILL.md only shows up post-zip.
const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const problems = [];
if (entries.includes(".codex-plugin/plugin.json") === false) {
  problems.push("manifest is not at the archive root");
}
const packagedSkills = entries.filter((e) =>
  /^skills\/[^/]+\/SKILL\.md$/.test(e),
).length;
if (packagedSkills !== skillDirs.length) {
  problems.push(
    `archive has ${packagedSkills} SKILL.md files, repo has ${skillDirs.length}`,
  );
}
// No zip listing prints symlink targets — `unzip -l` gives length, date, and
// name, and the zipinfo formats do not print ` -> target` either. The file type
// survives only in zipinfo's Unix mode column, where a symlink reads
// `lrwxrwxrwx`. Every entry must yield a mode for this to mean anything, so an
// unparseable listing is itself a failure rather than a silent pass.
const modes = execFileSync("unzip", ["-Z", zipPath], { encoding: "utf8" })
  .split("\n")
  .map((line) => /^([-bcdlps])[-rwxsStT]{9}\s+\d+\.\d+\s+\S+\s/.exec(line))
  .filter((match) => match !== null);

if (modes.length !== entries.length) {
  problems.push(
    `zipinfo reported modes for ${modes.length} of ${entries.length} entries, so the archive cannot be shown symlink-free`,
  );
}
const symlinked = modes
  .filter((match) => match[1] === "l")
  .map((match) => /\d\d:\d\d\s+(.*)$/.exec(match.input)?.[1] ?? match.input);
if (symlinked.length > 0) {
  problems.push(
    `archive contains symlinks; they must be dereferenced: ${symlinked.join(", ")}`,
  );
}

// Every interface asset path must resolve inside the archive, and the images
// must be square — the validator rejects both a dangling path and a non-square
// image, and neither is visible from the manifest alone.
for (const field of ["composerIcon", "logo"]) {
  const ref = manifest.interface[field];
  const entry = ref.replace(/^\.\//, "");
  if (entries.includes(entry) === false) {
    problems.push(`interface.${field} points at ${ref}, absent from the archive`);
    continue;
  }
  const probe = join(outDir, `.probe-${field}.png`);
  writeFileSync(
    probe,
    execFileSync("unzip", ["-p", zipPath, entry], { maxBuffer: 32 * 1024 * 1024 }),
  );
  const dims = execFileSync(
    "sips",
    ["-g", "pixelWidth", "-g", "pixelHeight", probe],
    { encoding: "utf8" },
  );
  const width = Number(/pixelWidth:\s*(\d+)/.exec(dims)?.[1]);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(dims)?.[1]);
  const bytes = statSync(probe).size;
  rmSync(probe, { force: true });
  if (!width || !height) {
    problems.push(`interface.${field} (${ref}) is not a readable image`);
    continue;
  }
  if (width !== height) {
    problems.push(`interface.${field} (${ref}) is ${width}x${height}, must be square`);
  }
  if (width < LIMITS.iconMinPx || width > LIMITS.iconMaxPx) {
    problems.push(
      `interface.${field} (${ref}) is ${width}px, must be ${LIMITS.iconMinPx}-${LIMITS.iconMaxPx}px`,
    );
  }
  if (bytes > LIMITS.iconBytes) {
    problems.push(`interface.${field} (${ref}) is ${bytes} bytes, limit ${LIMITS.iconBytes}`);
  }
}

// Archive shape. The uploader rejects the whole file for any of these, with no
// indication of which entry was at fault.
if (entries.length > LIMITS.archiveEntries) {
  problems.push(`archive has ${entries.length} entries, limit ${LIMITS.archiveEntries}`);
}
const archiveBytes = statSync(zipPath).size;
if (archiveBytes > LIMITS.archiveBytes) {
  problems.push(`archive is ${archiveBytes} bytes, limit ${LIMITS.archiveBytes}`);
}
for (const entry of entries) {
  if (entry.includes("\\")) {
    problems.push(`${entry} uses backslashes; paths must use /`);
  }
  if (entry.split("/").some((s) => s === ".." || s.trim() !== s)) {
    problems.push(`${entry} has a '..' or whitespace-padded segment`);
  }
  if (entry.split("/").filter(Boolean).length > LIMITS.pathSegments) {
    problems.push(`${entry} exceeds ${LIMITS.pathSegments} path segments`);
  }
}
// "Skill files directly under skills/ are ignored" — a skill must be a
// subdirectory, so a stray file there silently drops a skill from the listing.
for (const entry of entries) {
  if (/^skills\/[^/]+$/.test(entry) && entry.endsWith("/") === false) {
    problems.push(`${entry} sits directly under skills/ and would be ignored`);
  }
}

// Re-read every packaged SKILL.md out of the archive and apply the validator's
// own rules. Checking the staging copy would miss anything the zip step changed,
// and a rejected upload costs a review cycle.
for (const entry of entries.filter((e) =>
  /^skills\/[^/]+\/SKILL\.md$/.test(e),
)) {
  const body = execFileSync("unzip", ["-p", zipPath, entry], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (/^metadata:/m.test(body)) {
    problems.push(`${entry} still carries a metadata block`);
  }
  const description = frontmatterDescription(body);
  if (description === null) {
    problems.push(`${entry} lost its description`);
  } else if (description.length > SKILL_DESCRIPTION_LIMIT) {
    problems.push(
      `${entry} description is ${description.length} chars, over ${SKILL_DESCRIPTION_LIMIT}`,
    );
  }
}

// The edits above are anchored to prose. This is the check that does not care
// how they were written: if any packaged file still names an excluded skill,
// the archive ships a link to something it does not contain.
// grep-family exit codes: 0 found, 1 nothing matched, >1 an actual error. Only
// 1 means clean. Treating every throw as "no matches" — as this did — turns a
// missing binary or an unreadable archive into a silent pass, and these sweeps
// are the only evidence the removals took, so a sweep that did not run is a
// build failure rather than a clean bill of health.
const zipgrepFiles = (term) => {
  try {
    const out = execFileSync("zipgrep", ["-l", term, zipPath], { encoding: "utf8" });
    return { files: out.split("\n").filter(Boolean) };
  } catch (error) {
    if (error.status === 1) {
      return { files: (error.stdout ?? "").split("\n").filter(Boolean) };
    }
    const why =
      error.status === undefined
        ? `could not run (${error.code ?? error.message})`
        : `exited ${error.status}`;
    return { files: [], failure: `zipgrep ${why}` };
  }
};

for (const excluded of EXCLUDED_SKILLS) {
  const { files, failure } = zipgrepFiles(excluded);
  if (failure !== undefined) {
    problems.push(`could not verify ${excluded} left the archive: ${failure}`);
    continue;
  }
  if (files.length > 0) {
    problems.push(
      `archive still references the excluded skill ${excluded} in: ${files.join(", ")}`,
    );
  }
}

for (const { term, scope } of REMOVED_TERMS) {
  const { files, failure } = zipgrepFiles(term);
  if (failure !== undefined) {
    problems.push(`could not verify ${term} left ${scope}: ${failure}`);
    continue;
  }
  const scoped = files.filter((f) => f.startsWith(scope));
  if (scoped.length > 0) {
    problems.push(`archive still references ${term} under ${scope}: ${scoped.join(", ")}`);
  }
}

rmSync(stageDir, { recursive: true, force: true });

if (problems.length > 0) {
  for (const p of problems) console.error(`error: ${p}`);
  process.exit(1);
}

console.log(`cargo-skills ${version} — ${skillDirs.length} skills`);
console.log(zipPath);
