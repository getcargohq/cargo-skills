# Prompt library — company research

Prompts that turn raw research inputs (scraped website text, news lists, headcount data) into compact, structured company understanding. Run through `anthropic.instruct` with `temperature: 0`–`0.2` (bulk tier only — some judgment-tier models reject non-default sampling parameters with a 400; see [`../../provider-playbooks/anthropic.md`](../../provider-playbooks/anthropic.md) and omit the override when in doubt). Inputs are usually large — truncate scraped text to the first ~3,000 words before substitution; the signal is almost always in the top of the page.

### company-two-liner

**Purpose:** Say what a company does in exactly 2 plain sentences from its website text. **Variables:** {{website_text}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** exactly 2 sentences, plain text — or `NULL` for empty/error pages.

```
From this website text, state what the company does in exactly 2 sentences: sentence 1 = what they sell and to whom; sentence 2 = how they differ or what they replace. Plain declarative language — strip marketing adjectives ("leading", "revolutionary", "seamless"). Use only claims present in the text; if the text never says who the customer is, write "customer unclear from site" for that part rather than guessing. If the text is empty, an error page, or a domain-parking page, output exactly: NULL. Website text: {{website_text}}
```

### business-model-classification

**Purpose:** Classify the dominant business model with a confidence level and cited evidence. **Variables:** {{website_text}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{model, confidence, evidence}`.

```
Classify this company's business model from its website text. Categories: B2B SaaS, B2C SaaS, B2B services, B2C services, marketplace, e-commerce, hardware, fintech-regulated, nonprofit, other. Pick the ONE dominant model — the one driving revenue today, not an aspirational pivot. Base the choice only on evidence in the text: pricing pages, customer language ("for teams" vs "for you"), checkout vs book-a-demo CTAs, regulatory notices. If the text supports no category, use "other" with confidence "low" — do not classify from the company name alone. Output ONLY the JSON object: {"model": "<category>", "confidence": "high|medium|low", "evidence": "<one short phrase quoted from the text>"}. Website text: {{website_text}}
```

### competitive-positioning-summary

**Purpose:** Summarize how a company positions itself from its own scraped pages — category, who it attacks, differentiators. **Variables:** {{scraped_pages}}. **Model guidance:** claude-sonnet-4-6 — reading positioning between the lines is judgment-heavy. **Output:** exactly 3 bullets (`- ` lines) — or `NULL`.

```
From these scraped pages (homepage / product / comparison pages), summarize how the company positions itself: {{scraped_pages}}

Output exactly 3 bullets: (1) the category they claim for themselves; (2) who they position against — named competitors only if the text names them, otherwise the status quo or workflow they attack; (3) the 1-2 differentiators they repeat most often. Quote or closely paraphrase the text — do not add positioning they never state, and never name a competitor the text does not name. If the pages contain no positioning language at all, output exactly: NULL. Format: three lines, each starting with "- ".
```

### news-significance-filter

**Purpose:** Filter a company's news items down to the ones that matter for outreach, with a suggested acting window. **Variables:** {{news_items}}, {{relevance_criteria}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON array (possibly empty) of `{item, category, why_significant, outreach_window_days}`.

```
Filter these news items about one company down to the ones significant for sales outreach: {{news_items}}

Significant = matches these criteria: {{relevance_criteria}} (typically funding, leadership change, expansion, layoffs, product launch, regulatory event). Not significant: awards, listicles, minor partnerships, stock-price commentary, sponsored content. Judge each item only by its given headline and summary — do not enrich from outside knowledge, and do not upgrade an item's importance beyond what its own text states. Output ONLY a JSON array, possibly empty: [{"item": "<headline>", "category": "<event type>", "why_significant": "<one clause>", "outreach_window_days": <7|30|90>}]
```

### org-maturity-estimate

**Purpose:** Estimate go-to-market maturity from headcount distribution by function — absence of roles is itself the signal. **Variables:** {{headcount_distribution}}, {{total_employees}}. **Model guidance:** claude-3-5-haiku-latest; claude-sonnet-4-6 for unusual org shapes. **Output:** JSON `{stage, signals, sales_headcount_pct}`.

```
Estimate go-to-market maturity from this headcount distribution by function: {{headcount_distribution}} (total employees: {{total_employees}}).

Stages: "founder-led" = no dedicated sales or marketing headcount; "first-team" = sales and marketing exist but are <10% of headcount, no ops roles; "scaling" = dedicated ops/enablement roles appear, sales is 10-25% of headcount; "mature" = full GTM org with visible management layers. Reason only from the functions and counts provided — never infer functions absent from the distribution; their absence is itself the signal. If the distribution is empty or totals do not parse, output stage "unknown". Output ONLY the JSON object: {"stage": "founder-led|first-team|scaling|mature|unknown", "signals": ["<observation>", ...], "sales_headcount_pct": <number|null>}
```

### target-customer-inference

**Purpose:** Infer who a company sells to from case studies, logos, pricing tiers, and industry pages on its site. **Variables:** {{website_text}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{segments, named_customers, buyer_role_guess, evidence}`.

```
Infer who this company sells to from its website text (case studies, customer logos, pricing tiers, industry pages): {{website_text}}

Output ONLY the JSON object: {"segments": ["<segment, e.g. mid-market fintech ops teams>", ...], "named_customers": ["<company named in the text>", ...], "buyer_role_guess": "<job title or null>", "evidence": "<one short phrase quoted from the text>"}

Rules: named_customers must appear verbatim in the text — never add customers you know from memory. If the text names no customers, use []. If nothing indicates a target segment, use "segments": [] rather than guessing from the industry. buyer_role_guess only if the text addresses a role directly ("built for RevOps"); otherwise null.
```
