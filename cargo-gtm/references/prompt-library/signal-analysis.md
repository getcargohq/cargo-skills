# Prompt library — signal analysis

Prompts that convert a detected signal (job posting, funding round, tech-stack change, job change, public filing) into a sales hypothesis, timing window, or triage verdict. These sit between signal recipes (`funding-watch`, `job-change-monitoring`, `tech-intent`) and [`outreach-activation`](../../recipes/outreach-activation.md) — their outputs feed `signal_summary` and routing branches. Run with `temperature: 0`–`0.2` (bulk tier only — some judgment-tier models reject non-default sampling parameters with a 400; see [`../../provider-playbooks/anthropic.md`](../../provider-playbooks/anthropic.md) and omit the override when in doubt).

### job-posting-pain-hypothesis

**Purpose:** Read a job posting as a budget line against a problem — hypothesize the pain and whether it maps to your product. **Variables:** {{job_posting_text}}, {{your_product_summary}}. **Model guidance:** claude-sonnet-4-6 — hypothesis quality drives the whole outreach angle; claude-3-5-haiku-latest for high-volume pre-filtering. **Output:** JSON `{pain_hypothesis, posting_evidence, maps_to_product, outreach_angle}`.

```
From this job posting, hypothesize the business pain behind the hire and whether it maps to our product. Posting: {{job_posting_text}}. Our product: {{your_product_summary}}.

Read the responsibilities and requirements for what is breaking or scaling — a hire is a budget line against a problem. Output ONLY the JSON object: {"pain_hypothesis": "<one sentence grounded in the posting>", "posting_evidence": "<verbatim phrase from the posting>", "maps_to_product": <true|false>, "outreach_angle": "<one clause, or null>"}

Rules: posting_evidence must be quoted verbatim. If the posting is generic boilerplate with no specific responsibilities, set pain_hypothesis and outreach_angle to null and maps_to_product to false — do not manufacture pain.
```

### funding-budget-window

**Purpose:** Convert a funding round into a budget-timing verdict — when to sell into the new money. **Variables:** {{round_type}}, {{round_amount}}, {{announced_date}}, {{stated_use_of_funds}}, {{product_category}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{window, reasoning, use_of_funds_match}`.

```
Estimate the budget-timing window for selling {{product_category}} to a company that raised a {{round_type}} of {{round_amount}}, announced {{announced_date}}. Stated use of funds: {{stated_use_of_funds}}.

Frame: new-budget planning typically lands 1-3 months post-announcement; team build-out spending runs 3-9 months; consolidation pressure returns after 12. use_of_funds_match is true only if the stated use of funds literally names an area adjacent to {{product_category}} — do not stretch the mapping, and if the field is empty, set it false. If the announced date is missing or more than 18 months ago, output window "too_late". Output ONLY the JSON object: {"window": "act_now|1_3_months|3_9_months|too_late", "reasoning": "<one sentence>", "use_of_funds_match": <true|false>}
```

### tech-change-displacement

**Purpose:** Classify a detected tech-stack change as a displacement opportunity — open door, fresh incumbent, or replatform. **Variables:** {{added_technologies}}, {{removed_technologies}}, {{your_product_summary}}, {{competing_technologies}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{opportunity, trigger_technology, angle, revisit_in_months}`.

```
A company's detected tech stack changed. Added: {{added_technologies}}. Removed: {{removed_technologies}}. Our product: {{your_product_summary}}. Technologies we displace: {{competing_technologies}}.

Classify the opportunity: "open_door" = they removed a competing technology (the seat may be empty right now); "fresh_incumbent" = they just added a competing technology (bad timing — set revisit_in_months to 12); "stack_shift" = adjacent additions/removals suggesting a replatform we could ride; "none" = no relevant movement. Use only technologies literally present in the lists — never infer unlisted tooling from company type. Output ONLY the JSON object: {"opportunity": "open_door|fresh_incumbent|stack_shift|none", "trigger_technology": "<the technology, or null>", "angle": "<one sentence, or null>", "revisit_in_months": <number|null>}
```

### job-change-angle

**Purpose:** Turn a detected job change into a classified re-engagement play with a drafted hook. **Variables:** {{contact_name}}, {{new_title}}, {{new_company}}, {{previous_company}}, {{prior_relationship}}, {{product_category}}. **Model guidance:** claude-3-5-haiku-latest; claude-sonnet-4-6 for strategic accounts. **Output:** JSON `{play, hook, urgency}`.

```
{{contact_name}} moved from {{previous_company}} to become {{new_title}} at {{new_company}}. Prior relationship with us: {{prior_relationship}}. We sell {{product_category}}.

Classify the re-engagement play and draft the hook. Frame: new-in-role buyers rebuild their trusted stack in the first ~90 days; a past user or champion is warmest; a past evaluator who said no may now own a different budget; no relationship and no relevance = skip. Use only the facts given — do not assume they used our product at the previous company unless the prior relationship says so. Output ONLY the JSON object: {"play": "champion_landed|past_evaluator|cold_but_relevant|skip", "hook": "<one sentence, or null when play is skip>", "urgency": "high|medium|low"}
```

### filing-priorities-extraction

**Purpose:** Pull sales-anchorable priorities and risks from any long filing text — 10-K, 10-Q, annual report, earnings remarks. **Variables:** {{filing_text}}. **Model guidance:** claude-sonnet-4-6 — long-document salience ranking; use claude-3-5-haiku-latest only on short excerpts. **Output:** JSON `{priorities: [{theme, quote, type}], fiscal_context}` (max 5 priorities).

```
From this excerpt of a company filing or shareholder communication (10-K, 10-Q, annual report, earnings remarks), extract the stated business priorities and risks a seller could anchor outreach on: {{filing_text}}

Output ONLY the JSON object: {"priorities": [{"theme": "<short label>", "quote": "<verbatim supporting sentence from the text>", "type": "investment|efficiency|risk|growth"}], "fiscal_context": "<one clause on the period covered, or null>"}

Rules: maximum 5 priorities, ranked by prominence in the text (repetition and placement). Every quote must appear verbatim in the excerpt. Extract only what the text states — no industry-general assumptions, no outside knowledge of the company. If the excerpt contains no forward-looking priorities, output {"priorities": [], "fiscal_context": null}.
```

### signal-triage

**Purpose:** Given all signals detected for one account, decide act-now vs monitor vs ignore — with decay, compounding, and an ICP-fit gate. **Variables:** {{signals}}, {{icp_fit_score}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{verdict, primary_signal, reasoning}`.

```
Triage the signals detected for one account (one per line, each with a date): {{signals}}. Account ICP-fit score (1-10): {{icp_fit_score}}.

Rules: decay — a signal older than 90 days is context, never a trigger. Compounding — two independent fresh signals (e.g. funding + relevant hiring) outrank either alone. Fit gate — if ICP fit ≤ 4, the best verdict allowed is "monitor"; if ≤ 2, "ignore". Verdicts: act_now = at least one fresh trigger and fit ≥ 5; monitor = signals stale, weak, or fit-gated; ignore = nothing meaningful. Use only the listed signals — do not assume unlisted activity, and if the list is empty output "ignore". Output ONLY the JSON object: {"verdict": "act_now|monitor|ignore", "primary_signal": "<the signal, or null>", "reasoning": "<one sentence>"}
```
