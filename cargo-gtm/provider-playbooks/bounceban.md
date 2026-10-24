---
provider: bounceban
category: verification
last-reviewed: 2026-10-23
---

# bounceban (BounceBan)

Email verification built for the addresses other verifiers give up on: **accept-all (catch-all) domains and SEG-protected mailboxes** (behind a secure email gateway such as Proofpoint or Mimecast). **One credits-based action, 0.1 credits** — the same price as the default `waterfall.verifyEmail`, so its place is not the default rung but the residue that rung returns as catch-all or unknown.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `verifyEmail` | 0.1 | `email` (required), `mode` (`regular` default / `deepverify`) | Verify one address, including accept-all and SEG-protected ones. |

`deepverify` assumes the email's domain is the owner's **current** company website, which raises the success rate on accept-all addresses — use it only when the domain came from the person's current employer, not from an old record. The connector also accepts your own BounceBan API key.

## What it's for

- ✅ **The catch-all residue** — rows `waterfall.verifyEmail` returned as accept-all / risky / unknown, where a send is otherwise a guess.
- ✅ **Enterprise targets behind gateways** — SEG-protected domains that answer every probe the same way.
- ❌ **First verify rung across a whole list** — `waterfall.verifyEmail` (0.1) is the priority default and settles most rows; `icypeas.verifyEmail` (0.01) is ten times cheaper for bulk.

## Patterns

### Pattern A — Second pass on the catch-all residue

```bash
# Only on rows the first verify returned as accept-all / unknown
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"bounceban","actionSlug":"verifyEmail"}' \
  --records '[{"email":"alice@acme.com","mode":"deepverify"},{"email":"bob@globex.com"}]' \
  --wait-until-finished
```

Output: `result` (`deliverable`, `undeliverable`, `risky`, `unknown`), `score` (0–100), `is_accept_all`, `is_disposable`, `is_role`, `is_free`, `mx_records`, `smtp_provider`, `mode`, `verify_at`. **`risky` is not a failure** here the way it is for a plain SMTP checker: it marks an accept-all or SEG address BounceBan could not settle either way, and `score` carries the confidence — set a threshold rather than dropping every `risky` row.

## Common pitfalls

- **It can wait.** Easy addresses settle in the first 15 seconds; greylisted ones return by callback, and a node waits up to 30 minutes for it. A batch with many hard domains finishes slowly — that is the provider, not a hung run.
- **Run it inside a run.** The callback needs a run to land in; `action execute` / `execute-batch` create one, so this only bites a hand-rolled call outside orchestration.

## Anti-patterns

- **Running it beside `waterfall.verifyEmail` on every row.** Same price, overlapping verdicts on the easy rows — run it on what the first rung could not settle.
- **Treating `deliverable` as consent.** Verification says the mailbox exists; the [`../references/acceptable-use.md`](../references/acceptable-use.md) §3 checks still decide whether to send.

## Position in the waterfall

**VERIFY stage, catch-all specialist.** Default: free pre-cull → `waterfall.verifyEmail` (0.1) → **`bounceban.verifyEmail` (0.1)** on the accept-all / unknown residue → `zeroBounce.verifyEmail` (0.1) as an independent second opinion where verdicts conflict. `icypeas.verifyEmail` (0.01) stays the bulk rung.

## Action shape

`{"kind":"connector","integrationSlug":"bounceban","actionSlug":"verifyEmail"}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — the verify step before personalization.
- [`../references/contact-accuracy.md`](../references/contact-accuracy.md) — the SEND / VERIFY / REVIEW / REMOVE verdicts a `score` threshold maps onto.

## Recurring use

- **No scheduled fit — per-record verification only.** It belongs as a conditional node after the default verify, never as a sweep.
- **In-play gate:** run only where the first verifier said accept-all / unknown **and** the bounceban verdict column is still empty — a settled address must not re-bill on re-evaluation.
- **Decay caveat:** deliverability ages; a pre-send re-verify of an old list goes to the cheap rungs first, with this one only on what they cannot settle.
