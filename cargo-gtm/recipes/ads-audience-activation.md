# Recipe — Paid ads audience activation

Use this recipe when the user wants to turn a Cargo segment into a **paid-media targeting audience**: Google Ads Customer Match or LinkedIn Matched Audiences. Typical asks: "upload this list to Google Ads", "retarget our Closed-Lost accounts on LinkedIn", "build a lookalike seed from our best customers", "suppress current customers from our ad spend", "why is our match rate so low".

This is the activation channel that sits beside outbound. Same audience, different destination: [`outreach-activation.md`](outreach-activation.md) hands a segment to a sequencer; this one hands it to an ad platform.

## What Cargo supports

Two connectors, both **own-key** (no Cargo credits — you pay the ad platform, not us):

| Integration | Actions |
|---|---|
| `googleAds` | `createAudience`, `addContactToAudience`, `removeContactFromAudience`, `createReport` |
| `linkedinMatchedAudience` | `createAudience`, `addCompanyToAudience`, `addContactToAudience`, `removeEmailFromAudience`, `createReport` |

LinkedIn is the only one of the two that takes **company** rows (`addCompanyToAudience`) — that is the ABM path, and it needs no personal data at all. Google Customer Match is person-only.

> **No Meta/Facebook connector exists in the catalog.** If the user asks for Meta Custom Audiences, say so plainly and offer the two above, or an export ([`../../cargo-analytics/SKILL.md`](../../cargo-analytics/SKILL.md)) they upload manually. Do not improvise an HTTP node against the Marketing API.

## Before you start — consent and suppression

Ad platforms treat uploaded lists as customer data. Both Google and LinkedIn require that you have a lawful basis and a direct relationship with the people you upload.

1. **Ask which basis applies** — customers, opted-in contacts, or event attendees. Purchased or scraped lists are a policy violation on both platforms; if that is what the segment is, stop and say so.
2. **Exclude opt-outs.** Filter the segment on the workspace's unsubscribe/do-not-contact column before uploading. If no such column exists, flag it — this is a real gap, not a detail.
3. **Coverage, not completeness.** Match rates of 30–70% are normal. Never chase 100% by adding more enrichment rungs; see step 5.

## Step 1 — Pick the audience

Start from a segment, not a raw model — the audience needs to be reproducible.

```bash
cargo-ai segmentation segment list                      # existing audiences
cargo-ai segmentation segment get <segment-uuid>        # recordsCount = the real size
```

Sizing gates worth stating up front: **Google Customer Match needs ~1,000 matched members** before a list will serve, **LinkedIn needs ~300**. A 400-row segment is fine for LinkedIn and useless for Google. Say this before enriching anything.

See [`../../cargo-segmentation/SKILL.md`](../../cargo-segmentation/SKILL.md) for building the segment and for `--tracking-column-slugs` if the audience should stay in sync.

## Step 2 — Decide the identifier, then enrich only for it

Match rate is a function of which identifiers you send. Send what the platform actually keys on:

| Destination | Best identifier | Second | Do not bother |
|---|---|---|---|
| Google Customer Match | **Personal email** | Phone (E.164), then first/last + country + postal code | Work email alone often matches poorly |
| LinkedIn — contacts | **Any email on file** | — | Phone (unsupported) |
| LinkedIn — companies | **Company name + domain** | LinkedIn company page URL | Any personal data |

Two consequences that save real money:

- **The ABM path needs no contact enrichment at all.** If the user wants account targeting on LinkedIn, `addCompanyToAudience` takes `companyName` (+ optional `companyWebsiteDomain`, `companyPageUrl`, `industries`, `city`, `state`, `country`) — a company segment is already sufficient. Do not run a contact waterfall for it.
- **Personal email is a different lookup from work email.** The standard find-email chain returns *work* addresses — including `aiArk.enrichPerson` (0.1 from a LinkedIn URL, and the right pick when a work address is enough, as it is for LinkedIn Matched Audiences). The personal mailbox needs [`forager.findPersonalEmail`](../provider-playbooks/forager.md) (2, LinkedIn URL in), which is the only action in the catalog that offers it. Reach for it only when the destination is Google Customer Match and the probe in step 5 shows work addresses matching poorly — 2 credits/row is a real budget line at audience scale.

Where enrichment *is* needed, follow the normal chain in [`../guides/enriching-and-researching.md`](../guides/enriching-and-researching.md) and the cost gates in [`../references/cost-discipline.md`](../references/cost-discipline.md) — pilot 1–3 rows, present the approval message, then run.

Do **not** verify emails for an ads upload. `waterfall.verifyEmail` protects sender reputation; ad platforms do not bounce, so verification here is spend with no return.

## Step 3 — Hashing

**Do not hash anything yourself.** Both connectors take plaintext identifiers and hash them in transit as each platform requires. A pre-hashed value gets hashed again and matches nothing — a silent, total failure that looks like a bad audience.

If the user arrives with an already-hashed list from elsewhere, that list cannot be used through these connectors; you need the plaintext source.

## Step 4 — Create the audience, then fill it

Create once, then batch the members in. Both `createAudience` calls return the id that every subsequent call needs.

**Google Ads:**

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"googleAds","actionSlug":"createAudience"}' \
  --data '{
    "customerId": "123-456-7890",
    "name": "Closed-Won lookalike seed 2026-Q3",
    "membershipLifeSpan": 540
  }' --wait-until-finished
```

**Every field below goes in `--data` / `--records`, never in the action's `config`** — a top-level action carries no `config` at all. Older backends reject inputs placed there; newer ones silently drop them and run the action with nothing, which here means an audience created with no name or an upload that adds no members. (Inside a workflow **node** these same fields are the node's `config`.)

`membershipLifeSpan` is in days; `540` is the maximum and the right default for a seed list. Use a short span (30–90) only for a genuinely time-boxed retargeting pool.

Then fan the segment across `addContactToAudience`, which needs `customerId` + `userListId` plus at least one identifier (`email`, `phoneNumber`, `mobileId`, or the address triple `firstName`/`lastName`/`countryCode`/`postalCode`):

```bash
# Pull the audience from the segment, then shape one record per member.
cargo-ai segmentation segment fetch --model-uuid <uuid> \
  --filter '<segment filter json>' --fetching-limit 20 > /tmp/audience.json

cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"googleAds","actionSlug":"addContactToAudience"}' \
  --records "$(jq -c '[.records[] | {
    customerId: "123-456-7890",
    userListId: "987654321",
    email: .personal_email
  }]' /tmp/audience.json)" \
  --wait-until-finished
```

`action execute-batch` takes `--records` only — there is no `--model-uuid`/`--filter` form, and `{{record.…}}` expressions resolve inside a **node graph**, not in a top-level action. Fetch the rows first (as above), or build the graph as a play/tool when this should run on a schedule.

**LinkedIn Matched Audiences** — same shape, different keys. `createAudience` takes `account`, `name`, and `type`; members take `accountUrn` + `audienceId`:

```bash
# Contacts (email-keyed)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"linkedinMatchedAudience","actionSlug":"addContactToAudience"}' \
  --records "$(jq -c '[.records[] | {
    accountUrn: "urn:li:sponsoredAccount:123456789",
    audienceId: "<id>",
    email: .email,
    firstname: .first_name,
    lastname: .last_name,
    companyName: .company_name
  }]' /tmp/audience.json)" \
  --wait-until-finished

# Companies (ABM — no personal data): fetch the account segment the same way
# (cargo-ai segmentation segment fetch --model-uuid <companies-model> … > /tmp/accounts.json)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"linkedinMatchedAudience","actionSlug":"addCompanyToAudience"}' \
  --records "$(jq -c '[.records[] | {
    accountUrn: "urn:li:sponsoredAccount:123456789",
    audienceId: "<id>",
    companyName: .name,
    companyWebsiteDomain: .domain
  }]' /tmp/accounts.json)" \
  --wait-until-finished
```

**Batch discipline applies here even though the actions are free.** Enroll 10–20 records first, confirm they land, then ask the user to approve the full enrollment — quoting the record count. A wrong `customerId`/`accountUrn` writes to the wrong ad account, and the fix is a manual cleanup in someone's ads console. See [`../../cargo-orchestration/SKILL.md`](../../cargo-orchestration/SKILL.md) → "Create a batch".

## Step 5 — Report the match rate, and interpret it

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"googleAds","actionSlug":"createReport"}' \
  --data '{"customerId": "123-456-7890", "userListId": "987654321"}' \
  --wait-until-finished
```

`linkedinMatchedAudience.createReport` takes `accountUrn` + `audienceId` and returns the same shape of answer.

Both platforms take **6–48 hours** to populate the match figure. A report run immediately after upload showing zero is expected, not a failure — tell the user that rather than re-uploading.

Reading the result:

| Symptom | Cause | Fix |
|---|---|---|
| Match rate under ~20% | Work emails against a consumer-keyed platform (Google) | Add a personal-email rung; do not add more work-email providers |
| Match rate 0% after 48h | Pre-hashed input, or wrong `customerId`/`accountUrn` | Re-upload plaintext to the verified account id |
| Audience won't serve | Below the platform minimum (~1,000 Google / ~300 LinkedIn) | Widen the segment; more enrichment on the same rows will not help |
| Rate dropped over time | `membershipLifeSpan` expiring members | Re-run the upload on a schedule |

Close with the standard receipt: rows attempted, rows accepted, matched members, match rate, credits spent on any enrichment (the upload itself is free), and what the number means for whether the campaign can run.

## Step 6 — Make it recurring

An audience uploaded once decays. When the segment is a live signal (new Closed-Won, new job changes, fresh intent), convert the chain into a scheduled play so members flow in as they qualify: [`save-as-play.md`](save-as-play.md).

Two rules for the recurring version:

- **Gate on segment membership changes, not a full re-upload.** Drive the play from the segment's change feed (`added` records) so each row uploads once instead of re-billing any enrichment step on every run.
- **Wire the removal path too.** `removeContactFromAudience` / `removeEmailFromAudience` on the `removed` kind is what keeps churned customers and opt-outs from being advertised to — the part everyone forgets, and the one with compliance consequences.

Watch the pipeline with an alert on the upload workflow's error rate: [`../../cargo-observability/SKILL.md`](../../cargo-observability/SKILL.md).

## Related

- [`outreach-activation.md`](outreach-activation.md) — same segment, outbound sequencer instead of ad platform.
- [`icp-discovery.md`](icp-discovery.md) — find the Closed-Won signals worth seeding a lookalike from.
- [`account-expansion.md`](account-expansion.md) — the contact-level counterpart of ABM company targeting.
