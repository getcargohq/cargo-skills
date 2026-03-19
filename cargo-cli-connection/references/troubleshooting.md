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
| Action not executing as expected        | Wrong `actionSlug`                               | Run `native-integration get` to see the correct `actions[].slug` values                   |

## Integrations

| Symptom                                                 | Cause                                                         | Fix                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| `integration list` doesn't show an expected integration | Integration may not be available in your region or plan       | Contact Cargo support or check the integrations page in the app |
| `native-integration get` returns not found              | Wrong integration slug                                        | Use `integration list` to confirm the exact slug                |
| OAuth flow incomplete                                   | `complete-oauth` not called after creating an OAuth connector | Complete the OAuth flow through the Cargo app UI or via the API |
