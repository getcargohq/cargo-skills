# Prompt library — qualification

Prompts that normalize messy people-data (titles, locations) into fixed labels and qualify contacts for outreach. These are classification tasks — run through `anthropic.instruct` with `temperature: 0` (bulk tier only — some judgment-tier models reject non-default sampling parameters with a 400; see [`../../provider-playbooks/anthropic.md`](../../provider-playbooks/anthropic.md) and omit the override when in doubt) so the same title always maps to the same label. Outputs are enum-constrained for downstream branch/filter nodes.

### seniority-normalization

**Purpose:** Map any job title — any language, any convention — to one of six fixed seniority levels. **Variables:** {{title}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** exactly one label: `C-Level`, `VP`, `Director`, `Manager`, `IC`, or `Other`.

```
Map the job title "{{title}}" to exactly one seniority level: C-Level, VP, Director, Manager, IC, Other. Rules: founders, owners, partners, and presidents = C-Level. "Head of" = Director, unless the scope is clearly company-wide at a small firm (then VP). "Lead", "Principal", "Staff" = IC (technical track), unless followed by a team noun ("Lead, Sales Development" = Manager). "Deputy", "Associate", "Assistant" demote one level from the base title. Non-English titles: translate first, then map. Judge only from the title text — make no assumptions about company size unless the title states it. Empty or unmappable titles = Other. Output exactly one label, nothing else.
```

### buying-committee-role

**Purpose:** Guess a contact's buying-committee role (economic buyer / champion / user / blocker / influencer) for a given product category. **Variables:** {{title}}, {{department}}, {{product_category}}. **Model guidance:** claude-3-5-haiku-latest; claude-sonnet-4-6 for complex enterprise committees. **Output:** JSON `{role, confidence, reasoning}`.

```
Guess this person's most likely buying-committee role for a {{product_category}} purchase. Title: "{{title}}", department: {{department}}. Roles: economic_buyer (owns the budget line), champion (drives the evaluation because they feel the pain), user (hands-on with the product daily), blocker (gatekeeps — security, legal, procurement, IT admin), influencer (consulted, owns nothing). Pick ONE primary role using only title and department evidence: seniority plus how close the function sits to {{product_category}}. Do not assume an org structure the title does not imply. If title and department are both empty, or they contradict each other, output role "unknown". Output ONLY the JSON object: {"role": "economic_buyer|champion|user|blocker|influencer|unknown", "confidence": "high|medium|low", "reasoning": "<one clause>"}
```

### decision-maker-likelihood

**Purpose:** Estimate 0-100 whether a title can approve or veto a purchase, given company size and price band. **Variables:** {{title}}, {{employee_count}}, {{product_category}}, {{price_band}}. **Model guidance:** claude-sonnet-4-6 — this is a judgment call across three interacting factors; claude-3-5-haiku-latest acceptable for bulk triage. **Output:** JSON `{likelihood, confidence, reasoning}`.

```
Estimate the likelihood (0-100) that a "{{title}}" at a {{employee_count}}-person company can approve or veto a {{product_category}} purchase priced around {{price_band}}. Weigh: (a) whether the function that owns {{product_category}} typically reports through this title; (b) company size — at <100 employees, function leaders buy directly; at >1,000 the same title often sits two levels from budget; (c) the price against typical discretionary limits for that level. Use only the inputs given — if employee count or price band is empty, widen your uncertainty and cap confidence at "low" instead of assuming typical values. Output ONLY the JSON object: {"likelihood": <0-100>, "confidence": "high|medium|low", "reasoning": "<one sentence>"}
```

### geo-territory-normalization

**Purpose:** Parse a raw location string and assign it to exactly one territory from a provided list. **Variables:** {{raw_location}}, {{territory_list}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{city, country_code, territory}`.

```
Normalize the location string "{{raw_location}}" and assign it to one territory from this list: {{territory_list}}

Steps: (1) parse city / region / country from the raw string, expanding abbreviations (UK → United Kingdom, SF → San Francisco; DACH stays a region); (2) resolve the country to its ISO 3166-1 alpha-2 code; (3) match to exactly one listed territory. Match only against the listed territories — never output a territory that is not in the list. If the location is ambiguous between countries (e.g. "Cambridge" alone), empty, or fictional, set country_code null and territory "unassigned" — do not pick between candidates. Output ONLY the JSON object: {"city": <string|null>, "country_code": <string|null>, "territory": "<listed territory or unassigned>"}
```

### job-function-classification

**Purpose:** Classify a job title into one of fifteen fixed functions for routing and segmentation. **Variables:** {{title}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{function, confidence}`.

```
Classify the job title "{{title}}" into exactly one function: Sales, Marketing, Engineering, Product, Design, Data, IT, Finance, HR, Legal, Operations, Customer Success, Support, Executive (general management only — CEO, COO, GM), Other. Rules: classify by what the person does, not the first department word — "Marketing Engineer" = Engineering; ops-of-a-function titles ("Sales Operations", "Marketing Ops") = Operations. For hybrid titles ("Product & Engineering"), pick the function listed first. C-suite functional titles (CFO, CMO, CTO) map to their function, not Executive. Judge from the title text only; empty or meaningless titles = Other. Output ONLY the JSON object: {"function": "<label>", "confidence": "high|medium|low"}
```

### title-red-flag-check

**Purpose:** Catch contacts who should never enter a B2B sequence — students, job-seekers, agencies, joke titles. **Variables:** {{title}}, {{headline}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** one line — `EXCLUDE: <flag> — <evidence>` or `KEEP`.

```
Check whether this title/headline indicates a person to exclude from B2B outreach. Title: "{{title}}". Headline: "{{headline}}". Red flags: student, intern, or apprentice; retired / "former" / "ex-" with no current role; freelancer, consultant, or agency serving many clients (not an in-house buyer); actively job-seeking ("open to work", "seeking opportunities"); investor- or advisor-only portfolios; obviously fake or joke titles ("Chief Vibes Officer" with no real role attached). Flag only on explicit evidence in the given text — a short, vague, or missing headline is NOT by itself a red flag. Output exactly one line, nothing else: "EXCLUDE: <flag> — <the evidence text>" or "KEEP".
```
