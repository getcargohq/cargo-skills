---
provider: zeroBounce
category: verification
last-reviewed: 2026-07-09
---

# zeroBounce (ZeroBounce)

Dedicated email verification. **One credits-based action, 0.1 credits** — same price as the priority-stack default `waterfall.verifyEmail`, but a **different underlying provider**, which makes it the standard second opinion when waterfall's verdict is ambiguous.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `verifyEmail` | 0.1 | `email` | Verify a single email's deliverability status, with rich diagnostics. |

## What it's for

- ✅ **Second opinion on ambiguous verdicts** — re-check emails that `waterfall.verifyEmail` flagged as catch-all or risky before discarding them. Different underlying provider = independent signal at the same 0.1 price.
- ✅ **Typo rescue** — the output includes `did_you_mean`; a "bad" email is sometimes one transposed character away from a deliverable one.
- ✅ **Diagnostic depth** — output carries `sub_status`, `free_email`, `catchall_domain`, `mx_found`, `mx_record`, `smtp_provider`, and `domain_age_days`, useful when you need to *explain* a verdict, not just filter on it.
- ❌ **Default verify step** — `waterfall.verifyEmail` (0.1) is the priority-stack default; use zeroBounce as the alternative, not the first rung (see [`../references/alternatives.md`](../references/alternatives.md), Verify email alternatives).
- ❌ **Very large lists** — `icypeas.verifyEmail` (0.01) is 10× cheaper for bulk verification where per-row diagnostics don't matter.

## Patterns

### Pattern A — Second-opinion re-verify

```bash
# Only on rows where the first verifier returned catch-all / ambiguous
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"zeroBounce","actionSlug":"verifyEmail","config":{}}' \
  --records '[{"email":"alice@acme.com"},{"email":"bob@globex.com"}]' \
  --wait-until-finished
```

Keep an email when either verifier passes it cleanly; drop it only when both agree it's bad. This roughly doubles cost per re-checked row (0.1 + 0.1), so run it on the ambiguous subset, not the whole list.

### Pattern B — Single lookup with diagnostics

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"zeroBounce","actionSlug":"verifyEmail","config":{}}' \
  --data '{"email":"alice@acme.com"}' \
  --wait-until-finished
```

Read `status` + `sub_status` for the verdict, `catchall_domain` / `free_email` for risk context, and `did_you_mean` for a suggested correction when the address looks mistyped.

## Output fields

`address, status, sub_status, free_email, catchall_domain, did_you_mean, account, domain, domain_age_days, smtp_provider, mx_found, mx_record, firstname, lastname, gender, country, region, city, zipcode, processed_at`. Filter on `status`; use the rest for triage and reporting.

## Common pitfalls

- **Double-verifying everything by default.** Running zeroBounce on rows waterfall already passed cleanly doubles verify spend for near-zero information gain. Reserve it for the ambiguous subset.
- **Ignoring `did_you_mean`.** When present, re-verify the suggested address before writing the contact off — a corrected typo is the cheapest "found email" there is.
- **Treating catch-all as valid.** `catchall_domain: true` means the domain accepts everything; the mailbox itself is unproven. Route catch-alls per your sequencer's risk tolerance, don't blanket-send.

## Anti-patterns

- **zeroBounce as the first verify rung.** Same price as the priority default but outside the priority stack — swap it in deliberately (second opinion, provider outage, coverage test), not by default.
- **Skipping verification because the finder said "verified".** Providers grade their own homework — every found email goes through a verify step regardless of the finder's flag (see [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md)).

## Position in the waterfall

**VERIFY stage, alternative rung.** Default chain: `waterfall.verifyEmail` (0.1) first; `zeroBounce.verifyEmail` (0.1) as the equivalent-cost second opinion; `icypeas.verifyEmail` (0.01) when volume dominates and diagnostics don't matter (see [`../references/stage-action-map.md`](../references/stage-action-map.md), Verify email).

## Action shape

`{"kind":"connector","integrationSlug":"zeroBounce","actionSlug":"verifyEmail","config":{}}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — the verify step before personalization; never sequence unverified emails.
- [`../recipes/prospecting.md`](../recipes/prospecting.md) — the verify rung of the find → enrich → verify → sync spine.
