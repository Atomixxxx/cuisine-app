# Supabase Setup (shared data across phones)

This project can sync data between devices when Supabase env vars are configured.

## 1. Create project

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `docs/supabase-schema.sql`.

## 2. Get env vars

From Supabase Project Settings -> API:

- `Project URL` -> `VITE_SUPABASE_URL`
- `anon public key` -> `VITE_SUPABASE_ANON_KEY`

Choose:

- `VITE_SUPABASE_WORKSPACE_ID`:
  Use the same value on both phones/accounts (example: `resto-duo`).
- `VITE_SUPABASE_STORAGE_BUCKET`:
  Default in schema is `cuisine-media`.

## 3. Configure Vercel

In Vercel Project Settings -> Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_WORKSPACE_ID`
- `VITE_SUPABASE_STORAGE_BUCKET`
- (optional) `VITE_GEMINI_API_KEY`

Redeploy after adding vars.

## 4. Existing local data

If Supabase is empty and your local app already has data, the app seeds remote data on first reads/writes.

If your database was created before the `orders` feature, re-run `docs/supabase-schema.sql`.
It now creates `public.orders` and migrates legacy task category `commandes` into orders.

## 5. Secure mode (recommended)

1. Create users in Supabase Authentication.
2. Run `docs/supabase-rls-auth.sql` in SQL Editor.
3. Add users to `public.workspace_members` for your workspace ID.
4. In the app, open Settings -> `Cloud Supabase` and login with each user.

## Notes

- The SQL policies in `docs/supabase-schema.sql` allow shared access for `anon` role (simple collaboration mode).
- `docs/supabase-rls-auth.sql` switches to authenticated RLS (workspace-scoped).
