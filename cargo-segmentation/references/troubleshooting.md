# Segmentation — troubleshooting

## The filter matches nothing (and there is no error)

**Cause, 90% of the time: `conjunction` instead of `conjonction`.** The key is French-spelled. An unrecognized key is dropped, the filter degenerates, and you get an empty result with a `200`.

```bash
# Before every call:
grep -o 'conjunction' <<< "$FILTER_JSON" && echo "TYPO — use conjonction"
```

Other causes, in order of frequency:

1. **A `columnSlug` that does not exist on the model.** Confirm with `cargo-ai storage column list --model-uuid <uuid>`. Slugs are not labels — the column shown as "Employee count" may be `employee_count` or `employees`.
2. **Wrong `kind` for the column type.** A `number` condition against a string column matches nothing. Check the column's `type` in the same listing.
3. **`values` vs `value`.** `string` and `array` conditions take `values` (string or array); `number`, `date`, and `boolean` take `value` (scalar). Mixing them silently drops the condition.
4. **The segment has never synced.** `syncedAt` absent means it was never evaluated — `recordsCount: 0` is "unknown", not "empty".

## `400 … expected string, received undefined` on `path: ["segmentUuid"]`

`cargo-ai segmentation change list` requires `--segment-uuid`. There is no "all changes in the workspace" listing.

## `error: required option '--uuid <uuid>' not specified` on `change fetch`

`change fetch` keys on the **change** UUID (from `change list`), not the segment UUID. It also requires `--kinds`:

```bash
cargo-ai segmentation change fetch --uuid <change-uuid> --kinds added --limit 50
```

## `--help` prints the parent command's help

On CLI ≥ 1.0.48, `cargo-ai segmentation change <sub> --help` and `cargo-ai segmentation record fetch --help` render the `segmentation` help instead of the subcommand's flags. Use the Quick reference in [`../SKILL.md`](../SKILL.md); discover required flags by running the command bare and reading the `required option` error. If this persists, file a report:

```bash
cargo-ai workspaceManagement report create \
  --title "segmentation change/record --help shows parent help" \
  --description "cargo-ai segmentation change fetch --help renders the segmentation help, not the subcommand flags. CLI <version>."
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

`segment fetch --sync` re-syncs the model's upstream data sources before evaluating. It is slower and, for connector-backed models, may trigger provider calls — so use it deliberately, not as a default.

## A record is in the model but not in the segment

Check in this order: (1) the `--limit` cap on the segment, (2) the filter against that record's actual values (`record fetch --model-uuid <uuid> --ids <id>`), (3) whether the segment has synced since the record landed.
