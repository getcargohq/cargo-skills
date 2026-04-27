# Folder examples

Folders organize resources (plays, tools, agents) in the Cargo app for easier navigation.

## List all folders

```bash
cargo-ai workspace folder list
```

## Create a folder

Requires `--name`, `--emoji-slug`, and `--kind`. Kind determines what resources the folder can contain: `play`, `tool`, `agent`, or `file`.

```bash
cargo-ai workspace folder create --name "Q1 Campaigns" --emoji-slug "rocket" --kind "play"
cargo-ai workspace folder create --name "Outbound - SDR Team" --emoji-slug "briefcase" --kind "tool"
cargo-ai workspace folder create --name "AI Assistants" --emoji-slug "robot" --kind "agent"
```

## Get a folder

```bash
cargo-ai workspace folder get <folder-uuid>
```

## Update a folder

```bash
cargo-ai workspace folder update --uuid <folder-uuid> --name "Q1 2025 Campaigns"
cargo-ai workspace folder update --uuid <folder-uuid> --emoji-slug "star"
cargo-ai workspace folder update --uuid <folder-uuid> --parent-uuid <parent-folder-uuid>
```

## Remove a folder

```bash
# Remove all resources from the folder first (via the Cargo app or by updating each resource)
cargo-ai workspace folder remove <folder-uuid>
```

## Find a folder UUID for assigning resources

```bash
# 1. List folders to find the one you want
cargo-ai workspace folder list
# → Note the "uuid" for the target folder

# 2. When creating or updating a play/tool/agent, pass the folder UUID
# (Folder assignment is typically done via play/tool/agent update commands)
```
