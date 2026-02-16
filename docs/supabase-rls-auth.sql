-- Hardened RLS mode for Cuisine App
-- Apply this AFTER docs/supabase-schema.sql.
-- This switches access from open anon policies to authenticated users
-- linked to a workspace via public.workspace_members.

create table if not exists public.workspace_members (
  workspace_id text not null,
  user_id uuid not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspace_members enable row level security;

drop policy if exists "workspace_members_self_read" on public.workspace_members;
create policy "workspace_members_self_read"
on public.workspace_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "workspace_members_owner_write" on public.workspace_members;
create policy "workspace_members_owner_write"
on public.workspace_members
for all
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

create or replace function public.is_workspace_member(target_workspace text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
  );
$$;

-- Replace open anon policies with authenticated workspace-scoped policies.
drop policy if exists "anon_all_settings" on public.settings;
drop policy if exists "anon_all_equipment" on public.equipment;
drop policy if exists "anon_all_temperature_records" on public.temperature_records;
drop policy if exists "anon_all_oil_change_records" on public.oil_change_records;
drop policy if exists "anon_all_tasks" on public.tasks;
drop policy if exists "anon_all_orders" on public.orders;
drop policy if exists "anon_all_product_traces" on public.product_traces;
drop policy if exists "anon_all_invoices" on public.invoices;
drop policy if exists "anon_all_price_history" on public.price_history;
drop policy if exists "anon_all_ingredients" on public.ingredients;
drop policy if exists "anon_all_recipes" on public.recipes;
drop policy if exists "anon_all_recipe_ingredients" on public.recipe_ingredients;

drop policy if exists "auth_workspace_settings" on public.settings;
create policy "auth_workspace_settings"
on public.settings for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "auth_workspace_equipment" on public.equipment;
create policy "auth_workspace_equipment"
on public.equipment for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "auth_workspace_temperature_records" on public.temperature_records;
create policy "auth_workspace_temperature_records"
on public.temperature_records for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "auth_workspace_oil_change_records" on public.oil_change_records;
create policy "auth_workspace_oil_change_records"
on public.oil_change_records for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "auth_workspace_tasks" on public.tasks;
create policy "auth_workspace_tasks"
on public.tasks for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "auth_workspace_orders" on public.orders;
create policy "auth_workspace_orders"
on public.orders for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "auth_workspace_product_traces" on public.product_traces;
create policy "auth_workspace_product_traces"
on public.product_traces for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "auth_workspace_invoices" on public.invoices;
create policy "auth_workspace_invoices"
on public.invoices for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "auth_workspace_price_history" on public.price_history;
create policy "auth_workspace_price_history"
on public.price_history for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "auth_workspace_ingredients" on public.ingredients;
create policy "auth_workspace_ingredients"
on public.ingredients for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "auth_workspace_recipes" on public.recipes;
create policy "auth_workspace_recipes"
on public.recipes for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "auth_workspace_recipe_ingredients" on public.recipe_ingredients;
create policy "auth_workspace_recipe_ingredients"
on public.recipe_ingredients for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

-- Harden storage policies with workspace folder enforcement.
drop policy if exists "public_read_cuisine_media" on storage.objects;
drop policy if exists "anon_insert_cuisine_media" on storage.objects;
drop policy if exists "anon_update_cuisine_media" on storage.objects;
drop policy if exists "anon_delete_cuisine_media" on storage.objects;

drop policy if exists "auth_read_cuisine_media" on storage.objects;
create policy "auth_read_cuisine_media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'cuisine-media'
  and public.is_workspace_member((storage.foldername(name))[1])
);

drop policy if exists "auth_insert_cuisine_media" on storage.objects;
create policy "auth_insert_cuisine_media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'cuisine-media'
  and public.is_workspace_member((storage.foldername(name))[1])
);

drop policy if exists "auth_update_cuisine_media" on storage.objects;
create policy "auth_update_cuisine_media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'cuisine-media'
  and public.is_workspace_member((storage.foldername(name))[1])
)
with check (
  bucket_id = 'cuisine-media'
  and public.is_workspace_member((storage.foldername(name))[1])
);

drop policy if exists "auth_delete_cuisine_media" on storage.objects;
create policy "auth_delete_cuisine_media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'cuisine-media'
  and public.is_workspace_member((storage.foldername(name))[1])
);

-- Example: add members after creating users in Auth.
-- select id, email from auth.users order by created_at desc;
-- insert into public.workspace_members (workspace_id, user_id, role)
-- values
--   ('resto-duo', '00000000-0000-0000-0000-000000000001', 'owner'),
--   ('resto-duo', '00000000-0000-0000-0000-000000000002', 'member');
