# App examples

Apps are Vite single-page apps served on `https://<slug>.cargo.app`, scaffolded from `@cargo-ai/app-sdk`.

## Scaffold → create → deploy → promote (end to end)

```bash
# 1. See what templates exist, then scaffold a local project
cargo-ai hosting app init ./territories --list-templates
cargo-ai hosting app init ./territories --template territories-overview --name "Territories"

# 2. Create the workspace slot. --slug is the live subdomain → must be globally unique.
cargo-ai hosting app create --name "Territories" --slug territories
# → { "uuid": "<app-uuid>", "slug": "territories", "url": "https://territories.cargo.app", ... }

# 3. (optional) Develop locally — write the .env.local the app needs, then run Vite
cargo-ai hosting app env <app-uuid> > ./territories/.env.local
cd ./territories && npm install && npm run dev

# 4. Build & upload (source = package root, not dist/). The backend runs `npm ci && vite build`.
cargo-ai hosting deployment create --app-uuid <app-uuid> --source ./territories
# → { "uuid": "<deployment-uuid>", "status": "...", ... }

# 5. Poll until the build is terminal
cargo-ai hosting deployment get <deployment-uuid>

# 6. Promote to make it live at https://territories.cargo.app
cargo-ai hosting deployment promote --uuid <deployment-uuid>

# 7. Confirm what's live
cargo-ai hosting deployment get-promoted --app-uuid <app-uuid>
```

## List and inspect

```bash
cargo-ai hosting app list                       # all apps in the workspace
cargo-ai hosting app list --folder-uuid <uuid>  # only apps in one folder
cargo-ai hosting app get <app-uuid>             # one app's details + live URL
```

## Local development env

`app env` prints the `.env.local` lines a local copy of the app needs — Cargo OAuth client, workspace UUID, app UUID, and API URL — so `getCargoEnv()` / `useCargoApi()` talk to the right workspace.

```bash
# Default API URL (https://api.getcargo.io)
cargo-ai hosting app env <app-uuid> > ./my-app/.env.local

# Point at a different API (e.g. a staging environment)
cargo-ai hosting app env <app-uuid> --api-url https://api.staging.getcargo.io > ./my-app/.env.local
```

## Rename, move, remove

```bash
# Rename
cargo-ai hosting app update --uuid <app-uuid> --name "Renamed App"

# Move into a folder (folders are managed by cargo-workspace-management)
cargo-ai workspaceManagement folder list                          # find the folder UUID
cargo-ai hosting app update --uuid <app-uuid> --folder-uuid <folder-uuid>

# Move back to the workspace root (literal string "null")
cargo-ai hosting app update --uuid <app-uuid> --folder-uuid null

# Remove (also removes every deployment of this app)
cargo-ai hosting app remove <app-uuid>
```

## Ship a new version of an existing app

The app slot and slug stay put; you just create and promote a fresh deployment.

```bash
cargo-ai hosting deployment create --app-uuid <app-uuid> --source ./my-app
# poll deployment get <new-deployment-uuid> until terminal
cargo-ai hosting deployment promote --uuid <new-deployment-uuid>
```

Roll back by promoting an earlier deployment — `deployment list --app-uuid <uuid>` shows the history; `deployment promote --uuid <older-uuid>` points the live URL back at it.
