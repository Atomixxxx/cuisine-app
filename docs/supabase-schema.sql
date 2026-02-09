-- Cuisine App shared database schema for Supabase
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.settings (
  workspace_id text not null default 'default',
  id text not null,
  establishment_name text not null,
  dark_mode boolean not null default false,
  onboarding_done boolean not null default false,
  price_alert_threshold numeric not null default 10,
  gemini_api_key text null,
  primary key (workspace_id, id)
);

create table if not exists public.equipment (
  workspace_id text not null default 'default',
  id text not null,
  name text not null,
  type text not null check (type in ('fridge', 'freezer', 'cold_room')),
  min_temp numeric not null,
  max_temp numeric not null,
  sort_order integer not null default 0,
  primary key (workspace_id, id)
);
create index if not exists idx_equipment_workspace_order on public.equipment (workspace_id, sort_order);

create table if not exists public.temperature_records (
  workspace_id text not null default 'default',
  id text not null,
  equipment_id text not null,
  temperature numeric not null,
  timestamp timestamptz not null,
  is_compliant boolean not null,
  signature text null,
  primary key (workspace_id, id)
);
create index if not exists idx_temperature_workspace_ts on public.temperature_records (workspace_id, timestamp desc);
create index if not exists idx_temperature_workspace_equipment_ts on public.temperature_records (workspace_id, equipment_id, timestamp desc);

create table if not exists public.oil_change_records (
  workspace_id text not null default 'default',
  id text not null,
  fryer_id text not null,
  changed_at timestamptz not null,
  action text not null check (action = 'changed'),
  operator text null,
  primary key (workspace_id, id)
);
create index if not exists idx_oil_workspace_changed on public.oil_change_records (workspace_id, changed_at desc);

create table if not exists public.tasks (
  workspace_id text not null default 'default',
  id text not null,
  title text not null,
  category text not null check (category in ('entrees', 'plats', 'desserts', 'mise_en_place', 'nettoyage', 'commandes', 'autre')),
  priority text not null check (priority in ('high', 'normal', 'low')),
  completed boolean not null default false,
  estimated_time numeric null,
  notes text null,
  recurring text null check (recurring in ('daily', 'weekly') or recurring is null),
  created_at timestamptz not null,
  completed_at timestamptz null,
  archived boolean not null default false,
  sort_order integer not null default 0,
  primary key (workspace_id, id)
);
create index if not exists idx_tasks_workspace_order on public.tasks (workspace_id, sort_order);

create table if not exists public.product_traces (
  workspace_id text not null default 'default',
  id text not null,
  barcode text null,
  photo_url text null,
  product_name text not null,
  supplier text not null,
  lot_number text not null,
  reception_date timestamptz not null,
  expiration_date timestamptz not null,
  category text not null,
  allergens jsonb not null default '[]'::jsonb,
  scanned_at timestamptz not null,
  primary key (workspace_id, id)
);
create index if not exists idx_products_workspace_scanned on public.product_traces (workspace_id, scanned_at desc);
create index if not exists idx_products_workspace_barcode on public.product_traces (workspace_id, barcode);

create table if not exists public.invoices (
  workspace_id text not null default 'default',
  id text not null,
  image_urls jsonb not null default '[]'::jsonb,
  supplier text not null,
  invoice_number text not null,
  invoice_date timestamptz not null,
  items jsonb not null default '[]'::jsonb,
  total_ht numeric not null default 0,
  total_tva numeric not null default 0,
  total_ttc numeric not null default 0,
  ocr_text text not null default '',
  tags jsonb not null default '[]'::jsonb,
  scanned_at timestamptz not null,
  primary key (workspace_id, id)
);
create index if not exists idx_invoices_workspace_scanned on public.invoices (workspace_id, scanned_at desc);

create table if not exists public.price_history (
  workspace_id text not null default 'default',
  id text not null,
  item_name text not null,
  supplier text not null,
  prices jsonb not null default '[]'::jsonb,
  average_price numeric not null default 0,
  min_price numeric not null default 0,
  max_price numeric not null default 0,
  primary key (workspace_id, id)
);
create index if not exists idx_price_history_workspace_item on public.price_history (workspace_id, item_name);

create table if not exists public.ingredients (
  workspace_id text not null default 'default',
  id text not null,
  name text not null,
  unit text not null check (unit in ('kg', 'g', 'l', 'ml', 'unite')),
  unit_price numeric not null default 0,
  conditioning_quantity numeric null,
  supplier_id text null,
  primary key (workspace_id, id)
);
create index if not exists idx_ingredients_workspace_name on public.ingredients (workspace_id, name);

create table if not exists public.recipes (
  workspace_id text not null default 'default',
  id text not null,
  title text not null,
  portions numeric not null default 1,
  sale_price_ht numeric not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  allergens jsonb not null default '[]'::jsonb,
  primary key (workspace_id, id)
);
create index if not exists idx_recipes_workspace_updated on public.recipes (workspace_id, updated_at desc);

create table if not exists public.recipe_ingredients (
  workspace_id text not null default 'default',
  id text not null,
  recipe_id text not null,
  ingredient_id text not null,
  required_quantity numeric not null default 0,
  required_unit text not null check (required_unit in ('kg', 'g', 'l', 'ml', 'unite')),
  primary key (workspace_id, id)
);
create index if not exists idx_recipe_ingredients_workspace_recipe on public.recipe_ingredients (workspace_id, recipe_id);

-- RLS: simple shared workspace mode.
alter table public.settings enable row level security;
alter table public.equipment enable row level security;
alter table public.temperature_records enable row level security;
alter table public.oil_change_records enable row level security;
alter table public.tasks enable row level security;
alter table public.product_traces enable row level security;
alter table public.invoices enable row level security;
alter table public.price_history enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

drop policy if exists "anon_all_settings" on public.settings;
create policy "anon_all_settings" on public.settings for all to anon using (true) with check (true);
drop policy if exists "anon_all_equipment" on public.equipment;
create policy "anon_all_equipment" on public.equipment for all to anon using (true) with check (true);
drop policy if exists "anon_all_temperature_records" on public.temperature_records;
create policy "anon_all_temperature_records" on public.temperature_records for all to anon using (true) with check (true);
drop policy if exists "anon_all_oil_change_records" on public.oil_change_records;
create policy "anon_all_oil_change_records" on public.oil_change_records for all to anon using (true) with check (true);
drop policy if exists "anon_all_tasks" on public.tasks;
create policy "anon_all_tasks" on public.tasks for all to anon using (true) with check (true);
drop policy if exists "anon_all_product_traces" on public.product_traces;
create policy "anon_all_product_traces" on public.product_traces for all to anon using (true) with check (true);
drop policy if exists "anon_all_invoices" on public.invoices;
create policy "anon_all_invoices" on public.invoices for all to anon using (true) with check (true);
drop policy if exists "anon_all_price_history" on public.price_history;
create policy "anon_all_price_history" on public.price_history for all to anon using (true) with check (true);
drop policy if exists "anon_all_ingredients" on public.ingredients;
create policy "anon_all_ingredients" on public.ingredients for all to anon using (true) with check (true);
drop policy if exists "anon_all_recipes" on public.recipes;
create policy "anon_all_recipes" on public.recipes for all to anon using (true) with check (true);
drop policy if exists "anon_all_recipe_ingredients" on public.recipe_ingredients;
create policy "anon_all_recipe_ingredients" on public.recipe_ingredients for all to anon using (true) with check (true);

-- Storage bucket for invoice/product images.
insert into storage.buckets (id, name, public)
values ('cuisine-media', 'cuisine-media', true)
on conflict (id) do update set public = true;

drop policy if exists "public_read_cuisine_media" on storage.objects;
create policy "public_read_cuisine_media"
on storage.objects for select
using (bucket_id = 'cuisine-media');

drop policy if exists "anon_insert_cuisine_media" on storage.objects;
create policy "anon_insert_cuisine_media"
on storage.objects for insert to anon
with check (bucket_id = 'cuisine-media');

drop policy if exists "anon_update_cuisine_media" on storage.objects;
create policy "anon_update_cuisine_media"
on storage.objects for update to anon
using (bucket_id = 'cuisine-media')
with check (bucket_id = 'cuisine-media');

drop policy if exists "anon_delete_cuisine_media" on storage.objects;
create policy "anon_delete_cuisine_media"
on storage.objects for delete to anon
using (bucket_id = 'cuisine-media');
