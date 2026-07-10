---
provider: findyMail
category: contact (email)
last-reviewed: 2026-07-09
---

# findyMail

Mid-tier email finder with a phone lookup and a verify on the side. `findEmail` (0.5) is an alternative rung to `hunter.findEmail` in the find-email chain — sometimes finds what hunter misses ([`../references/alternatives.md`](../references/alternatives.md)) — and is the only 0.5-tier finder that also accepts a **LinkedIn URL** as input. Not the default: that's `FullEnrich.findEmail` (1) per [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md). `findPhone` (5) sits mid-chain between prospeo (3) and FullEnrich (6).

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `verifyEmail` | 0.25 | `email` | Bounce-risk check. Off-default — `waterfall.verifyEmail` (0.1) is cheaper. |
| `findEmail` | 0.5 | `name, domain, linkedinUrl` | Mid-tier email finder; the 0.5-tier option that takes a LinkedIn URL. |
| `findPhone` | 5 | `linkedinUrl` (required) | Mid-rung phone lookup between prospeo (3) and FullEnrich (6). |

## What it's for

- ✅ **Chain rung when hunter misses** — different underlying source at the same 0.5 price; swap it in for (or after) hunter on segments where hunter under-covers.
- ✅ **Email from a LinkedIn URL at the cheap tier** — when the row has a profile URL but no clean name/domain pair, `findEmail` takes `linkedinUrl` directly.
- ✅ **Rich hit payload** — output includes `job_title`, `company`, `linkedin_url`, and person/company geo fields alongside the email, useful for coalescing.

## Patterns

### Pattern A — Email finder rung

```bash
# Run on the rows the earlier rung missed
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"findyMail","actionSlug":"findEmail","config":{}}' \
  --records '[
    {"name":"Alice Smith","domain":"acme.com"},
    {"linkedinUrl":"https://linkedin.com/in/bobjones"}
  ]' \
  --wait-until-finished
```

`name` is a **single full-name string** — not `firstName`/`lastName`. Pass `name` + `domain`, or `linkedinUrl`, per row.

### Pattern B — Mid-rung phone lookup

```bash
# Only on qualified leads that prospeo.findPhone missed
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"findyMail","actionSlug":"findPhone","config":{}}' \
  --records '[{"linkedinUrl":"https://linkedin.com/in/alicesmith"}]' \
  --wait-until-finished
```

LinkedIn URL is the only accepted identifier. Output is `phone` + `line_type`.

## Common pitfalls

- **`findPhone` at 5 credits is a mid-rung, not a starting point.** The phone chain opens with `prospeo.findPhone` (3); phone lookups run on qualified leads only, after explicit user request ([`../references/cost-discipline.md`](../references/cost-discipline.md)).
- **`verifyEmail` at 0.25 is 2.5× the default.** Use `waterfall.verifyEmail` (0.1) — or `icypeas.verifyEmail` (0.01) for very large lists — unless the user's own findyMail API key makes it free to them.
- **A found email is not a safe email.** Free pre-cull with `validate-emails.ts` ([`../references/contact-accuracy.md`](../references/contact-accuracy.md)), then `waterfall.verifyEmail` (0.1) on every hit before it reaches a sequencer.

## Anti-patterns

- **`firstName`/`lastName` or `first_name`/`last_name` fields.** findyMail's finder takes `name` (one string), `domain`, `linkedinUrl` — nothing else. Wrong field names are silently ignored and the row misses.
- **Running findyMail AND hunter on the same rows by default.** They're alternates at the same tier — waterfall on misses, don't double-spend on hits ([`../references/waterfall-strategy.md`](../references/waterfall-strategy.md)).
- **Trusting the finder's hit as verified.** Verification is an independent step, always.

## Position in the waterfall

- `findEmail` — CONTACT-stage mid-tier rung, interchangeable with `hunter.findEmail` / `leadMagic.findEmail` (all 0.5); pick by segment coverage and demote whichever misses on the pilot's first ~10 rows.
- `findPhone` — **rung 2** of the phone chain (prospeo → findyMail or FullEnrich → waterfall).
- `verifyEmail` — VERIFY stage, but off-default on price; the spine verifies with `waterfall.verifyEmail` (0.1).

## Action shape

`{"kind":"connector","integrationSlug":"findyMail","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.** Note the capitalization: `findyMail` (camel-case with capital `M`).
