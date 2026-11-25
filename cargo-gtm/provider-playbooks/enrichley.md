---
provider: enrichley
category: verification
last-reviewed: 2026-07-09
---

# enrichley (Enrichley)

Dedicated email verification. **One credits-based action, 0.1 credits** — same price as the single-provider default `waterfall.verifyEmail` (0.1) and as `zeroBounce.verifyEmail` (0.1), which makes it another equal-cost second-opinion candidate when a first verdict is ambiguous. Two things set it apart: the action slug is **`verify`** (not `verifyEmail`), and its output flags **secure-email-gateway domains** (`mx_secure_email_gateway`), where SMTP-based verdicts are least trustworthy.

> **Email, phone and LinkedIn-from-email default to Cargo's native tools, not to this provider.** Find email (`email_waterfall`), Find phone (`phone_waterfall`), Find LinkedIn URL from email (`find_linkedin_url_from_personal_email`) and Verify email (`email_validator`) are Cargo-maintained waterfalls with far higher coverage than any single provider ([`../SKILL.md`](../SKILL.md#contact-data-cargos-native-tools-first-mandatory-default)). The chains and "default" rungs on this page rank the single-provider tier, which runs only when the user names a provider, explicitly asks for the cheapest path, or the tool is missing from the workspace. Say which.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `verify` | 0.1 | `email` (required) | Verify a single email's deliverability, with MX diagnostics. |

The connector also accepts your own Enrichley API key (`apiKey`) — same action, billed to your Enrichley plan instead of credits.

## What it's for

- ✅ **Second opinion on ambiguous verdicts** — equal cost to the default; independent signal on rows waterfall flagged catch-all/risky (especially if `zeroBounce` was already spent on this list).
- ✅ **SEG detection** — `mx_secure_email_gateway: true` tells you the domain sits behind a secure email gateway; verdicts there are structurally unreliable, so route those rows by risk policy rather than re-verifying.
- ❌ **Default verify step** — `waterfall.verifyEmail` (0.1) is the single-provider default (see [`../references/alternatives.md`](../references/alternatives.md), Verify email alternatives).
- ❌ **Very large lists** — `icypeas.verifyEmail` (0.01) is 10× cheaper when per-row diagnostics don't matter.

## Patterns

### Pattern A — Second-opinion re-verify

```bash
# Only on rows where the first verifier returned catch-all / ambiguous
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"enrichley","actionSlug":"verify"}' \
  --records '[
    {"email":"alice@acme.com"},
    {"email":"bob@globex.com"}
  ]' \
  --wait-until-finished
```

Keep an email when either verifier passes it cleanly; drop it only when both agree it's bad. Total 0.2/re-checked row — run it on the ambiguous subset, not the whole list.

## Output fields

`email, valid, result, mx_domain, mx_provider, mx_secure_email_gateway, email_type, credits_consumed`. Filter on `valid` (boolean) / `result`; use `mx_provider` + `mx_secure_email_gateway` to explain low-confidence verdicts, `email_type` to spot role/free addresses, and `credits_consumed` when auditing spend.

## Common pitfalls

- **The action slug is `verify`, not `verifyEmail`.** Every other verify provider in the catalog uses `verifyEmail`; copy-pasting that slug here fails.
- **`email` is the only input.** The schema has no other field (no `objectType`); an extra key is refused by `action execute` (`Unknown field: <key>`) and stripped inside a workflow node.
- **Rate limits differ by billing mode:** 15 calls/second on credits, 5/second on an own-key connector (both spread). Large batches drain at that pace; poll, don't re-trigger.

## Anti-patterns

- **enrichley as the first verify rung.** Same price as the default but outside the priority stack — swap it in deliberately (second opinion, provider outage, coverage test), not by default (see [`../references/stage-action-map.md`](../references/stage-action-map.md), Verify email).
- **Skipping verification because the finder said "verified".** Providers grade their own homework — every found email gets an independent verify step (see [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md)).
- **Paid verify before the free cull.** Run the free pre-cull from [`../references/contact-accuracy.md`](../references/contact-accuracy.md) first — dropping invalid/disposable/duplicate rows is free and shrinks the paid batch.

## Position in the waterfall

**VERIFY stage, alternative rung.** Default chain: `waterfall.verifyEmail` (0.1) first; `zeroBounce.verifyEmail` / `enrichley.verify` (0.1) as equal-cost second opinions; `icypeas.verifyEmail` (0.01) when volume dominates.

## Recurring use

Verification status decays, but re-verifying a whole list on a timer re-bills every row — the recurring shape is **verify-before-send**, not verify-on-schedule.

- **In-play gate:** gate the `verify` node to rows entering a send wave whose `*_verified_at` timestamp is missing or stale (older than the send cycle) — never the full segment on each evaluation.
- **Second-opinion discipline recurs too:** in a play, keep enrichley on the ambiguous subset only (catch-all/risky from the first verifier) — 0.2/re-checked row compounds fast on repeat.
- **SEG rows don't ripen:** `mx_secure_email_gateway: true` domains stay structurally unverifiable — route them by risk policy once and exclude them from re-verification.

## Action shape

`{"kind":"connector","integrationSlug":"enrichley","actionSlug":"verify"}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — the verify step before personalization; never sequence unverified emails.
- [`../recipes/prospecting.md`](../recipes/prospecting.md) — the verify rung of the find → enrich → verify → sync spine.
