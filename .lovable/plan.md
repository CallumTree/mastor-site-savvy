## Problem

`projects.user_id` has a foreign key to `auth.users(id)`. Since authentication is disabled and the app inserts a hardcoded `DEV_USER.id` (`00000000-…-0001`) that doesn't exist in `auth.users`, every insert fails with `projects_user_id_fkey`.

The same FK pattern likely blocks future user-scoped tables too, but `projects` is the only table with this constraint right now.

## Fix

Run a migration that drops the FK constraint:

```sql
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_user_id_fkey;
```

The `user_id` column stays (default still `00000000-…-0001`), so nothing in code needs to change. New projects, variations, progress logs, valuations, and procurement items will all save without requiring an `auth.users` row.

## Why not seed a dev user into `auth.users`?

Inserting directly into `auth.users` bypasses Supabase Auth's invariants and can break the auth schema on later upgrades. Dropping the FK is the clean dev-mode fix and matches the "auth disabled" posture already in place. When auth is re-enabled later, the constraint can be restored in one migration.

## Verification

After the migration, create a project from the dashboard — the insert should succeed and the row should appear after refresh.