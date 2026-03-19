# Response shapes

JSON response structures returned by Cargo CLI commands used in the `cargo-cli-billing` skill.

## cargo-ai billing usage get-metrics

```json
{
  "metrics": [
    {
      "date": "2025-01-15T00:00:00Z",
      "items": [
        { "slug": "enrichment", "count": 150, "groupBy": null },
        { "slug": "ai_message", "count": 42, "groupBy": null }
      ]
    },
    {
      "date": "2025-01-16T00:00:00Z",
      "items": [
        { "slug": "enrichment", "count": 200, "groupBy": null }
      ]
    }
  ]
}
```

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

**Key fields:** `metrics[].date`, `metrics[].items[].slug` (usage type), `metrics[].items[].count`, `metrics[].items[].groupBy`.

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
