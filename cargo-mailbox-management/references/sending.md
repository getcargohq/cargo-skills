# Sending: the `sendEmail` action

Delivery is not a `mailboxManagement` command. It is a **native orchestration action**, so that
every send inherits orchestration's pacing, retry, credit accounting, and run history rather
than bypassing them. This page is everything that action does.

## The call

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"native","actionSlug":"sendEmail"}' \
  --data '{"mailboxUuid":"<mailbox-uuid>","to":"jane@acme.com","subject":"Quick question","bodyHtml":"<p>…</p>"}' \
  --wait-until-finished
```

No `config` on the action — inputs go in `--data`, as with every action
([`../../cargo-orchestration/SKILL.md`](../../cargo-orchestration/SKILL.md)).

| Field | Required | Meaning |
| --- | --- | --- |
| `mailboxUuid` | ✅ | Mailbox to send from. Must be `active`. |
| `to` | ✅ | Recipient address. Checked against the workspace suppression list first. |
| `subject` | ✅ | Subject line. Honest and descriptive — a misleading subject is a §2 refusal. |
| `bodyHtml` | — | HTML body. |
| `bodyText` | — | Plain-text fallback. Generated from `bodyHtml` when omitted. |
| `includeUnsubscribeLink` | — | Append the Unsubscribe link to the body. Defaults to `true`; `false` hides only the body link — the `List-Unsubscribe` header is sent either way. |
| `inReplyTo` | — | `Message-ID` this message replies to. |
| `references` | — | Every `Message-ID` in the thread so far, **oldest first**. |

Output: `{ messageUuid, rfcMessageId, providerMessageId, sentAt, threadUuid }`.

**Cost: 0.1 credits per send**, fixed, regardless of size or outcome.

## Threading

`inReplyTo` alone threads the first reply and then breaks. Mail clients need the full ancestry:
`references` must carry the whole chain, oldest first, per RFC 5322 §3.6.4.

```bash
# 1. First touch — keep the rfcMessageId it returns
cargo-ai orchestration action execute \
  --action '{"kind":"native","actionSlug":"sendEmail"}' \
  --data '{"mailboxUuid":"<uuid>","to":"jane@acme.com","subject":"Quick question","bodyHtml":"<p>…</p>"}' \
  --wait-until-finished
# → {"messageUuid":"…","rfcMessageId":"<abc@cargo>","…":"…"}

# 2. Follow-up on the same thread
cargo-ai orchestration action execute \
  --action '{"kind":"native","actionSlug":"sendEmail"}' \
  --data '{"mailboxUuid":"<uuid>","to":"jane@acme.com","subject":"Re: Quick question","bodyHtml":"<p>…</p>","inReplyTo":"<abc@cargo>","references":["<abc@cargo>"]}' \
  --wait-until-finished
```

Cargo assigns the `threadUuid` itself: a new one when the message starts a thread, otherwise
copied from the parent matched via `In-Reply-To` / `References`. Inbound replies are recorded as
**events** on the outbound message, not as message rows — `thread get <uuid>` is where you read
a conversation whole.

## Refusals: `notExecuted`, not an exception

A send that does not happen is a **node error with a reason**, not a thrown error and not a
silent success. Read the reason; it decides whether retrying is pointless.

| Reason | Meaning | Retries? |
| --- | --- | --- |
| `recipientSuppressed` | The address is on the workspace suppression list | ❌ Needs a human — and the answer is not to remove the suppression |
| `mailboxNotActive` | Mailbox is `pending`, the provider disabled it (`inactive`, `errorCode` 401 auth / 402 spam), or Cargo cannot log into it (`error`) | ❌ Fix the mailbox |
| `mailboxSendingPaused` | The mailbox's `dailySendLimit` is `0`, which pauses outreach from it | ❌ Until the override is lifted |
| `transportNotSupported` | An `outlook` mailbox — Graph delivery has not shipped | ❌ Permanent |
| `mailboxNotFound` | Bad `mailboxUuid` | ❌ |
| `dailyLimitReached` | The ramp's allowance is exhausted for the rolling 24h | ✅ Lifts on its own |
| `credentialsMissing` | Provisioning has not finished issuing SMTP credentials | ✅ Resolves itself |
| `deliveryFailed` | The transport rejected it; `errorMessage` carries the detail | ✅ |

The distinction matters at batch scale: the first five will never succeed on retry, so a batch
full of `recipientSuppressed` is a list problem, not a transient one.

## Pacing

The action is rate-limited **per mailbox**, keyed `mailboxManagement:mailboxes:pacing:<uuid>`:
at most `dailyLimit` sends per rolling day, with a random gap of 1 to 3 minutes between two sends
(the gap is not a slice of the day). Two effects:

- Sends from one mailbox are spaced minutes apart rather than bursting, and the jitter keeps them
  off an exact metronome that reads as automation.
- A burst larger than the remaining allowance **waits** rather than failing. With 40 left, 40 of
  100 go out and the other 60 wait for the window to roll, the day after if the backlog is deeper.
  A workflow run lives about 15 days, so a backlog deeper than ~15 days of allowance (about 600
  sends on a warmed mailbox) outlives the run waiting for it.

Two cases refuse immediately instead of waiting: a `mailboxUuid` that resolves to no mailbox in
the workspace, and a mailbox whose `dailySendLimit` is `0`.

So: call `mailbox get-send-allowance <uuid>` and read `remainingCount` **before** enrolling a
batch, and size the batch to days of allowance, not to one day.

## What Cargo adds to every message

Injected automatically; you do not write these and must not strip them.

- **`List-Unsubscribe`** — a signed link in the header, on every send whatever
  `includeUnsubscribeLink` says. A recipient using it writes a workspace-wide
  `suppression` row with reason `unsubscribed`, and every later send to that address is refused.
- **Unsubscribe link in the body** — appended to the HTML and text bodies, writing the same
  suppression. `includeUnsubscribeLink: false` hides it (for a one-to-one reply where a footer
  reads wrong); it is not a way around the opt-out. The header still carries one and still
  writes suppressions, but not every client surfaces it, so a first touch keeps the body link:
  every message must carry a working opt-out
  ([`../../cargo-gtm/references/acceptable-use.md`](../../cargo-gtm/references/acceptable-use.md) §4),
  and hiding it to make cold mail look personal is disguising the sender (§2).
- **Open pixel** — produces an `opened` event.
- **Click redirect** — outbound hrefs are rewritten; produces a `clicked` event carrying the
  original `url`.

All three carry HMAC-signed tokens (the recipient is not a Cargo user, so the token is the whole
credential), which is why they cannot be hand-assembled or replayed against another workspace.

What is **not** added: a postal address. Where the sender's jurisdiction requires one — CAN-SPAM
does — it has to be in the body you supply
([`../../cargo-gtm/references/acceptable-use.md`](../../cargo-gtm/references/acceptable-use.md) §4).

## No dry run from the CLI

The engine supports a dry execution (it returns `✅ Would send "<subject>" to <address>` without
delivering), but no `orchestration action execute` flag reaches it. **From the CLI, a send is
live the moment you run the command.**

The practical substitutes, in order:

1. Send to your own address first and read it in a real client — the only way to see the
   rendered HTML, the signature, and the unsubscribe footer as the recipient will.
2. `cargo-ai orchestration action get-output-schema --action '{"kind":"native","actionSlug":"sendEmail"}'`
   resolves the output shape for free, without sending.
3. For a workflow graph, `cargo-ai orchestration node diagram` draws the routing for free and
   shows which nodes bill — approve the graph before deploying it.

## In a workflow or play

In a project's `defineWorkflow` body the same action is the `sendEmail(...)` helper:

```ts
sendEmail({
  mailboxUuid: mailbox.uuid,
  to: row.email,
  subject: `…`,
  bodyHtml: `…`,
});
```

A **play or scheduled tool that calls it re-bills on every run** — and, more importantly,
re-contacts the same audience on every run. That is the cadence gate in `acceptable-use.md` §6
as much as the spend gate in
[`../../cargo-gtm/references/cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md).
Cap the touch count, stop on reply, opt-out, or bounce, and check the segment is not re-enrolling
people you already wrote to.
