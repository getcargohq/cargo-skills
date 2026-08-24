# Troubleshooting

Ordered by when you hit them: provisioning, then warm-up, then sending, then reading results.

## Provisioning

### "I need a `--domain-uuid` and nothing lists domains"

Correct — this is a real gap, not a missing flag. `mailbox create` requires a sending domain
UUID, and `domainManagement` has an API but **no `cargo-ai` commands**. Two ways out:

- **Web app** — open the sending domain in Cargo and take the UUID from the URL.
- **CDK** — declare it with `defineDomain` (`adopt: true` for a domain already bought in the
  app), `cargo-ai cdk deploy`, and read the UUID back from `cargo.state.json`. See
  [`../../cargo-cdk/SKILL.md`](../../cargo-cdk/SKILL.md).

Say this to the user rather than guessing a UUID, and file it:

```bash
cargo-ai workspaceManagement report create \
  --title "No CLI surface for domainManagement blocks mailbox create" \
  --description "mailbox create requires --domain-uuid; the CLI exposes no command that lists sending domains."
```

### `mailbox create` failure reasons

| Reason | What it means | Fix |
| --- | --- | --- |
| `domainNotFound` | The UUID is not a domain in this workspace | Re-read it from the app or `cargo.state.json` |
| `domainNotActive` | The domain is registered but not live (DNS still propagating, or `failed`) | Wait, or fix the zone |
| `mailboxAlreadyExists` | Something already holds `username@domain` | Pick another local part, or `mailbox list --domain-uuid <uuid>` to find it |
| `transportNotSupported` | `--type outlook` | Use `google`, `shared`, or `private` |
| `folderNotFound` | `--folder-uuid` is wrong, or the folder is not of kind `mailbox` | `workspaceManagement folder list` |
| `notEnoughCredits` | The workspace cannot cover the monthly charge | Top up, or provision fewer |
| `provisioningFailed` | The provider refused | Retry once; if it repeats, file a report |

### The mailbox is stuck at `pending`

`create` always returns `pending` — the provider has not issued credentials yet. It clears when
`refresh-status` says so, or on its own within five minutes (a maintenance sweep runs every five
minutes). Poll it:

```bash
cargo-ai mailboxManagement mailbox refresh-status <uuid>   # repeat until status is "active"
```

Still `pending` after ~10 minutes, or `refresh-status` returns `providerMailboxNotFound`?
Provisioning did not complete at the provider. File a report with the mailbox UUID.

A send before `active` fails with `credentialsMissing` — which retries, so a batch launched too
early recovers on its own rather than losing rows.

### The mailbox went `inactive`

The provider disabled it. `errorCode` says why: **401** is an auth failure (credentials
rotated or revoked), **402** is a spam/abuse block. Neither is fixable by re-running a command.
A 402 in particular means the domain's reputation is at risk — stop sending from the whole
domain and look at what was sent, not at the mailbox.

### `--type outlook` never works

The flag accepts it, the API refuses it, every time, with `transportNotSupported`. Outlook
mailboxes only expose a Graph transport and Graph delivery has not shipped. CDK's
`defineMailbox` omits `outlook` from its type union for this reason. Use `google`, `shared`,
or `private`.

## Warm-up

| Symptom | Cause | Fix |
| --- | --- | --- |
| `warmupAlreadyStarted` | `start-warmup` on a running warm-up | Use `update-warmup` to change the target |
| `warmupNotStarted` | `update-warmup` or `get-warmup-stats` on a mailbox that never started (or that is `disabled` / `failed`) | `start-warmup` first |
| `warmupNotSupported` | The provider cannot warm this flavour | Nothing to do |
| `mailboxNotActive` | Still `pending`, or provider-disabled | Resolve the status first |
| `get-warmup-stats` → `{"stats": null}` | Warm-up is running; the inbox is still joining the pool | Wait — this is **not** the same as `warmupNotStarted` |
| `get-warmup-stats` prints the `mailbox` group help instead of running | The CLI predates the release that added the command — an unknown subcommand falls back to group help rather than erroring | `mailbox --help` to see what your CLI has, then re-run the session refresh in [`../../cargo/SKILL.md`](../../cargo/SKILL.md) |
| Allowance stuck at 5/day | Warm-up never started, or `stop-warmup` reset the anchor | `start-warmup`, then wait — the ramp takes 45 days |
| Allowance lower than expected | An explicit `dailySendLimit` is clamping it, or the ramp is younger than you think | See [`warmup-and-allowance.md`](warmup-and-allowance.md) |
| Raising `dailySendLimit` changes nothing | It can only tighten, never loosen | By design; the ramp wins |

## Sending

`sendEmail` returns a node error with a reason rather than throwing. The full table is in
[`sending.md`](sending.md); the ones that surprise people:

- **`recipientSuppressed`** — the address opted out, bounced, complained, or was suppressed
  manually. Suppression is workspace-wide and absolute; the fix is to remove the row from your
  audience, never to remove the suppression.
- **`dailyLimitReached`** — the ramp's allowance is spent. It retries and lifts on its own, but
  a batch larger than `remainingCount` burns a run per excess row. Check
  `mailbox get-send-allowance` first.
- **A batch that "ran" but delivered nothing** — read the run errors, not the run count. Three
  reasons never succeed on retry (`recipientSuppressed`, `mailboxNotActive`,
  `transportNotSupported`), so a batch full of them is a list or a mailbox problem, not a
  transient one. [`../../cargo-diagnostics/SKILL.md`](../../cargo-diagnostics/SKILL.md) sweeps a
  batch by root cause.

There is **no dry run from the CLI**. Send to yourself first — it is the only way to see the
rendered HTML, the signature, and the unsubscribe footer as the recipient will.

## Reading results

| Symptom | Cause |
| --- | --- |
| Filtering `--statuses success` returns nothing | `success` is not a list status — a delivered message reads as `sent`. See [`response-shapes.md`](response-shapes.md) |
| `--statuses sent, replied` returns nothing | The space. CSV flags are comma-separated with **no spaces** |
| Zero bounces on a list you expect to bounce | `bounced` has **no producer yet** — nothing parses delivery-status notifications. Do not read the empty count as a clean list |
| `mailbox list` has no `count` | Only that list omits it; count the array |
| A list stopped at 50 rows | `message` / `thread` / `event` default to `--limit 50` (max 200). `mailbox` and `suppression` have no default (max 1000) |
| `--folder-uuid none` on `list` returned unfiled mailboxes, not an error | `none` is the sentinel — on `list` it means "in no folder", on `update` it means "clear it" |
| A reply is not in `message list` | Inbound replies are **events**, not messages. `event list --kinds replied`, or `thread get <uuid>` |
| Replies are not appearing at all | Check `inboundSyncedAt` on the mailbox — null means IMAP has never polled it |
| `thread list --created-after` matched threads created earlier | On threads it filters on **last activity**, which is usually what you want for a reply queue |

## Still stuck

Re-refresh the CLI and skills first — a fix may have shipped since the session started. If a
documented flag or shape still does not match what you observe, file it; every report is read
by the team.

```bash
cargo-ai workspaceManagement report create \
  --title "<one-line summary>" \
  --description "<exact command(s), errorMessage verbatim, expected vs actual, UUIDs>"
```
