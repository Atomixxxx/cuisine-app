# Cuisine App

Application HACCP / cuisine (temperature, factures, tracabilite, recettes).

## Shared Data Across Devices

This project supports shared Supabase storage so two phones can use the same data.

Setup:

1. Run SQL schema: `docs/supabase-schema.sql`
2. Configure Vercel env vars:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_WORKSPACE_ID`
   - `VITE_SUPABASE_STORAGE_BUCKET`
3. Redeploy

Detailed guide: `docs/supabase-setup.md`
Hardened RLS/auth SQL: `docs/supabase-rls-auth.sql`

## Development

```bash
npm install
npm run dev
```
