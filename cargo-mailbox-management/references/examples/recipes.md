# Mailbox recipes

Copy-paste starting points. Replace `<…>` placeholders with real UUIDs. Two rules run through
all of them: **price the fleet before you provision it** (a mailbox bills monthly, forever), and
**run the three checks before the first send** — basis, suppression, relevance
([`../../../cargo-gtm/references/acceptable-use.md`](../../../cargo-gtm/references/acceptable-use.md) §3).
See [`../warmup-and-allowance.md`](../warmup-and-allowance.md) for the ramp and
[`../sending.md`](../sending.md) for the send itself.

---

## 1. Price a fleet before provisioning it

The conversation that has to happen first. Nothing here spends anything.

```bash
cargo-ai mailboxManagement pricing get
# → {"monthlyCredits":{"google":125,"outlook":160,"shared":100,"private":100}}

cargo-ai mailboxManagement mailbox list | jq '.mailboxes | length'   # what already exists
cargo-ai billing subscription get                                    # what is left to spend
```

Then say it out loud, in this shape: *"3 google mailboxes is 375 credits **per month**, and they
reach 120 sends/day only after 45 days of warm-up — 15/day next week. Provisioning is not a
one-off charge and `mailbox remove` is the only way to stop it. Go ahead?"*

Steady-state capacity is `40 × mailboxes`. If the volume target is bigger than the qualified
audience justifies, the answer is a smaller audience, not a bigger fleet.

---

## 2. Provision one mailbox and wait for `active`

```bash
# The domain UUID does not come from the CLI — web app, or CDK defineDomain + cargo.state.json
cargo-ai mailboxManagement mailbox create \
  --domain-uuid <domain-uuid> \
  --type google \
  --username jane \
  --first-name Jane --last-name Doe \
  --signature '<p>Jane Doe · Acme</p>'
# → {"mailbox":{"uuid":"<mailbox-uuid>","status":"pending", …}}

cargo-ai mailboxManagement mailbox refresh-status <mailbox-uuid> | jq -r '.mailbox.status'
# repeat until "active" — or wait, a sweep runs every 5 minutes
```

`pending` is normal: the provider has not issued SMTP credentials yet. A send before `active`
fails with `credentialsMissing`, which retries — so an early batch recovers rather than losing
rows.

---

## 3. Start warm-up, and read the ramp honestly

```bash
cargo-ai mailboxManagement mailbox start-warmup <mailbox-uuid> --daily-target 40

cargo-ai mailboxManagement mailbox get-send-allowance <mailbox-uuid>
# day 1  → {"allowance":{"dailyLimit":5,"sentCount":0,"remainingCount":5}}
# day 15 → {"allowance":{"dailyLimit":16, …}}
# day 45 → {"allowance":{"dailyLimit":40, …}}

cargo-ai mailboxManagement mailbox get-warmup-stats <mailbox-uuid>   # next CLI release
# → {"stats":{"sentCount":120,"deliveredCount":114,"spamCount":6,"inboxRate":95,"spamRate":5}}
```

`--daily-target` is the provider's **dummy** warm-up traffic, not your allowance. To pause the
dummy mail without losing the ramp use `update-warmup --status paused`; `stop-warmup` resets
the anchor and sends the mailbox back to 5/day for another 45 days.

`inboxRate` below ~90 while warm-up is running is the signal to stop adding real volume, not to
push harder.

---

## 4. Send one first-touch, checking the allowance first

```bash
# Free: is this recipient allowed to be contacted at all?
cargo-ai mailboxManagement suppression list --reasons unsubscribed,bounced,complained,manual \
  | jq -r '.suppressions[].email' | grep -Fx 'jane@acme.com' && echo "SUPPRESSED — stop"

# Free: is there room today?
cargo-ai mailboxManagement mailbox get-send-allowance <mailbox-uuid> | jq .allowance.remainingCount

# 0.1 credits
cargo-ai orchestration action execute \
  --action '{"kind":"native","actionSlug":"sendEmail","config":{}}' \
  --data '{"mailboxUuid":"<mailbox-uuid>","to":"jane@acme.com","subject":"Quick question about <signal>","bodyHtml":"<p>…</p>"}' \
  --wait-until-finished
# → {"messageUuid":"…","rfcMessageId":"<abc@cargo>","sentAt":"…"}
```

Keep `rfcMessageId` — the follow-up needs it. There is no dry run, so send the first one to
yourself and read it in a real client before pointing this at anyone else.

---

## 5. Thread a follow-up onto the reply

```bash
# Find the reply
cargo-ai mailboxManagement event list --mailbox-uuid <mailbox-uuid> --kinds replied --limit 20 \
  | jq -r '.events[] | "\(.occurredAt)  \(.actorEmail)  \(.snippet)"'

# Read the conversation whole
cargo-ai mailboxManagement thread get <thread-uuid>

# Reply on-thread: references carries the WHOLE chain, oldest first
cargo-ai orchestration action execute \
  --action '{"kind":"native","actionSlug":"sendEmail","config":{}}' \
  --data '{"mailboxUuid":"<mailbox-uuid>","to":"jane@acme.com","subject":"Re: Quick question","bodyHtml":"<p>…</p>","inReplyTo":"<abc@cargo>","references":["<abc@cargo>"]}' \
  --wait-until-finished
```

`inReplyTo` alone threads the first reply and then breaks — mail clients need the full ancestry
in `references`.

---

## 6. The weekly reply queue

What actually happened, in one pass. All free.

```bash
cargo-ai mailboxManagement event list \
  --kinds replied,unsubscribed \
  --occurred-after 2026-08-14 --limit 200 \
  | jq -r '.events[] | "\(.kind)\t\(.actorEmail)\t\(.snippet // "")"'

cargo-ai mailboxManagement thread list --mailbox-uuid <mailbox-uuid> --statuses replied --limit 50 \
  | jq -r '.threads[] | "\(.updatedAt)  \(.toEmail)  \(.subject)"'

cargo-ai mailboxManagement mailbox list --statuses inactive \
  | jq -r '.mailboxes[] | "\(.email)  \(.errorCode)  \(.errorMessage)"'
```

Report it as counts and a table, not raw JSON. An `inactive` mailbox with `errorCode: "402"` is
a spam block — stop sending from that domain and look at what was sent.

Do **not** report "0 bounces" as a deliverability result: `bounced` has no producer yet.

---

## 7. Honour an opt-out that arrived out of band

Someone replies "take me off your list" rather than clicking unsubscribe.

```bash
cargo-ai mailboxManagement suppression create --email opted-out@acme.com
# → {"suppression":{"reason":"manual", …}}

# Prove it: the next send is refused by the engine, before it costs anything
cargo-ai orchestration action execute \
  --action '{"kind":"native","actionSlug":"sendEmail","config":{}}' \
  --data '{"mailboxUuid":"<mailbox-uuid>","to":"opted-out@acme.com","subject":"…","bodyHtml":"…"}' \
  --wait-until-finished
# → run error: recipientSuppressed
```

Suppression is workspace-wide and idempotent, and there is no removal command. Also subtract it
from the **next** sourcing run, not just from the send: a suppressed person re-entering as a
"new" lead is the failure this list exists to prevent
([`../../../cargo-gtm/references/acceptable-use.md`](../../../cargo-gtm/references/acceptable-use.md) §5).

---

## 8. Retire a mailbox

```bash
cargo-ai mailboxManagement mailbox list | jq -r '.mailboxes[] | "\(.email)\t\(.type)\t\(.chargedUntil)"'
cargo-ai mailboxManagement mailbox remove <mailbox-uuid>
```

`remove` deletes the inbox at the provider as well as in Cargo, and it is the only way monthly
billing stops — there is no pause. Threads, messages, and events already recorded stay
readable; the suppression list is workspace-wide and is unaffected.

If the mailbox was declared with CDK's `defineMailbox`, remove it there instead and
`cargo-ai cdk deploy`, or the next deploy will provision it again.
