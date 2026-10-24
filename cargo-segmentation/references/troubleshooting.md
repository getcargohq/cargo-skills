# Segmentation — troubleshooting

## The filter is rejected with a 400

**Cause, 90% of the time: `conjunction` instead of `conjonction`.** The key is French-spelled and required on the filter and on every group; the misspelled key is dropped and validation fails on the missing `conjonction`.

```bash
# Before every call:
grep -o 'conjunction' <<< "$FILTER_JSON" && echo "TYPO — use conjonction"
```

Other causes of a 400:

1. **An empty group.** `{"conjonction":"and","conditions":[]}` fails with `Filter groups must contain at least one condition`. Match everything with `"groups": []`.
2. **Wrong `kind` for the column type.** A `number` condition against a string column is rejected (`reason: "invalidFilter"`, `Column "…" has type "string" but the filter condition expects kind "number"`). Check the column's `type` with `cargo-ai storage column list --model-uuid <uuid>`.
3. **`values` vs `value`.** `string` conditions take `values` (string or array); `number` and `date` take `value` (or `firstValue`/`lastValue` for `between`); `boolean` takes no value (`isTrue`, `isFalse`, `isNull`, `isNotNull`). The wrong key fails validation.

## The filter matches nothing (and there is no error)

1. **A `columnSlug` that does not exist on the model.** Unknown slugs are not rejected by validation. Confirm with `cargo-ai storage column list --model-uuid <uuid>`. Slugs are not labels — the column shown as "Employee count" may be `employee_count` or `employees`.
2. **The segment has never synced.** `syncedAt: null` means it was never evaluated — `recordsCount: 0` is "unknown", not "empty".

## `400 … expected string, received undefined` on `path: ["segmentUuid"]`

`cargo-ai segmentation change list` requires `--segment-uuid`. There is no "all changes in the workspace" listing.

## `error: required option '--uuid <uuid>' not specified` on `change fetch`

`change fetch` keys on the **change** UUID (from `change list`), not the segment UUID. It also requires `--kinds`:

```bash
cargo-ai segmentation change fetch --uuid <change-uuid> --kinds added --limit 50
```

## `segment download` returns a 400

It takes `--model-uuid` plus the `--filter`, not `--segment-uuid`. To download a *saved* segment, read its `modelUuid` and `filter` off `segment get` and pass those:

```bash
SEG=$(cargo-ai segmentation segment get <segment-uuid>)
cargo-ai segmentation segment download \
  --model-uuid "$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).modelUuid))' <<< "$SEG")" \
  --filter "$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).filter)))' <<< "$SEG")"
```

## `updatedRecordsCount` is always 0

Expected unless the segment declares what "updated" means. Recreate or update it with tracking columns:

```bash
cargo-ai segmentation segment update --uuid <segment-uuid> \
  --tracking-column-slugs "employee_count,funding_stage,job_title"
```

Only changes to those columns register as `updated`; everything else is `added`, `removed`, or `unchanged`.

## The segment is named `GENERATED_PLAY_SEGMENT`

It was created by a play (`fromPlay: true`) and is the play's trigger audience. Do not rename, re-filter, or remove it — edit the play instead ([`../../cargo-orchestration/references/examples/plays.md`](../../cargo-orchestration/references/examples/plays.md)). Several such segments with the same name are normal: one per play.

## Membership looks stale

`segment fetch` refreshes the model before evaluating unless you pass `--sync false`. It is slower and, for connector-backed models, may trigger provider calls. If the response says `isRefreshing: true`, a refresh was still running: fetch again shortly. `record fetch` serves cached rows; pass `--reset-cache` to re-read them.

## A record is in the model but not in the segment

Check in this order: (1) the `--limit` cap on the segment, (2) the filter against that record's actual values (`record fetch --model-uuid <uuid> --ids <id>`), (3) whether the segment has synced since the record landed.
