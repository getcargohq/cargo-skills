# Recipe — Human review loop

Use this recipe when a run produced output that needs **human judgment** before it can be trusted or sent, and that judgment should improve the next run rather than evaporate. Typical asks: "put these in a sheet so my team can review them", "read my feedback and fix the ones I marked", "these emails are too long — make that a permanent rule", "compare the two versions", "keep iterating until they're good".

This is the counterpart to [`../../cargo-diagnostics/SKILL.md`](../../cargo-diagnostics/SKILL.md). Diagnostics answers "why did the machine do the wrong thing" from telemetry. This recipe answers "the machine did something a human doesn't like" — where there is no error to trace, only taste, accuracy, and judgment.

## When to reach for it

Judgment output — LLM-written outreach, lead scores, qualification verdicts, extracted facts — has no ground truth in the run. `status: success` says the node executed, not that the answer was right. Any time the deliverable is a *claim* rather than a *lookup*, a review pass belongs between the run and the send.

Skip it for deterministic output (an email either verified or did not). Use the QA scripts instead: [`../references/contact-accuracy.md`](../references/contact-accuracy.md).

## Step 1 — Put the output where a human can mark it up

Never paste rows into the conversation for review. Get the run's output out, then into a surface the reviewer already uses.

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid <uuid> \
  --output-node-slug <slug> \
  --format json
# → { "url": "…signed…" }
```

Then either hand over the file, or push the rows into a sheet the team can edit:

```bash
cargo-ai orchestration action execute --action '{
  "kind": "connector",
  "integrationSlug": "googleSheets",
  "actionSlug": "insert",
  "config": {"spreadsheetId": "<id>", "worksheet": "review"}
}' --wait-until-finished
```

**Add three empty columns the reviewer fills in**, and say what each means:

| Column | Values | Meaning |
|---|---|---|
| `verdict` | `keep` / `fix` / `drop` | Is this row usable as-is? |
| `note` | free text | *Why* — the part that becomes the rule |
| `corrected` | free text | Optional: what it should have said |

`verdict` alone is nearly worthless for improving the next run. The `note` is the payload — "too long", "wrong person, this is a namesake", "the funding fact is from 2019" are each a different fix. Ask for it explicitly.

Post the sheet link where the reviewer will see it (`slack.postMessage`), rather than waiting silently.

## Step 2 — Read the marked-up rows back

```bash
# The extractor pulls the reviewed worksheet back into the workspace
cargo-ai connection integration get googleSheets   # confirm `fetchWorksheet` is available on the connector
```

Then read the reviewed rows and **group by the note, not by the row**. Twenty rows marked `fix` are rarely twenty problems; they are usually two or three, repeated. Report it that way:

> 14 of 40 marked `fix`. Three causes: 9 × "too long" (median 180 words vs the 90 asked for), 3 × wrong-person (all three are common-name collisions), 2 × stale funding fact.

That grouping is the whole value of the loop. A per-row fix list produces a per-row patch; a grouped diagnosis produces a prompt change.

## Step 3 — Turn each cause into the right kind of fix

Match the fix to the cause — most reviewer complaints are **not** prompt problems:

| Cause pattern | Right fix | Wrong fix |
|---|---|---|
| Style, length, tone, structure | Amend the prompt in [`../references/prompt-library/index.md`](../references/prompt-library/index.md) and re-run only the `fix` rows | Re-running everything |
| Wrong person / wrong company | An identity-validation step, not better wording — `scripts/validate-linkedin-names.ts`, `scripts/select-current-role.ts` | Telling the LLM to "be careful" |
| Stale or invented facts | Ground the prompt in a retrieved field and require a source; drop rows where the field is empty | Raising the temperature or the model tier |
| Right answer, wrong rows in scope | Tighten the segment, not the prompt ([`../../cargo-segmentation/SKILL.md`](../../cargo-segmentation/SKILL.md)) | Post-filtering the output |
| Genuinely borderline, reviewer split | Leave it; add it to the eval set below rather than over-fitting | Writing a rule for one row |

**Re-run only the rows that were marked.** The `keep` rows are already paid for and already approved. Filter to the `fix` ids and re-run those — re-running the full set burns credits to regenerate output a human already accepted.

## Step 4 — Make the correction permanent

A fix that lives only in this session's prompt is lost by the next run. Two durable homes:

- **Prompt library** — if the correction is about how to write or judge, amend the prompt entry so every future recipe inherits it.
- **Context repo** — if the correction is about the *business* ("we don't say 'synergy'", "never claim a customer count", "Series A means <$15M for us"), it belongs in the workspace's GTM knowledge base where humans and agents both read it: [`../../cargo-context/SKILL.md`](../../cargo-context/SKILL.md).

State plainly which one you wrote to, and quote the line you added. "Made that a standing rule" without an artifact is not a standing rule.

## Step 5 — Keep the reviewed rows as an eval set

The reviewed batch is the most valuable thing this loop produces, and it is usually thrown away. Keep it:

- Store the `prompt → reviewer verdict → note` triples alongside the play (a small JSON file in the repo, or a model in the workspace).
- Before shipping a prompt change, run it against those stored rows and check that previously-`keep` rows still pass. This is what stops fix #4 from re-breaking fix #2.
- Ten to thirty rows is enough to catch regressions. Do not build a labeling program.

## Step 6 — Close the loop

Report back in this shape, then stop:

1. **What changed** — the grouped causes and the fix applied to each.
2. **What it cost** — credits for the re-run of the `fix` rows only, against the original run's cost.
3. **What is now permanent** — the prompt entry or context file, quoted.
4. **What is still open** — rows the reviewer split on, or causes you chose not to fix and why.

If the reviewer wants another pass, iterate — but cap it. Two rounds catch nearly everything; a third usually means the task is underspecified, and the right move is a conversation about the criteria, not a third re-run.

## Related

- [`../references/contact-accuracy.md`](../references/contact-accuracy.md) — deterministic QA that should run *before* a human ever sees the rows.
- [`save-as-play.md`](save-as-play.md) — once the output passes review consistently, make it scheduled.
- [`../references/cost-discipline.md`](../references/cost-discipline.md) — the pilot gate; a review loop is a pilot with a human in it.
