# Acceptable use — basis, suppression, and volume gates

Canonical people-data rules for this skill. Recipes and playbooks link here instead of restating them. These are **mandatory behaviors**, the same tier as [`cost-discipline.md`](cost-discipline.md): an agent that skips the basis check or writes around a suppression list is misusing the skill.

Scope: every step that touches a person — sourcing, enrichment, verification, personalization, sequencer handoff, ads activation. Not legal advice; the user's counsel owns the final call on their jurisdiction and lawful basis.

## 1) What this skill is for

Business-to-business revenue work, on business identities, using data the workspace is licensed to receive through the providers in [`../provider-playbooks/`](../provider-playbooks/). The unit of work is a **qualified account and the person whose professional role makes them a plausible buyer** — a list that has been filtered, scored, and costed before anyone is contacted.

It is not a bulk-messaging tool. Nothing in *this* skill sends mail: the outreach recipes stop at send-ready variables and hand off to a sequencer, under that sequencer's sending limits and identities. Where that sequencer is Cargo's own — a mailbox the workspace provisioned through [`../../cargo-mailbox-management/SKILL.md`](../../cargo-mailbox-management/SKILL.md) — nothing on this page relaxes: the three checks in §3 run before the first send, the mailbox's warm-up ramp is the ceiling, and an unsubscribe writes a workspace-wide suppression that no later send may work around. Cargo owning the inbox changes who presses send, not whether the message should be sent.

## 2) Hard refusals

Do not execute these. Say which rule applies in one sentence, offer the compliant version, and move on — state it once, don't lecture.

| Request | Why it's refused |
|---|---|
| "Email everyone at every company in `<industry>`" — undifferentiated fan-out with no qualification step | Volume in place of relevance is the definition of spam; propose the scored, filtered slice instead |
| Consumer or private-individual targeting — personal life, home contact details, audiences with no business role | This skill covers B2B professional identities only |
| A list whose origin the user can't state — purchased lists, lists exported from a former employer, data taken from a platform in breach of its terms | No lawful basis, and every downstream provider ToS forbids it |
| Contacting anyone on the workspace's unsubscribe / do-not-contact / hard-bounce list | Suppression is absolute; re-contact is a violation, not an optimization |
| Evasion: rotating sending domains or identities to dodge filters, disguising the sender, misleading subject lines, fake `Re:` threads on a first touch, forged headers | Deception is prohibited independently of volume |
| Auto-dialing, SMS blasts, or a full-list phone sweep | Phone is explicit-request-only on qualified leads — see [`cost-discipline.md`](cost-discipline.md) §5 |
| Batch-blasting LinkedIn engagement actions (`connectProfile`, `commentPost`) across a raw list | They act as a real member identity — see [`../provider-playbooks/linkedin.md`](../provider-playbooks/linkedin.md) |
| Scraping a site in breach of its terms or `robots.txt` when a licensed provider action covers the same field | Use the provider action; if none exists, say so rather than routing around the block |

## 3) Before any outreach step — three checks

Run these before the personalize stage of [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md), before an ads upload, and before any sequencer handoff. All three are free.

| Check | What to ask / verify | If it fails |
|---|---|---|
| **Basis** | Which basis covers this audience — existing customers, opted-in contacts, event attendees, or a documented legitimate-interest case for a B2B role? | Stop and ask. Don't assume legitimate interest because the record has a work email |
| **Suppression** | Filter the segment on the workspace's unsubscribe / DNC / hard-bounce columns *before* enriching or sending | If no such column exists, flag it as a real gap and offer to add one — don't proceed silently |
| **Relevance** | Can you name, per recipient, why this message is for them? The signal in the segment is usually the answer | If the honest answer is "they matched an industry filter", the list isn't ready — tighten it |

## 4) What every message must carry

The skill drafts copy; these are the properties that copy must have before the user's sequencer sends it.

- **Accurate identity** — real sender, real company, headers and subject line that describe the message honestly.
- **A working opt-out**, honored promptly and permanently. Under CAN-SPAM that's a mechanism valid ≥30 days and processed within 10 business days; under GDPR/ePrivacy an objection is immediate.
- **A physical postal address** where the sender's jurisdiction requires one (CAN-SPAM does).
- **Per-recipient relevance** — the personalization prompts in [`prompt-library/personalization.md`](prompt-library/personalization.md) exist for this. A prompt that produces the same sentence for every row is a signal the list is wrong, not that the prompt needs rewriting.

## 5) Data hygiene

- **Verify before you send.** `waterfall.verifyEmail` / `icypeas` aren't only a deliverability lever — mailing unverified addresses is how a list starts hitting spam traps.
- **Record provenance.** Keep which provider supplied each contact field and when. An access or erasure request can't be honored on a column with no origin.
- **Propagate erasure and opt-out.** On request, delete — and dedupe the *next* sourcing run against the suppression list, not just against the Contacts model, so a suppressed person doesn't re-enter as a "new" lead.
- **Don't hoard.** Enriched personal data the workspace isn't actively working is cost and liability at once; drop the rows that didn't qualify.

## 6) Volume and cadence

- Respect the sequencer's and mailbox's own limits — this skill never proposes raising them, and a request to work around them is an evasion refusal under §2. On a Cargo-owned mailbox that limit is the warm-up ramp (5/day rising to 40/day over 45 days, read with `mailbox get-send-allowance`): it is a ceiling, not a target, and spreading one campaign across extra mailboxes to clear the same volume is the same refusal wearing a fleet — see [`../../cargo-mailbox-management/references/warmup-and-allowance.md`](../../cargo-mailbox-management/references/warmup-and-allowance.md).
- One campaign per contact at a time; cap the touch count; **stop on reply, opt-out, or bounce**.
- Cadence on recurring plays is a spend gate *and* a contact-frequency gate — a play that re-enrolls the same segment weekly is re-contacting the same people weekly. Check the provider playbook's **Recurring use** section before scheduling.

## 7) Cross-references

- Spend gates and the approval message: [`cost-discipline.md`](cost-discipline.md)
- Ads consent and the removal path: [`../recipes/ads-audience-activation.md`](../recipes/ads-audience-activation.md)
- Sending from a Cargo-owned mailbox — warm-up ramp, suppression list, delivery events: [`../../cargo-mailbox-management/SKILL.md`](../../cargo-mailbox-management/SKILL.md)
- Personal-mailbox routing: [`../provider-playbooks/forager.md`](../provider-playbooks/forager.md)
- LinkedIn identity limits: [`../provider-playbooks/linkedin.md`](../provider-playbooks/linkedin.md)
