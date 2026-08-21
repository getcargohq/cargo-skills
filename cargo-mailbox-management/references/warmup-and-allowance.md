# Warm-up and the send ramp

Everything a mailbox may send is derived, not configured. This page is the arithmetic behind
`mailbox get-send-allowance`, the state machine behind `start-warmup` / `update-warmup` /
`stop-warmup`, and the fleet-sizing consequence of both.

## The ramp

Real (non-warm-up) sends ramp **linearly from 5 a day to 40 a day over 45 days**, counted from
`warmupStartedAt`:

```
dailyLimit = floor( 5 + (40 - 5) * elapsedDays / 45 )     for 0 < elapsedDays < 45
           = 5                                            when warm-up has never started
           = 40                                           from day 45 onwards
```

| Day | `dailyLimit` |
| --- | --- |
| never started warm-up | 5 |
| 1 | 5 |
| 7 | 10 |
| 15 | 16 |
| 30 | 28 |
| 45+ | 40 |

Three consequences worth stating to a user before they plan a campaign:

1. **A mailbox that never starts warm-up is stuck at 5/day forever.** There is no "it warms up
   by being used". `start-warmup` sets `warmupStartedAt`, and `warmupStartedAt` is the ramp.
2. **`stop-warmup` resets the anchor.** The mailbox drops to 5/day and the 45 days start over.
   To pause the provider's dummy traffic without losing the ramp, use
   `update-warmup --status paused`.
3. **40/day is the ceiling by design.** It sits deliberately below the 50/day figure the
   cold-outreach playbooks quote: the fleet scales by adding mailboxes, not by pushing one to
   its limit. A request to raise the ceiling is an evasion refusal, not a config change
   ([`../../cargo-gtm/references/acceptable-use.md`](../../cargo-gtm/references/acceptable-use.md) §2).

## `dailySendLimit` is a brake, never a bypass

A mailbox row can carry an explicit `dailySendLimit`. It is clamped against the ramp:

```
effectiveLimit = max( min(dailySendLimit, rampedLimit), 0 )
```

So it can only ever *tighten*. Setting it to 500 on a mailbox created this morning yields 5,
not 500 — an override that outranked the ramp would be a way to send 500/day from a cold inbox,
which is the exact failure warm-up exists to prevent. Use it to hold a mailbox below its ramp
(a shared inbox you want kept quiet); never expect it to raise anything.

## Allowance vs warm-up stats

Two commands, two different populations of mail. Do not report one as the other.

| | `get-send-allowance` | `get-warmup-stats` |
| --- | --- | --- |
| Population | Your real outreach | The provider's warm-up network (dummy mail between pooled inboxes) |
| Window | Rolling **24 hours** | Today, **UTC day** |
| Fields | `dailyLimit`, `sentCount`, `remainingCount` | `sentCount`, `deliveredCount`, `spamCount`, `inboxRate`, `spamRate` |
| Reads as | Capacity | Reputation |
| Empty means | Nothing sent today | Nothing measurable yet — see below |

`inboxRate` and `spamRate` are **0–100 integers**, not fractions, and are `null` until something
has been sent. They are the closest thing Cargo has to a deliverability score — there is no
reputation or health metric on the mailbox itself.

`get-warmup-stats` has two distinct "no data" outcomes, and they mean opposite things:

- `{"stats": null}` — warm-up is running but the inbox is still joining the pool. Wait.
- HTTP 400 `warmupNotStarted` — warm-up is `disabled` or `failed`. Nothing is coming. Fix it.

`sentCount` on the allowance counts **delivered** messages, not queued ones: a dropped or
pending row never widens the allowance.

## `warmupStatus` transitions

`disabled` · `pending` · `active` · `paused` · `failed`

| From | Command | To |
| --- | --- | --- |
| `disabled` | `start-warmup <uuid> [--daily-target n]` | `pending`, then `active` once the provider accepts the inbox |
| `active` | `update-warmup --uuid <uuid> --status paused` | `paused` (ramp anchor preserved) |
| `paused` | `update-warmup --uuid <uuid> --status active` | `active` |
| any | `stop-warmup <uuid>` | `disabled` — **and the ramp resets to day 0** |

`update-warmup --status` accepts the whole enum, but only `active` and `paused` are actionable:
`pending` and `failed` are states the provider reaches on its own, and `disabled` belongs to
`stop-warmup`. `--daily-target` (1–40, default 40) sets the provider's dummy volume at full
ramp; it does **not** change your send allowance.

Errors you will meet: `warmupAlreadyStarted` (already running), `warmupNotStarted`
(update/stats on a mailbox that never started), `warmupNotSupported` (the provider cannot warm
this flavour), `mailboxNotActive` (still `pending`, or disabled by the provider).

## Sizing a fleet

The ramp makes volume a function of **mailbox count × age**, and the pricing makes mailbox count
a monthly bill. Both halves belong in the same sentence when you propose a fleet.

Daily capacity at steady state is `40 × mailboxes`. Monthly cost is
`mailboxes × monthlyCredits[type]` — read live, never from memory:

```bash
cargo-ai mailboxManagement pricing get
```

At the figures returned at the time of writing (`google` 125, `outlook` 160, `shared` 100,
`private` 100 credits/month):

| Fleet | Steady-state sends/day | Monthly credits (`google`) |
| --- | --- | --- |
| 1 | 40 | 125 |
| 3 | 120 | 375 |
| 5 | 200 | 625 |
| 10 | 400 | 1,250 |

Two things to say before anyone provisions:

- **Steady state is 45 days away.** A fleet bought today sends `5 × mailboxes` tomorrow. If the
  campaign is next week, more mailboxes will not fix it.
- **The bill recurs.** Provisioning is not a one-off spend, and `mailbox remove` is the only way
  to stop it. Apply the approval discipline in
  [`../../cargo-gtm/references/cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md):
  quote the count, quote the monthly credit estimate, and get an explicit yes.

And the check that comes before all of it: a fleet sized to a volume target rather than to a
qualified audience is the volume-in-place-of-relevance refusal. Size the audience first.
