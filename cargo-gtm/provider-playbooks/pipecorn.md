---
provider: pipecorn
category: enrichment (contact waterfall, own key)
last-reviewed: 2026-10-23
---

# pipecorn (Pipecorn)

A contact-data waterfall on **your own Pipecorn API key** — seven actions, none billed in Cargo credits; Pipecorn charges your account by what each call finds. It covers work email, phone, a combined email + phone call, company firmographics, reverse email lookup, people-at-a-company search, and **personal email** — the last of which is consumer data and is gated below before anything else.

## Before `findPersonalEmail` touches anyone

A personal mailbox is a private individual's contact detail, not a professional identity. [`../references/acceptable-use.md`](../references/acceptable-use.md) applies in full, and two rules bind here specifically:

- **Not a cold-outreach channel.** Personal email is for re-engaging people who already know the sender — a former customer or champion whose work address died with a job change — never for a first touch. A request to find personal emails for a sourced list is the consumer-targeting refusal in §2.
- **Pipecorn requires consent enabled on the account** before the action returns anything. That switch is the user's, made on their Pipecorn account under their own compliance review — never flip it, or suggest flipping it, to make a run succeed.

## Own-API-key actions (no credits — require your Pipecorn account connector)

| Action | Inputs | Use for |
|---|---|---|
| `findEmail` | `linkedinUrl` alone, **or** `firstName` + `lastName` + `domain` (or `companyName`) | Professional email with a validation status (`email_status`). |
| `findPhone` | `linkedinUrl`, `phoneType` (`all` default / `mobile`), `phoneCountryCodes` | Phone numbers with line type. Pipecorn charges only when a mobile number is found. |
| `findPhoneAndEmail` | `linkedinUrl` (+ optional name / domain / company for the email side), `phoneType`, `phoneCountryCodes` | Both in one request — cheaper in round trips than two calls when you need both. |
| `findPersonalEmail` | `linkedinUrl` | Personal email with `personal_email_status`. **Gated — see above.** |
| `reverseEmailLookup` | `email` | The person behind an address: name, headline, LinkedIn URLs, current position and company. Returns no email or phone. Charged only on a match. |
| `enrichAccount` | `linkedinUrl` (company), `domain`, or `name` (+ `country` to disambiguate) | Firmographics: industry, headcount and growth, revenue range, funding, HQ, LinkedIn ids. Charged only when the company resolves. |
| `findPeopleAtCompany` | `companyLinkedinUrl` or `companyLinkedinId`; `jobTitles` (`"*"` = everyone) or a saved `personaId`; `functions`, `seniorityLevels`, `includedLocations` / `excludedLocations`; `limit` (default 50, max 2,500); `live`; `scale` | People at one account with Pipecorn's qualification status. Creates a search on Pipecorn's side and polls it (every 15 s, up to 10 minutes). |

All the contact actions are synchronous waterfalls across Pipecorn's own providers. Rate limit: 60 calls a minute (spread).

## What it's for

- ✅ **Workspaces that already pay Pipecorn** — its waterfall on their contract, inside a Cargo play.
- ✅ **Buying-committee pulls on one account** — `findPeopleAtCompany` with a saved persona, then `findEmail` on the people who qualify.
- ✅ **Inbound resolution** — `reverseEmailLookup` on a signup address to learn who and where, before routing.
- ❌ **Cold first touch to a personal mailbox** — refused; see the gate above.
- ❌ **Workspaces with no Pipecorn account** — no credits connector exists. The credits work-email chain (`icypeas` 0.1 → `FullEnrich.findEmail` 1) covers the same stage.

## Patterns

### Pattern A — Work email from a LinkedIn URL

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"pipecorn","actionSlug":"findEmail"}' \
  --records '[{"linkedinUrl":"https://linkedin.com/in/alicesmith"},{"firstName":"Bob","lastName":"Jones","domain":"acme.com"}]' \
  --wait-until-finished
```

Route `email_status` through the VERIFY stage (`waterfall.verifyEmail`, 0.1) regardless — a provider grading its own find is not verification.

### Pattern B — Persona-matched people at one account

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"pipecorn","actionSlug":"findPeopleAtCompany"}' \
  --data '{"companyLinkedinUrl":"https://linkedin.com/company/acme","seniorityLevels":["220","300","310"],"functions":["25"],"limit":25}' \
  --wait-until-finished
```

`functions` and `seniorityLevels` take LinkedIn's numeric ids as strings (`25` Sales, `8` Engineering; `220` Director, `300` VP, `310` CXO — the full lists are in the action's schema via `connection integration get pipecorn`).

## Common pitfalls

- **`live: true` searches through the Pipecorn account's synced LinkedIn session** — a real member identity. Leave it off (the default searches Pipecorn's database and needs no session), and never fan it out across a list.
- **`jobTitles` and `personaId` are exclusive, and one filter is required.** A persona replaces titles and excluded titles, so sending both is rejected; so is a search with no people filter at all (titles, persona, functions, seniority or locations). Use `jobTitles: "*"` to mean everyone, deliberately.
- **`findPeopleAtCompany` can outlive the node.** After 40 polls (10 minutes) the search is reported rather than waited for — re-run it, don't assume it was empty.
- **`findEmail` without a LinkedIn URL needs a name and a company.** The schema refuses a bare name.

## Anti-patterns

- **`findPhoneAndEmail` "to be thorough".** Phone is explicit-request-only on qualified leads ([`../references/cost-discipline.md`](../references/cost-discipline.md) §5); call `findEmail` unless the user asked for phone.
- **Running it beside the credits chain on the same rows.** Pick the waterfall the workspace pays for; running both bills twice for overlapping coverage.

## Position in the waterfall

- **CONTACT stage, own-key alternative** to the credits email chain (`icypeas` 0.1 → mid-tier 0.5 → `FullEnrich.findEmail` 1) and phone chain (`aiArk.findMobilePhone` 0.5 → `prospeo` 3 → …). Either way the output feeds VERIFY before any send.
- `reverseEmailLookup` sits at ENRICH (person) for inbound; `enrichAccount` at ENRICH (company), behind `aiArk.enrichCompany` (0.01) when cost is the question.

## Recurring use

- **No scheduled fit for the contact actions** — per-record lookups, billed on your Pipecorn account on every call that finds something.
- **In-play gate: attempt timestamp, not empty output.** "Run where `email` is empty" re-calls the rows Pipecorn can't cover on every evaluation; stamp a lookup-attempted-at column and gate on it.
- **`findPersonalEmail` never runs on a schedule.** It belongs downstream of a job-change signal ([`../recipes/job-change-monitoring.md`](../recipes/job-change-monitoring.md)) on known contacts only, one wave at a time.

## Action shape

`{"kind":"connector","integrationSlug":"pipecorn","actionSlug":"<slug>"}`. With no credits connector possible, the run uses the workspace's own-key Pipecorn connector. **No `connectorUuid` in `config`.**
