# Response shapes

JSON response structures returned by Cargo CLI commands used in the `cargo-billing` skill.

## cargo-ai billing usage get-metrics

```json
{
  "metrics": [
    {
      "date": "2026-07-25T00:00:00.000Z",
      "items": [
        { "slug": "integration.peopleDataLabs.action.queryPeople", "count": 174, "groupBy": null },
        { "slug": "integration.serper.action.search", "count": 27.35, "groupBy": null },
        { "slug": "native.modelAsk", "count": 0.5, "groupBy": null },
        { "slug": "success", "count": 1043, "groupBy": null },
        { "slug": "error", "count": 32, "groupBy": null },
        { "slug": "insert", "count": 24, "groupBy": null }
      ]
    }
  ]
}
```

**With no `--unit`, three different quantities share one `items[]` array.** In the response above, `174` is credits, `1043` is *node executions*, and `24` is records written. Identify the unit from the slug:

| Slug shape | Unit | `count` is |
|---|---|---|
| `integration.<slug>.action.<action>`, `integration.<slug>.chat`, `integration.<slug>.extractor.<name>`, `native.<action>` | `billing.credits` | Credits (fractional) |
| `success`, `error` | `orchestration.executions` | Node executions — **credits = count / 100** |
| `insert` | `storage.records` | Records written |

`--unit` takes exactly `billing.credits`, `orchestration.executions`, or `storage.records`; any other value returns `400` listing those three. Pass it whenever the number feeds an estimate. The execution rows reconcile one-for-one with `SELECT execution_status, count() FROM spans` in `orchestration query execute`.

When `--group-by` is specified, `groupBy` contains the resource identifier:

```json
{
  "metrics": [
    {
      "date": "2025-01-15T00:00:00Z",
      "items": [
        { "slug": "enrichment", "count": 100, "groupBy": "workflow-uuid-1" },
        { "slug": "enrichment", "count": 50, "groupBy": "workflow-uuid-2" }
      ]
    }
  ]
}
```

**Key fields:** `metrics[].date`, `metrics[].items[].slug` (usage type), `metrics[].items[].count` (units depend on the slug — see above), `metrics[].items[].groupBy`.

The response has exactly one top-level key, `metrics`. There is no `totalUsage` — sum `items[].count` yourself, within one unit.

## cargo-ai billing subscription get

```json
{
  "subscription": {
    "uuid": "...",
    "workspaceUuid": "...",
    "plan": "self-serve",
    "cadence": "monthly",
    "subscriptionStatus": "active",
    "subscriptionAvailableCreditsCount": 10000,
    "subscriptionCreditsUsedCount": 3200,
    "additionalAvailableCreditsCount": 0,
    "fixedPrice": 9900,
    "conversionRate": 1,
    "hasCredits": true,
    "startAt": "2025-01-01T00:00:00Z",
    "resetAt": "2025-02-01T00:00:00Z",
    "endAt": null,
    "topup": null,
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-15T00:00:00Z"
  }
}
```

**Key fields:** `plan` (`self-serve` or `enterprise`), `subscriptionStatus`, `subscriptionAvailableCreditsCount`, `subscriptionCreditsUsedCount`, `startAt`, `resetAt`.

Remaining credits = `subscriptionAvailableCreditsCount - subscriptionCreditsUsedCount`.

## cargo-ai billing subscription get-invoices

```json
{
  "invoices": [
    {
      "id": "inv_...",
      "isPaid": true,
      "amount": 9900,
      "currency": "usd",
      "dueDate": "2025-02-01T00:00:00Z",
      "url": "https://..."
    }
  ]
}
```

**Key fields:** `id`, `isPaid` (boolean), `amount` (in cents — divide by 100 for dollars, e.g. `9900` = $99.00), `url` (link to the invoice).

## cargo-ai billing subscription create-portal-session

```json
{
  "portalSession": {
    "url": "https://billing.stripe.com/session/..."
  }
}
```

Open `portalSession.url` in a browser to access the Stripe self-service billing portal.

## cargo-ai billing subscription update-payment-method

```json
{
  "ok": true,
  "status": "updated",
  "creditCard": {
    "brand": "visa",
    "last4": "4242",
    "expMonth": 12,
    "expYear": 2030
  }
}
```

**Key fields:** `creditCard` describes the card now on file — the only card data ever returned. `creditCard` is absent if the card could not be read back straight after the update; the update still succeeded.

On failure the command exits non-zero with `{"errorMessage": "..."}` plus a `reason` of `cardDeclined`, `authenticationRequired`, or `paymentMethodNotFound`. A `cardDeclined` carries the issuer's `declineCode` — see [`troubleshooting.md`](troubleshooting.md).

## cargo-ai billing subscription get-credit-card

```json
{
  "creditCard": {
    "brand": "visa",
    "last4": "4242",
    "expMonth": 12,
    "expYear": 2030
  }
}
```

`creditCard` is `undefined` when no card is on file — the normal state for a workspace still on the free tier.
