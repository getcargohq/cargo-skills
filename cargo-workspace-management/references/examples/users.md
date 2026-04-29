# User management examples

## List all workspace members

```bash
cargo-ai workspaceManagement user list
```

## Get the current user

```bash
cargo-ai workspaceManagement user get-current
```

## Find available roles before inviting

```bash
cargo-ai workspaceManagement role list
# → Note the "slug" values for the roles you want to assign
```

## Invite a new user

```bash
# 1. Get available roles
cargo-ai workspaceManagement role list

# 2. Invite the user with their email and role
cargo-ai workspaceManagement user create \
  --user-email newuser@example.com \
  --role-slug <role-slug>
```

## Update a user's role

```bash
cargo-ai workspaceManagement user update --user-uuid <uuid> --role-slug <new-role-slug>
```

## Remove a user from the workspace

```bash
cargo-ai workspaceManagement user remove --user-uuid <uuid>
```

## Find the current user's details

```bash
cargo-ai whoami
# → Returns your user UUID, email, and active workspace UUID
```

## Audit workspace members

List all users and their roles:

```bash
# 1. List all users
cargo-ai workspaceManagement user list
# → Note roleSlug for each user

# 2. List all roles to map slugs to role names
cargo-ai workspaceManagement role list
# → Cross-reference roleSlug values
```
