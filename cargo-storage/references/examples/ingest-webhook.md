# Ingest models — get the webhook URL and POST records

Some models are fed by **pushing** records to Cargo instead of Cargo pulling them.
Their extractor has `mode.kind === "ingest"` — the canonical one is the `http`
integration's `listenHook` ("Listen webhook"), but the same mechanism backs
`storeleads.listenList`, `rb2b.listenProfiles`, `albacross.listenWebsiteVisits`,
and others.

The app shows a **Webhook URL** on the model's settings screen. There is **no CLI
command and no API field that returns it** — the app builds the string client-side.
You can build the exact same string from data the CLI already exposes.

## The URL

```
<baseUrl>/v1/models/<model-uuid>/records/ingest?token=<api-token>
```

- `<baseUrl>` — `cargo-ai whoami` → `.baseUrl` (e.g. `https://api.getcargo.io`).
  Note the path is `/v1/models/...`, **not** `/v1/storage/models/...`.
- `<model-uuid>` — the ingest model's UUID.
- `<api-token>` — any workspace API token. The token may carry **zero
  permissions**; this route is explicitly allowed for permission-less tokens so
  the URL can be handed to a third-party system safely. The app auto-creates one
  named `Quick access` for exactly this.

`token` can also be sent as an `Authorization: Basic <token>` header instead of a
query param — preferable when the receiving system supports custom headers, since
a query param lands in logs.

## Derive it

```bash
# 1. Find the model and confirm it is an ingest model
cargo-ai storage model get <model-uuid> | jq '{uuid, slug, extractorSlug, kind, connectorUuid}'

# 2. Confirm the extractor's mode is "ingest" (and NOT autoIngest — see below)
cargo-ai connection integration get http | jq -c '.integration.extractors.listenHook.mode'
# → {"kind":"ingest"}

# 3. Pick or create a token (the raw value is on the list response)
cargo-ai workspaceManagement token list | jq -r '.tokens[0].token'
cargo-ai workspaceManagement token create --name "Webhook — <model-slug>" | jq -r '.token.token'
```

One-liner that assembles it:

```bash
MODEL_UUID=<model-uuid>
BASE=$(cargo-ai whoami | jq -r '.baseUrl')
TOKEN=$(cargo-ai workspaceManagement token list | jq -r '.tokens[0].token')
echo "$BASE/v1/models/$MODEL_UUID/records/ingest?token=$TOKEN"
```

> Token values are secrets. Print the URL for the user to copy; don't write it
> into a file, a commit, or a report.

## Skip models where Cargo owns the hook

Some ingest extractors set `autoIngest: true` — Cargo registers the webhook with
the provider itself during setup (calendly, smartlead, instantlyV2, heyReach,
and cargo's own signal extractors). The app **hides** the URL for
those, and handing it out is wrong: the provider is already pointed at it.

Check before showing anything:

```bash
cargo-ai connection integration get <integration-slug> \
  | jq -c '.integration.extractors["<extractor-slug>"].mode'
# {"kind":"ingest"}                    → manual: show the URL
# {"kind":"ingest","autoIngest":true}  → Cargo owns it: don't show the URL
# anything else (fetch/…)              → not an ingest model at all
```

List every ingest extractor an integration has:

```bash
cargo-ai connection integration get <integration-slug> \
  | jq -c '.integration.extractors | to_entries
           | map(select(.value.mode.kind=="ingest")) | map({(.key): .value.mode})'
# calendly → [{"fetchEvents":{"kind":"ingest","autoIngest":true}}]
```

## POST records

The body is **either one flat object or an array of flat objects** — each object
becomes one record, and its keys become columns. Max **100 records per request**.

```bash
# one record
curl -X POST "$BASE/v1/models/$MODEL_UUID/records/ingest?token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","company":"example.com"}'

# many records
curl -X POST "$BASE/v1/models/$MODEL_UUID/records/ingest?token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"email":"ada@example.com"},{"email":"grace@example.com"}]'

# token as a header instead of a query param
curl -X POST "$BASE/v1/models/$MODEL_UUID/records/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $TOKEN" \
  -d '{"email":"ada@example.com"}'
# all → 200 {"message":"OK"}
```

**The endpoint is insert-only.** Do not send an envelope like
`{"kind":"insert","records":[…]}` — there is no unwrapping, so you get one useless
row with a `kind` column and a `records` column holding the stringified array.
The `{kind: insert|update|remove, records: […]}` shape belongs to the extractor's
internal contract, not to this HTTP body; `update` and `remove` are not reachable
through the webhook.

For `http.listenHook`, the model's id column is `_ingest_id` (a UUID **generated
server-side** — never send it; the extractor rejects inserts that carry one) and
its title column is `_emitted_at`.

Then confirm the rows landed (storage queries are free):

```bash
cargo-ai storage query execute "SELECT * FROM <dataset-slug>.<model-slug> LIMIT 10"
```

## Create an ingest model from scratch

`model create` has no `--connector-uuid` — the API infers the connector from the
**dataset**. Every connector automatically owns exactly one `kind: "connector"`
dataset, so the flow is: create the connector, find its dataset, create the model
in it.

```bash
# 1. Connector (slug must be snake_case: /^[a-z0-9]+(_[a-z0-9]+)*$/)
cargo-ai connection connector create \
  --name "Inbound leads" --slug inbound_leads \
  --integration-slug http --config '{}' | jq -r '.connector.uuid'

# 2. Its dataset — dataset list takes no --connector-uuid filter, so filter locally
cargo-ai storage dataset list \
  | jq -c --arg c <connector-uuid> '.datasets[] | select(.connectorUuid==$c) | {uuid, slug}'

# 3. The model
cargo-ai storage model create \
  --slug inbound_leads --name "Inbound Leads" \
  --dataset-uuid <dataset-uuid> \
  --extractor-slug listenHook --config '{}'
```

The response comes back with `kind: "connector"`, `idColumnSlug: "_ingest_id"`,
and `titleColumnSlug: "_emitted_at"`. Columns are then created dynamically from
the keys of whatever you POST — you don't declare them up front. Query it as
`<connector-slug>.<model-slug>`.

## Notes

- The endpoint answers webhook **handshakes** out of the box — Slack
  `url_verification`, generic `ping`, Microsoft `?validationToken=`, Salesforce
  SOAP ack, and Meta's `hub.challenge` on `GET` — so most providers validate
  without extra work.
- Ingest models can't be refreshed or scheduled; data only arrives when something
  POSTs. `model refresh` / `--schedule` don't apply.
- A legacy alias `POST /v1/workflows/<uuid>/hook` still resolves to the same
  insert (the uuid being the model uuid). Prefer the `/v1/models/...` form.
- Because the URL is assembled client-side, it is *derived*, not *returned* — if
  a future CLI release adds a field or a `get-webhook-url` command, prefer that.
