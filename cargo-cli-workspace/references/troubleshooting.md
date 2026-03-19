# Troubleshooting

Common errors and recovery steps for `cargo-cli-workspace` commands.

## General

| Symptom | Cause | Fix |
|---------|-------|-----|
| `{"errorMessage": "..."}` with non-zero exit | Any CLI error | Read the `errorMessage` — it usually says exactly what's wrong |
| `command not found: cargo-ai` | CLI not installed or not in PATH | Run `npm install -g @cargo-ai/cli@^1.0.5` or prefix with `npx @cargo-ai/cli@^1.0.5` |
| `Unauthorized` or `Forbidden` | Bad or expired token, or insufficient permissions | Re-run `cargo-ai login --token <token>`; verify with `cargo-ai whoami`; use an admin token for workspace management |

## Users

| Symptom | Cause | Fix |
|---------|-------|-----|
| `user create` fails with permission error | Token lacks admin access | Use a token belonging to a workspace admin |
| `user create` fails with "role not found" | Wrong role UUID | Run `workspace role list` to get valid role UUIDs |
| `user remove` fails | Attempting to remove the last admin | Promote another user to admin before removing |
| User can't log in after being created | Email invitation not accepted | Ask the user to check their email for the workspace invitation |

## Tokens

| Symptom | Cause | Fix |
|---------|-------|-----|
| Lost the token value after creation | Token value only shown once | Remove the token and create a new one; store the new value securely |
| `token remove` fails | Token is currently in use by active processes | Wait for processes to finish, or rotate to a new token first then remove the old one |
| `Unauthorized` errors in CI/CD | Token expired or removed | Create a new token and update the secret in your CI/CD environment |

## Folders

| Symptom | Cause | Fix |
|---------|-------|-----|
| `folder remove` fails | Folder still contains resources | Move or remove all resources from the folder before deleting it |
| `folder get` returns not found | Wrong folder UUID | Re-run `folder list` to get the correct UUID |

## Files

| Symptom | Cause | Fix |
|---------|-------|-----|
| `file list-columns` returns empty | Wrong `s3-filename` or file has no headers | Verify the `s3-filename` from the upload response; ensure the CSV has a header row |
| `file upload` fails | File too large or unsupported format | Check file size limits; ensure the file is a CSV or supported format |
