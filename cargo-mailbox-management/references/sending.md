# Sending: the `sendEmail` action

Delivery is not a `mailboxManagement` command. It is a **native orchestration action**, so that
every send inherits orchestration's pacing, retry, credit accounting, and run history rather
than bypassing them. This page is everything that action does.

## The call

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"native","actionSlug":"sendEmail","config":{}}' \
  --data '{"mailboxUuid":"<mailbox-uuid>","to":"jane@acme.com","subject":"Quick question","bodyHtml":"<p>…</p>"}' \
  --wait-until-finished
```

`config` stays `{}` — inputs go in `--data`, as with every action
([`../../cargo-orchestration/SKILL.md`](../../cargo-orchestration/SKILL.md)).

| Field | Required | Meaning |
| --- | --- | --- |
| `mailboxUuid` | ✅ | Mailbox to send from. Must be `active`. |
| `to` | ✅ | Recipient address. Checked against the workspace suppression list first. |
| `subject` | ✅ | Subject line. Honest and descriptive — a misleading subject is a §2 refusal. |
| `bodyHtml` | — | HTML body. |
| `bodyText` | — | Plain-text fallback. Generated from `bodyHtml` when omitted. |
| `inReplyTo` | — | `Message-ID` this message replies to. |
| `references` | — | Every `Message-ID` in the thread so far, **oldest first**. |

Output: `{ messageUuid, rfcMessageId, providerMessageId, sentAt }`.

**Cost: 0.1 credits per send**, fixed, regardless of size or outcome.

## Threading

`inReplyTo` alone threads the first reply and then breaks. Mail clients need the full ancestry:
`references` must carry the whole chain, oldest first, per RFC 5322 §3.6.4.

```bash
# 1. First touch — keep the rfcMessageId it returns
cargo-ai orchestration action execute \
  --action '{"kind":"native","actionSlug":"sendEmail","config":{}}' \
  --data '{"mailboxUuid":"<uuid>","to":"jane@acme.com","subject":"Quick question","bodyHtml":"<p>…</p>"}' \
  --wait-until-finished
# → {"messageUuid":"…","rfcMessageId":"<abc@cargo>","…":"…"}

# 2. Follow-up on the same thread
cargo-ai orchestration action execute \
  --action '{"kind":"native","actionSlug":"sendEmail","config":{}}' \
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
| `mailboxNotActive` | Mailbox is `pending`, or the provider disabled it (`errorCode` 401 auth / 402 spam) | ❌ Fix the mailbox |
| `transportNotSupported` | An `outlook` mailbox — Graph delivery has not shipped | ❌ Permanent |
| `mailboxNotFound` | Bad `mailboxUuid` | ❌ |
| `dailyLimitReached` | The ramp's allowance is exhausted for the rolling 24h | ✅ Lifts on its own |
| `credentialsMissing` | Provisioning has not finished issuing SMTP credentials | ✅ Resolves itself |
| `deliveryFailed` | The transport rejected it; `errorMessage` carries the detail | ✅ |

The distinction matters at batch scale: three of these will never succeed on retry, so a batch
full of `recipientSuppressed` is a list problem, not a transient one.

## Pacing

The action is rate-limited **per mailbox**, keyed `mailboxManagement:mailboxes:<uuid>`, with a
`spread` strategy — one send per slot, slots sized as `24h ÷ dailyLimit`. Two effects:

- Sends from one mailbox are spaced across the day rather than bursting, which is the pattern
  mailbox providers reward.
- A burst larger than the remaining allowance **fails fast** rather than parking. With 40 left,
  the 41st of 100 fails immediately with `dailyLimitReached` instead of waiting a day.

When the allowance cannot be read at all, pacing falls back to **1 per day** rather than
unlimited — an unanswered question slows sending to a crawl by design.

So: call `mailbox get-send-allowance <uuid>` and read `remainingCount` **before** enrolling a
batch. Rows past the allowance each burn a run and deliver nothing.

## What Cargo adds to every message

Injected automatically; you do not write these and must not strip them.

- **`List-Unsubscribe`** — a signed link. A recipient using it writes a workspace-wide
  `suppression` row with reason `unsubscribed`, and every later send to that address is refused.
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
2. `cargo-ai orchestration action get-output-schema --action '{"kind":"native","actionSlug":"sendEmail","config":{}}'`
   resolves the output shape for free, without sending.
3. For a workflow graph, `cargo-ai orchestration node diagram` draws the routing for free and
   shows which nodes bill — approve the graph before deploying it.

## In a workflow or play

In a CDK `defineWorkflow` body the same action is the `sendEmail(...)` helper:

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
