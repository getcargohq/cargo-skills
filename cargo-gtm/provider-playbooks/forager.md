---
provider: forager
category: enrichment (contact info from LinkedIn URL)
last-reviewed: 2026-07-09
---

# forager (Forager)

Contact-info lookup keyed **exclusively on LinkedIn URL** — three actions, one input field each. Its niche is `findPersonalEmail` (2): personal-mailbox discovery, which the standard FIND-EMAIL chain doesn't offer at all. `findWorkEmail` (2) sits **above** the whole work-email chain (`icypeas` 0.1 → mid-tier 0.5 → `FullEnrich` 1), so it's a last-resort there; `findPhone` (5) is a documented mid-tier phone rung between `prospeo` (3) and `FullEnrich` (6) — see [`../references/alternatives.md`](../references/alternatives.md) (Find phone alternatives).

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `findPersonalEmail` | 2 | `linkedinUrl` | Personal (non-work) email. Returns `personalEmails[]` with `email`, `email_type`, `validation_status`. |
| `findWorkEmail` | 2 | `linkedinUrl` | Work email — but the standard chain is up to 20× cheaper; last resort only. |
| `findPhone` | 5 | `linkedinUrl` | Phone number. Mid-tier rung of the phone waterfall. |

## What it's for

- ✅ **Personal email for people who changed jobs** — a work email dies with the job; the personal mailbox survives. Natural follow-up to a job-change signal before re-engaging.
- ✅ **Phone waterfall, middle rung** — escalate `prospeo.findPhone` (3) misses here (5) before paying `FullEnrich.findPhone` (6) / `waterfall.findPhone` (7).
- ❌ **First stop for work email** — `FullEnrich.findEmail` (1) is the priority default and half the price; the cheap rungs (`icypeas` 0.1) are 20× cheaper.
- ❌ **Records without a LinkedIn URL** — there is no name+company input. Resolve the URL first ([`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md)).

## Patterns

### Pattern A — Personal email after a job-change signal

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"forager","actionSlug":"findPersonalEmail","config":{}}' \
  --records '[
    {"linkedinUrl":"https://linkedin.com/in/alicesmith"},
    {"linkedinUrl":"https://linkedin.com/in/bobjones"}
  ]' \
  --wait-until-finished
```

`personalEmails[]` can hold several addresses — pick by `validation_status`, then re-verify with the VERIFY chain before sending.

### Pattern B — Phone escalation rung

```bash
# Only on rows where prospeo.findPhone (3) missed
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"forager","actionSlug":"findPhone","config":{}}' \
  --data '{"linkedinUrl":"https://linkedin.com/in/alicesmith"}' \
  --wait-until-finished
```

## Common pitfalls

- **LinkedIn URL is the only key.** Every action takes exactly one field, `linkedinUrl`. No email/name/domain fallback — records missing the URL must go through URL lookup first.
- **`validation_status` is the provider grading its own homework.** Run found emails through the VERIFY stage (`waterfall.verifyEmail`, 0.1) regardless — see [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md).
- **Fixed cost on miss.** All three are fixed-price per execution; a `findPhone` miss still costs 5. Gate the expensive rungs on prior-rung misses only ([`../references/cost-discipline.md`](../references/cost-discipline.md)).
- **Personal email ≠ outreach consent.** Route personal mailboxes per your compliance rules; they're best for re-engagement of known contacts, not cold sends.

## Position in the waterfall

- **CONTACT stage.** Phone: `prospeo` (3) → **forager (5)** / `findyMail` (5) → `FullEnrich` (6) → `waterfall` (7). Email: standard chain first; forager only for the personal-email niche ([`../references/stage-action-map.md`](../references/stage-action-map.md)).
- Feed results into VERIFY (`waterfall.verifyEmail`, 0.1) before any send.

## Action shape

`{"kind":"connector","integrationSlug":"forager","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/re-engagement.md`](../recipes/re-engagement.md) — personal email revives contacts whose work address went stale (CONTACT step after the SIGNAL).
- [`../recipes/job-change-monitoring.md`](../recipes/job-change-monitoring.md) — the job-change signal that makes personal-email lookup worth 2 credits.
