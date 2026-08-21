# Response shapes and enums

What each command returns, and the enums you filter on. Every command in this domain is a
single synchronous HTTP call — there is no run wrapper and nothing to poll.

## Envelopes

| Command | Returns | `count`? | Default limit | Max limit |
| --- | --- | --- | --- | --- |
| `mailbox list` | `{ mailboxes: Mailbox[] }` | **no** | **none** | 1000 |
| `mailbox get` / `create` / `update` / `remove` / `refresh-status` / `*-warmup` | `{ mailbox: Mailbox }` | — | — | — |
| `mailbox get-send-allowance` | `{ allowance: { dailyLimit, sentCount, remainingCount } }` | — | — | — |
| `mailbox get-warmup-stats` | `{ stats: WarmupStats \| null }` | — | — | — |
| `message list` | `{ count, messages: Message[] }` | yes | 50 | 200 |
| `message get` | `{ message: Message }` | — | — | — |
| `thread list` | `{ count, threads: Thread[] }` | yes | 50 | 200 |
| `thread get` | `{ thread: Thread }` | — | — | — |
| `event list` | `{ count, events: Event[] }` | yes | 50 | 200 |
| `suppression list` | `{ count, suppressions: Suppression[] }` | yes | **none** | 1000 |
| `suppression create` | `{ suppression: Suppression }` | — | — | — |
| `pricing get` | `{ monthlyCredits: Record<MailboxType, number> }` | — | — | — |

**Two traps.** `mailbox list` is the only list with no `count` — count the array. And `mailbox
list` / `suppression list` have no default limit, so an unbounded call returns everything up to
1000 while the other three quietly stop at 50.

There is no `event get`. Fetch events through `event list --message-uuid` or `--thread-uuid`.

## Enums

```
MailboxType          google | outlook | shared | private     # outlook cannot deliver
MailboxStatus        pending | active | inactive
MailboxWarmupStatus  disabled | pending | active | paused | failed
MailboxProviderSlug  mailpool                                 # the only provider
MailboxTransportSlug smtp | graph                             # outlook → graph, rest → smtp
MessageStatus        pending | success | error
MessageListStatus    pending | error | sent | opened | clicked | replied | bounced | unsubscribed
EventKind            sent | opened | clicked | replied | bounced | unsubscribed
SuppressionReason    unsubscribed | bounced | complained | manual
```

- **`MessageStatus` is not what you filter on.** `message list --statuses` and
  `thread list --statuses` take `MessageListStatus`, where `success` does not appear: a
  delivered message reads as `sent` (or a later event). `pending` and `error` come from the
  message row; everything else is the latest event.
- **`bounced` has no producer yet.** Nothing parses delivery-status notifications, so no
  `bounced` events are written and bounces do not auto-suppress. An empty bounce count is not
  evidence of a clean list.
- Every `--statuses` / `--kinds` / `--reasons` flag is comma-separated **with no spaces**.

## `Mailbox`

```jsonc
{
  "uuid": "…", "workspaceUuid": "…",
  "domainUuid": "…|null",        // the sending domain, when Cargo owns it too
  "folderUuid": "…|null",        // null = workspace root
  "provider": "mailpool",
  "meta": {},                    // opaque, provider-owned
  "email": "jane@acme-outreach.com",
  "firstName": "Jane", "lastName": "Doe",
  "signature": "…|null",
  "type": "google", "transport": "smtp",
  "credentials": { "smtp": {…}, "imap": {…} },   // encrypted at rest; only transports decrypt
  "status": "active",
  "errorCode": "…|null",         // set when status is inactive: 401 auth, 402 spam
  "errorMessage": "…|null",
  "warmupStatus": "active",
  "warmupDailyTarget": 40,
  "warmupStartedAt": "…|null",   // the ramp anchor — see warmup-and-allowance.md
  "dailySendLimit": null,        // an override that can only TIGHTEN the ramp
  "userUuid": "…",
  "chargedUntil": "…",           // end of the month already paid for
  "inboundUidValidity": null, "inboundLastUid": null,
  "inboundJunkUidValidity": null, "inboundJunkLastUid": null,
  "inboundSyncedAt": "…|null",   // last IMAP poll for replies
  "createdAt": "…", "updatedAt": "…", "deletedAt": "…|null"
}
```

The fields worth reading: `status` + `errorCode` (can it send at all), `warmupStatus` +
`warmupStartedAt` (how much can it send), `chargedUntil` (what it is costing), and
`inboundSyncedAt` (are replies being picked up).

## `Message`

```jsonc
{
  "uuid": "…", "workspaceUuid": "…", "mailboxUuid": "…",
  "toEmail": "jane@acme.com", "subject": "…",
  "bodyHtml": "…|null", "bodyText": "…|null",
  "rfcMessageId": "<…>",         // pass to a follow-up's inReplyTo / references
  "inReplyTo": "<…>|null",
  "threadUuid": "…",             // assigned by Cargo at send time
  "providerMessageId": "…|null",
  "status": "success",           // pending | success | error
  "errorMessage": "…|null",
  "sentAt": "…|null",
  "createdAt": "…", "updatedAt": "…",
  "lastEvent": { … } | null      // null when nothing has happened yet
}
```

## `Thread`

```jsonc
{
  "uuid": "…",                   // its own uuid, NOT the first message's
  "workspaceUuid": "…", "mailboxUuid": "…",
  "toEmail": "jane@acme.com",
  "subject": "…",                // first outbound's subject, without a leading Re:/Fwd:
  "createdAt": "…", "updatedAt": "…",
  "lastEmail": { …Message } | null,
  "lastEvent": { …Event } | null
}
```

`thread list --created-after` / `--created-before` filter on **last activity**, not creation —
which is what you want for a reply queue, and surprising if you read the flag name literally.

## `Event`

```jsonc
{
  "uuid": "…", "workspaceUuid": "…", "mailboxUuid": "…",
  "messageUuid": "…", "threadUuid": "…",
  "kind": "replied",
  "occurredAt": "…",
  "actorEmail": "jane@acme.com", // recipient for opens/clicks; From on a reply
  "url": "…|null",               // clicked only — the original href
  "inboundRfcMessageId": "<…>|null",  // replied only
  "userAgent": "…|null",
  "snippet": "…|null",           // first characters of a reply body
  "meta": {},
  "createdAt": "…"
}
```

Events are append-only and are **not** denormalised onto the message row: to count opens you
count events, and `message.lastEvent` is only the most recent one.

## `Suppression`

```jsonc
{
  "uuid": "…", "workspaceUuid": "…",
  "email": "opted-out@acme.com", // normalised: trim().toLowerCase()
  "reason": "unsubscribed",
  "mailboxUuid": "…|null",       // the mailbox whose message triggered it
  "messageUuid": "…|null",
  "createdAt": "…", "updatedAt": "…"
}
```

Workspace-wide, not per mailbox. `suppression create` always records `manual` and is idempotent
— re-suppressing returns the existing row. There is no removal command.

## Warm-up stats

```jsonc
{ "stats": { "sentCount": 120, "deliveredCount": 114, "spamCount": 6,
             "inboxRate": 95, "spamRate": 5 } }
```

`inboxRate` and `spamRate` are **0–100 integers**, and `null` until something has been sent.
`{"stats": null}` means the inbox is still joining the warm-up pool; a 400 `warmupNotStarted`
means warm-up is `disabled` or `failed`. Different problems, different fixes.
