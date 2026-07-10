# Prompt library — lead scoring

Prompts that turn enriched records into scores, tiers, and disqualifications with explicit rubrics — so two runs on the same data agree. Run through `anthropic.instruct` with `temperature: 0` (0.2 max) (bulk tier only — some judgment-tier models reject non-default sampling parameters with a 400; see [`../../provider-playbooks/anthropic.md`](../../provider-playbooks/anthropic.md) and omit the override when in doubt); scoring wants determinism. All JSON outputs are parse-ready for downstream filter/branch nodes.

### icp-fit-score

**Purpose:** Score a company 1-10 against a written ICP definition with a fixed rubric. **Variables:** {{icp_description}}, {{company_name}}, {{company_summary}}, {{industry}}, {{employee_count}}, {{country}}. **Model guidance:** claude-3-5-haiku-latest for bulk sweeps; claude-sonnet-4-6 when the ICP has many soft, judgment-heavy criteria. **Output:** JSON `{score, rationale, missing_data}`.

```
Score how well this company fits the ICP, 1-10.

ICP definition: {{icp_description}}

Company: {{company_name}} — {{company_summary}}. Industry: {{industry}}. Employees: {{employee_count}}. Country: {{country}}.

Rubric: 9-10 = matches every stated ICP criterion; 7-8 = matches all hard criteria, misses one soft criterion; 5-6 = matches most hard criteria with one clear gap; 3-4 = misses multiple hard criteria; 1-2 = wrong market entirely. Score only against criteria stated in the ICP definition — do not add criteria of your own. If a field the ICP needs is empty, do not guess its value: list it in missing_data and score conservatively. Output ONLY the JSON object: {"score": <1-10>, "rationale": "<one sentence citing the deciding criteria>", "missing_data": ["<field>", ...]}
```

### tech-stack-fit-score

**Purpose:** Score fit from detected technologies — complementary tools raise it, incumbents cap it. **Variables:** {{detected_technologies}}, {{complementary_technologies}}, {{competing_technologies}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{score, complementary_matches, competing_matches, displacement_candidate, rationale}`.

```
Score tech-stack fit 1-10 for a company whose detected stack is: {{detected_technologies}}.

Technologies that indicate fit (we integrate with or build on): {{complementary_technologies}}. Technologies that indicate an incumbent solution we would displace: {{competing_technologies}}.

Scoring: each complementary match raises the score; a competing match caps the score at 6 (displacement candidate — flag it, score 5-6 only if complementary matches also exist, otherwise 3-4). No matches either way = 3. Match only technologies literally present in the detected list — do not infer unlisted tools from company type or industry. Output ONLY the JSON object: {"score": <1-10>, "complementary_matches": [...], "competing_matches": [...], "displacement_candidate": <true|false>, "rationale": "<one sentence>"}
```

### hiring-intent-strength

**Purpose:** Score how strongly job postings signal buying intent, weighted by recency and seniority. **Variables:** {{job_postings}}, {{relevant_functions}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{score, relevant_posting_count, evidence, rationale}`.

```
Assess hiring-intent strength 1-10 from these job postings (one per line: title, posted date, location): {{job_postings}}. Functions relevant to our product: {{relevant_functions}}.

Rubric: count postings in relevant functions, weighted by recency (≤30 days old = full weight, 31-90 days = half, older = ignore) and seniority (a leadership hire in a relevant function means they are building a team: +2). 0 relevant postings = 1. 1-2 recent = 4-5. 3-5 recent = 6-7. More than 5, or any leadership hire = 8-10. Use only the postings provided — if the list is empty, output score 1 with evidence []. Output ONLY the JSON object: {"score": <1-10>, "relevant_posting_count": <n>, "evidence": ["<title (age in days)>", ...], "rationale": "<one sentence>"}
```

### composite-priority-score

**Purpose:** Merge ICP, signal, and engagement sub-scores into a P1/P2/P3 outreach tier with deterministic tie-breaks. **Variables:** {{icp_fit_score}}, {{signal_strength_score}}, {{engagement_score}}. **Model guidance:** claude-3-5-haiku-latest (pure arithmetic + two rules). **Output:** JSON `{composite, tier, tie_break_applied}`.

```
Combine three sub-scores (each 1-10, already computed — do not re-derive them) into a priority tier for outreach. ICP fit: {{icp_fit_score}}. Signal strength: {{signal_strength_score}}. Engagement history: {{engagement_score}}.

Weights: composite = 0.5 × ICP + 0.35 × signal + 0.15 × engagement. Tiers: ≥8.0 = P1, 6.0-7.9 = P2, 4.0-5.9 = P3, <4.0 = park. Tie-breaks, applied only when the composite sits within 0.2 of a tier boundary: promote one tier if signal ≥ 8 (fresh signals decay — act on them); demote one tier if ICP ≤ 4 (signal never outranks fit). If any sub-score is missing or outside 1-10, output tier "park" with composite null — do not substitute a default. Output ONLY the JSON object: {"composite": <number|null>, "tier": "P1|P2|P3|park", "tie_break_applied": "<rule applied, or none>"}
```

### disqualification-check

**Purpose:** Hard-disqualifier gate to run before spending enrichment credits on a record. **Variables:** {{disqualifiers}}, {{company_name}}, {{company_summary}}, {{industry}}, {{employee_count}}, {{country}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** one line — `DISQUALIFY: <rule> — <evidence>`, `PASS`, or `PASS (unverified: <fields>)`.

```
Check this company against hard disqualifiers before any paid enrichment. Disqualifiers: {{disqualifiers}}

Company: {{company_name}} — {{company_summary}}. Industry: {{industry}}. Employees: {{employee_count}}. Country: {{country}}.

Apply ONLY the listed disqualifiers — do not invent additional ones. A disqualifier fires only on explicit evidence in the fields above; ambiguity or a missing field is never grounds to disqualify — flag it instead. Output exactly one line, nothing else: "DISQUALIFY: <which rule> — <the evidence>" or "PASS" or "PASS (unverified: <comma-separated fields that were empty>)".
```

### persona-title-fit

**Purpose:** Score how closely a job title matches a written buyer persona. **Variables:** {{persona_description}}, {{title}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{score, ambiguous, reason}`.

```
Score 1-10 how well the job title "{{title}}" matches this buyer persona: {{persona_description}}.

Rubric: 9-10 = the persona's title or a direct synonym; 7-8 = same function, one seniority level off; 5-6 = same function at the wrong level, or an adjacent function at the right level; 3-4 = adjacent function and wrong level; 1-2 = unrelated function. Judge from the title text alone — do not assume responsibilities the title does not state. If the title is an abbreviation you cannot expand with confidence, score 5 and set ambiguous true. Empty title = score 1. Output ONLY the JSON object: {"score": <1-10>, "ambiguous": <true|false>, "reason": "<one sentence>"}
```
