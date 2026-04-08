# Troubleshooting

Common errors and recovery steps for `cargo-cli-connection` commands.

## General

| Symptom                                      | Cause                            | Fix                                                                       |
| -------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| `{"errorMessage": "..."}` with non-zero exit | Any CLI error                    | Read the `errorMessage` — it usually says exactly what's wrong            |
| `command not found: cargo-ai`                | CLI not installed or not in PATH | Run `npm install -g @cargo-ai/cli` or prefix with `npx @cargo-ai/cli`     |
| `Unauthorized` or `Forbidden`                | Bad or expired API token         | Re-run `cargo-ai login --token <token>` and verify with `cargo-ai whoami` |

## Connectors

| Symptom                                 | Cause                                            | Fix                                                                                              |
| --------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `connector get` returns not found       | Wrong UUID                                       | Re-run `connector list` to get the correct UUID                                                  |
| `connector create` fails                | Integration slug doesn't exist                   | Run `integration list` to find valid `integrationSlug` values                                    |
| `connector remove` fails                | Connector is referenced by active plays or tools | Check `playsCount` and `toolsCount` on the connector; remove or update dependent resources first |
| Workflow fails with connector not found | Connector UUID in node graph is wrong            | Re-run `connector list` to verify the UUID used in the node config                               |
| Action not executing as expected        | Wrong `actionSlug`                               | For third-party connector actions (HubSpot, Salesforce, etc.), run `integration get <slug>` to see correct `actionSlug` values. Only use `native-integration get` for built-in Cargo actions. |

## Connector autocomplete

| Symptom                                              | Cause                                                              | Fix                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `connector autocomplete` returns empty results       | Wrong autocomplete slug or params                                  | Re-check the `uiSchema` from `integration get <slug>` — use the exact `ui:options.slug` and pass required `params`           |
| `Invalid autocomplete params` error                  | Missing or wrong params keys                                       | Check `ui:options.params` in the `uiSchema` — each key listed there must be provided in `--params` with an actual value       |
| `connectorNotFound` reason                           | Wrong connector UUID                                               | Re-run `connector list` to get the correct UUID                                                                               |
| `failedToGetIntegration` reason                      | Integration doesn't support autocomplete for this slug             | Verify the autocomplete slug exists in the integration's `uiSchema` — not all fields use autocomplete                         |
| Stale or outdated autocomplete results               | Results are cached (default 30 minutes)                            | Pass `--refresh` to bypass the cache                                                                                          |
| Used a freeform value instead of autocomplete result  | Field requires a specific value from the autocomplete result set   | Always check `uiSchema` for `IntegrationAutocompleteWidget` — if present, fetch and use a `value` from the autocomplete results |

## Integrations

| Symptom                                                 | Cause                                                         | Fix                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| `integration list` doesn't show an expected integration | Integration may not be available in your region or plan       | Contact Cargo support or check the integrations page in the app |
| Third-party actions (e.g. HubSpot) not found via `native-integration get` | `native-integration get` only returns built-in Cargo actions | Use `integration get <slug>` (e.g. `integration get hubspot`) to get service-specific actions |
| OAuth flow incomplete                                   | `complete-oauth` not called after creating an OAuth connector | Complete the OAuth flow through the Cargo app UI or via the API |
