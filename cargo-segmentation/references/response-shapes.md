# Segmentation — response shapes

Every command prints JSON to stdout. Shapes below are trimmed to the fields worth reading; unlisted fields are metadata.

## `segmentation segment list`

```json
{
  "segments": [
    {
      "uuid": "bf822051-fa7c-47ef-b908-b3313f95dcf0",
      "workspaceUuid": "fbe33643-f07e-4522-90ec-edaaec927119",
      "userUuid": "9095a4cd-9e2f-4c69-9701-007364375e74",
      "modelUuid": "3a79d1cc-fa72-4a4d-b14e-f7f9a903fa47",
      "slug": "ckd5ucqldyfu524a",
      "name": "Mid-market accounts",
      "filter": { "conjonction": "and", "groups": [] },
      "recordsCount": 3,
      "fromPlay": true,
      "syncedAt": "2026-07-22T00:20:41.999Z",
      "createdAt": "2026-07-21T23:20:42.778Z",
      "updatedAt": "2026-07-22T00:47:36.453Z",
      "lastChange": {
        "uuid": "2dd1e4a8-dcce-4c93-be25-b590addff73a",
        "slug": "bxwa085mxj59carr",
        "totalRecordsCount": 3,
        "addedRecordsCount": 3,
        "updatedRecordsCount": 0,
        "removedRecordsCount": 0,
        "unchangedRecordsCount": 0,
        "createdAt": "2026-07-22T00:47:35.227Z"
      }
    }
  ]
}
```

Field notes:

- `recordsCount` — current membership. The authoritative size; do not re-derive it by paging.
- `slug` — short stable handle, distinct from `uuid`. Some surfaces accept either; prefer `uuid`.
- `fromPlay: true` — created and owned by a play. Treat as read-only.
- `syncedAt` — absent until the segment has been evaluated at least once. A missing `syncedAt` with `recordsCount: 0` means "never synced", not "empty".
- `lastChange` — inlined most recent delta, so "what moved?" usually needs no second call.

## `segmentation segment get <uuid>`

The same object as one element of `segments[]`, unwrapped.

## `segmentation segment create` / `update`

Returns the created/updated segment object. `create` requires `--name`, `--model-uuid`, and `--filter`; `update` requires `--uuid` and at least one mutable field.

## `segmentation segment fetch`

```json
{
  "records": [ { "id": "…", "name": "Acme Corp", "domain": "acme.com" } ],
  "columns": [ { "slug": "name", "type": "string", "label": "Name", "modelUuid": "…" } ]
}
```

- Paginated with `--fetching-limit` (page size) and `--fetching-offset`.
- `--limit` caps total membership considered, which is **not** the same as the page size.
- `--sync` re-syncs upstream data sources first (slower); `--enrich` returns joined/derived values.

## `segmentation segment download`

```json
{ "url": "https://…signed…" }
```

A signed URL to the full dataset. Fetch it separately; the URL expires.

## `segmentation change list --segment-uuid <uuid>`

```json
{
  "changes": [
    {
      "uuid": "2dd1e4a8-dcce-4c93-be25-b590addff73a",
      "workspaceUuid": "…",
      "segmentUuid": "bf822051-fa7c-47ef-b908-b3313f95dcf0",
      "slug": "bxwa085mxj59carr",
      "totalRecordsCount": 3,
      "addedRecordsCount": 3,
      "updatedRecordsCount": 0,
      "removedRecordsCount": 0,
      "unchangedRecordsCount": 0,
      "createdAt": "2026-07-22T00:47:35.227Z"
    }
  ]
}
```

`updatedRecordsCount` stays `0` unless the segment was created with `--tracking-column-slugs`.

## `segmentation change fetch --uuid <change-uuid> --kinds <kinds>`

```json
{
  "columns": [
    { "slug": "_kind", "type": "string", "label": "_kind", "modelUuid": "…" },
    { "slug": "_id", "type": "string", "label": "_id", "modelUuid": "…" },
    { "slug": "_title", "type": "string", "label": "_title", "modelUuid": "…" },
    { "slug": "_time", "type": "date", "label": "_time", "modelUuid": "…" }
  ],
  "records": [ { "_kind": "added", "_id": "…", "_title": "Acme Corp", "_time": "…" } ]
}
```

The four `_`-prefixed meta-columns come first, followed by the model's own columns. `--kinds` accepts `added`, `updated`, `removed`, `unchanged` (comma-separated) and is required.

## `segmentation record fetch --model-uuid <uuid> --ids <ids>`

```json
{ "records": [] }
```

Both `--model-uuid` and `--ids` are required. An unknown id yields an empty `records` array rather than an error — check the length before assuming the record exists.

## Errors

```json
{ "error": "API error (400): RequestError: [ … zod issues … ]", "status": 400, "body": "…" }
```

The `body` carries the validation detail — read `path` to learn which argument the API rejected (e.g. `["segmentUuid"]` means the flag was omitted, not malformed).
