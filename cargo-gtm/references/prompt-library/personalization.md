# Prompt library — personalization

Prompts for per-record LLM personalization steps (cold-email lines, connection notes, subject lines). Run through `anthropic.instruct` with the substituted prompt in each record's `prompt` field; `temperature: 0.3` is the proven default for this family (bulk tier only — some judgment-tier models reject non-default sampling parameters with a 400; see [`../../provider-playbooks/anthropic.md`](../../provider-playbooks/anthropic.md) and omit the override when in doubt). Every prompt returns plain text (or `NULL` when the inputs can't support a good line — filter those rows out before the sequencer sees them).

### cold-email-first-line

**Purpose:** Opening line of a cold email that references a live signal and ties it to a business outcome. **Variables:** {{first_name}}, {{last_name}}, {{title}}, {{company_name}}, {{signal_summary}}. **Model guidance:** claude-3-5-haiku-latest for bulk runs; claude-sonnet-4-6 only for small high-stakes lists. **Output:** one sentence, ≤30 words, plain text — or `NULL` if the signal is empty.

<!-- Canonical entry — ported from ../../recipes/outreach-activation.md step 5, with a hallucination guard added. -->

```
You are writing the opening line of a cold email. The recipient is {{first_name}} {{last_name}}, {{title}} at {{company_name}}. Signal triggering this outreach: {{signal_summary}}. Write ONE sentence that references the signal naturally and ties it to a relevant business outcome. No greeting. No follow-up. Use only facts stated in the signal — do not invent numbers, names, or dates. If the signal is empty or uninformative, output exactly: NULL. ≤30 words.
```

### job-change-follow-up-line

**Purpose:** Follow-up line to a contact who just changed jobs, anchored on a first-90-days priority. **Variables:** {{first_name}}, {{new_title}}, {{new_company}}, {{previous_company}}, {{relationship_context}}. **Model guidance:** claude-3-5-haiku-latest for bulk; claude-sonnet-4-6 for named accounts. **Output:** one sentence, ≤35 words, plain text.

```
Write ONE follow-up line to {{first_name}}, who recently became {{new_title}} at {{new_company}} after leaving {{previous_company}}. Prior relationship: {{relationship_context}}. Acknowledge the move without flattery clichés ("huge congrats", "exciting times") and connect it to a first-90-days priority a {{new_title}} typically owns. At most one question. Use only the facts given; if the prior relationship is empty, write the line without referencing any past interaction — do not invent one. ≤35 words. Output the sentence only, no greeting.
```

### funding-congrats-angle

**Purpose:** Funding-triggered opener that avoids the "congrats on the raise" template every other sender uses. **Variables:** {{company_name}}, {{round_type}}, {{round_amount}}, {{investors}}, {{stated_use_of_funds}}, {{your_value_prop}}. **Model guidance:** claude-3-5-haiku-latest; claude-sonnet-4-6 when the use-of-funds mapping needs judgment. **Output:** one sentence, ≤35 words, plain text.

```
{{company_name}} raised a {{round_type}} ({{round_amount}}; investors: {{investors}}; stated use of funds: {{stated_use_of_funds}}). Write ONE opening sentence for a cold email. Banned: "congrats", "congratulations", "exciting", "huge news", and any sentence whose grammatical subject is the raise itself. Lead instead with the operational consequence — what the money lets them do next quarter — and connect it to {{your_value_prop}}. Use only the facts provided; if the stated use of funds is empty, anchor on the round stage — infer nothing else. ≤35 words. Output the sentence only.
```

### linkedin-connection-note

**Purpose:** Connection-request note that fits LinkedIn's hard character limit and doesn't pitch. **Variables:** {{first_name}}, {{title}}, {{company_name}}, {{reason_for_connecting}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** plain text, ≤300 characters (hard limit).

```
Write a LinkedIn connection request note to {{first_name}}, {{title}} at {{company_name}}. Reason for connecting: {{reason_for_connecting}}. Requirements: 300 characters maximum (hard limit), no "I'd love to", no pitch, no links, one concrete reason they would plausibly accept. Sound like a person, not a sequence. Use only the facts given — do not invent shared connections, events attended, or content they posted. Output the note text only.
```

### subject-line-variants

**Purpose:** Three deliberately different subject-line styles for the same email, ready for A/B rotation. **Variables:** {{first_line}}, {{signal_summary}}, {{company_name}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON array of exactly 3 strings.

```
Given this cold-email opening line: "{{first_line}}" (signal: {{signal_summary}}, company: {{company_name}}), write 3 subject-line variants: (1) a 2-4 word internal-memo style, lowercase; (2) a specific noun phrase referencing the signal, ≤6 words; (3) a question, ≤7 words. No clickbait, no "quick question", no emoji, no recipient name. Use only facts present in the inputs — do not add claims the opening line does not make. Output ONLY a JSON array of 3 strings, e.g. ["...","...","..."].
```

### reengagement-opener

**Purpose:** First line to a stale contact where a fresh signal — not "checking in" — is the reason for writing. **Variables:** {{first_name}}, {{last_touch_summary}}, {{months_since_contact}}, {{fresh_signal}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** one sentence, ≤35 words — or `NULL` when there is no fresh signal.

```
Write ONE re-engagement opening line to {{first_name}}. Last interaction ({{months_since_contact}} months ago): {{last_touch_summary}}. What changed since: {{fresh_signal}}. The line must (a) show memory of the last interaction in a half-clause, and (b) make the fresh signal the reason for writing today — the signal is the news, not the sender. Banned: "circling back", "bubbling this up", "touching base", apologies for the silence. Use only the facts given; if the fresh signal is empty, output exactly: NULL — never send signal-less re-engagement. ≤35 words. Output the sentence only.
```

### proof-point-bridge

**Purpose:** One sentence bridging a customer proof point into the prospect's situation without "we helped X do Y" framing. **Variables:** {{prospect_situation}}, {{customer_name}}, {{proof_point}}. **Model guidance:** claude-3-5-haiku-latest; claude-sonnet-4-6 when the parallel is non-obvious. **Output:** one sentence, ≤35 words — or `NULL` if the proof point has no concrete outcome.

```
Write ONE sentence bridging a customer proof point into a cold email. Prospect situation: {{prospect_situation}}. Proof: {{customer_name}} — {{proof_point}}. Structure: name the parallel between the customer and the prospect first, then the outcome — never "We helped X do Y". Keep every number exactly as written in the proof point; do not round, extrapolate, or add metrics that are not there. If the proof point contains no concrete outcome, output exactly: NULL. ≤35 words. Output the sentence only.
```
