# Sending domains

The domain half of a fleet. [`warmup-and-allowance.md`](warmup-and-allowance.md) sizes capacity in
mailboxes; this page is where those mailboxes live, what it costs, and the two choices that decide
whether the fleet lands in inboxes.

`domainManagement` has no `cargo-ai` command surface. Everything here is either a direct API call or
a CDK declaration.

## Checking availability and price

The only way to price a domain before buying it:

```http
GET /v1/domainManagement/domains/search?name=tryacme.com
Authorization: Bearer <accessToken>
selected-workspace-uuid: <workspace uuid>

-> { "name": "tryacme.com", "available": true, "priceCredits": 1200 }
```

The token is in `~/.config/cargo-ai/credentials.json` after `cargo-ai login`.

**`priceCredits: null` does not mean free.** It means the domain is not purchasable through Cargo:
either unavailable, or premium-priced above the configured ceiling. Read `null` as unavailable.

Never present a candidate name without having checked it. An unavailable name is not a choice the
user can make, and quoting a guessed price on a domain is how a fleet gets approved on a number
nobody can honour.

## Sizing: mailboxes are capacity, domains are blast radius

Capacity comes from mailboxes (`40 × mailboxes` at steady state). Domains come from how much you are
willing to lose at once:

```
mailboxes = ceil(target_daily_sends / 40)
domains   = ceil(mailboxes / mailboxes_per_domain)     # 3 is the recommendation
```

**A domain that gets flagged takes every mailbox on it.** So `mailboxes_per_domain` is a blast-radius
decision before it is a cost one. Three is the starting recommendation: packing more onto one domain
is a supported choice with a stated cost, and going to one mailbox per domain wastes a registration.

Worth working the arithmetic out loud, because the shape is what makes the number defensible:

> 500 sends a day needs 13 mailboxes, so 5 domains at 3 each, which is 15 mailboxes and a ceiling of
> 600 a day. The 100 of headroom is the margin for a mailbox that has to be pulled.

Then the part the arithmetic does not say: **the ceiling arrives 45 days after warm-up starts, not on
deploy day.** Give the calendar date. A fleet approved the week a campaign launches carries
`5 × mailboxes` that week.

## Never send from the primary domain

The fleet exists so that a burned sending domain is a disposable one. Put the company's own domain in
it and a bad campaign takes the company's real mail with it: invoices, password resets, recruiting.

Derive the primary domain from the signed-in address (`cargo-ai whoami`) and confirm it rather than
asking. It is the one domain that must never be in the fleet, and it is the redirect target below.

## Forward the apex

A lookalike domain that serves nothing is a parked page, and a parked page is a signal in its own
right to both filters and to a prospect who types the domain out of a From header.

`redirectUrl` on `defineDomain` forwards the apex to the real site. It is one line and it is the
difference between a domain that looks owned and one that looks bought.

## DMARC starts at `none`

`dmarcEmail` is the `rua=` mailbox that receives aggregate reports. `dmarcPolicy` is the `p=` tag:
what receivers do with mail that fails authentication.

| `p=` | Receiver behaviour on a failing message |
| --- | --- |
| `none` | deliver as normal and report it (monitor-only) |
| `quarantine` | treat as suspicious, usually the spam folder |
| `reject` | refuse at SMTP |

Start at `none` with a reporting mailbox, and tighten to `quarantine` and then `reject` once the
reports come back clean. `none` is not weakness: it publishes the record and starts the reports while
the fleet has no sending history to judge.

**Enforcing before SPF and DKIM are proven blackholes your own mail, and Cargo does not see the
bounce.** The domain keeps reporting `active` and so does every mailbox on it.

Two things about `rua=`: the mailbox has to actually accept mail or the reports bounce, and pointing
several domains at one address on a *different* domain requires a `_report._dmarc` authorisation
record on the receiving domain. A fleet of six lookalikes all reporting to the primary needs six of
them, or the receivers that enforce cross-domain reporting drop the reports.

## Do not declare `dnsRecords` on a sending domain

`dnsRecords` is the whole zone, not a patch. Declaring it replaces every live record, including the
MX and DKIM records the registrar wrote at purchase and the mailboxes depend on.

The failure is silent in the worst way: the domain stays `active`, every mailbox stays `active`, and
mail stops arriving. `redirectUrl`, `dmarcEmail` and `dmarcPolicy` are additive and are the supported
way to configure the zone.

## Naming

Build the name from the brand, not near it:

| Pattern | On `acme.com` | Reads as |
| --- | --- | --- |
| verb prefix | `tryacme`, `useacme` | a product page |
| preposition | `withacme`, `joinacme` | natural English |
| suffix | `acmehq`, `acmeteam` | the company, not a campaign |
| verb compound | `workwithacme`, `runacme` | obviously owned |

Rules that are not taste:

- **Stay on `.com`.** Alternative TLDs carry worse default reputation at several filters, and `.com`
  is what a human expects from a company. A cheaper TLD is not a saving.
- **No hyphens, no digits.** `get-acme.com` and `acme01.com` are spam-filter patterns.
- **No near-typos of the primary.** `acmme.com` and `acrne.com` read as phishing, because that is
  what phishing uses. The fleet should look owned, not almost-right.
- **Say it out loud.** A name that cannot be dictated on a phone call cannot be repeated by a
  prospect.
- **Check the history.** A domain that was registered and dropped can arrive carrying someone else's
  reputation, and the fleet inherits it silently.

Generate about twice as many candidates as domains needed, because availability removes some. A list
the user already holds skips generation, but not the availability check and not the spend approval.

## What it costs

Two charges with different shapes, and conflating them is how a fleet gets approved on the wrong
number.

| | Domain | Mailbox |
| --- | --- | --- |
| Shape | one-time registration, then annual renewal | recurring **every month** until removed |
| Quote from | `domains/search` (above), live | `cargo-ai mailboxManagement pricing get`, live |
| Stopping it | let the renewal lapse | `mailbox remove` only — there is no pause |

Sends are billed separately, per message, through the `sendEmail` orchestration action. Volume is the
cheap part; the fleet is not.

Present one-time and recurring as two separate lines, multiply the recurring by twelve so the annual
shape is visible, and get an explicit yes before the first registration. The spend rules are
[`../../cargo-gtm/references/cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md).

## The refusal that comes first

A fleet sized to a volume target rather than to a qualified audience is the volume-in-place-of-
relevance refusal, and spreading one campaign across a fleet to clear what a single mailbox's ramp
would not allow is the evasion case
([`../../cargo-gtm/references/acceptable-use.md`](../../cargo-gtm/references/acceptable-use.md) §2).
Size the audience first. Every mailbox is a real person under a real identity; a fabricated sender is
a §2 refusal and also the fastest way to fail a recipient who searches the name.
