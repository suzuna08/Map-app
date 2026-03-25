-- Google Place Type Catalog & Internal Intel Tag Mappings
-- Run after the base migration.sql
--
-- These tables provide durable backend storage for the place type catalog
-- and the editable mapping rules. The TypeScript seed data in
-- src/lib/google-place-types.ts and src/lib/intel-tag-mappings.ts serves as
-- the canonical source; these tables allow admin-level persistence and
-- future UI-driven editing.

-- ─── Google Place Type Catalog ───────────────────────────────────────────────
-- Stores official Google Places API (New) type keys with metadata.

create table if not exists public.google_place_type_catalog (
  id uuid primary key default gen_random_uuid(),
  type_key text not null unique,
  can_be_primary boolean not null default false,
  table_group text not null default 'A' check (table_group in ('A', 'B', 'C')),
  status text not null default 'active' check (status in ('active', 'deprecated', 'unmapped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gptc_type_key on public.google_place_type_catalog(type_key);
create index if not exists idx_gptc_status on public.google_place_type_catalog(status);

-- ─── Internal Intel Tag Mappings ─────────────────────────────────────────────
-- Maps Google type keys to internal product-level classifications.
-- This is the editable layer that separates external taxonomy from
-- internal business intelligence.

create table if not exists public.intel_tag_mappings (
  id uuid primary key default gen_random_uuid(),
  google_type_key text not null unique references public.google_place_type_catalog(type_key),
  primary_category text not null,
  operational_status text not null default 'unknown',
  market_niche text not null default 'uncategorized',
  discussion_pillar text,
  suggested_tags jsonb not null default '[]'::jsonb,
  market_context text not null default 'global',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_itm_google_type_key on public.intel_tag_mappings(google_type_key);
create index if not exists idx_itm_primary_category on public.intel_tag_mappings(primary_category);
create index if not exists idx_itm_market_context on public.intel_tag_mappings(market_context);

-- ─── Optional: place-level intel tag cache ───────────────────────────────────
-- Stores computed intel tag results per place. This is optional; the system
-- can operate compute-first without persistence. Enable when you want to
-- cache results or let users approve/edit suggested tags.

create table if not exists public.place_intel_tags (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary_category text not null,
  operational_status text not null,
  market_niche text not null,
  discussion_pillar text,
  suggested_tags jsonb not null default '[]'::jsonb,
  source_types jsonb not null default '[]'::jsonb,
  source_primary_type text,
  approved boolean not null default false,
  computed_at timestamptz not null default now(),
  unique(place_id)
);

create index if not exists idx_pit_place_id on public.place_intel_tags(place_id);
create index if not exists idx_pit_user_id on public.place_intel_tags(user_id);

-- ─── RLS policies ────────────────────────────────────────────────────────────
-- Catalog and mappings are read-only for authenticated users (admin writes
-- happen via service role or direct SQL).

alter table public.google_place_type_catalog enable row level security;
alter table public.intel_tag_mappings enable row level security;
alter table public.place_intel_tags enable row level security;

create policy "Authenticated users can read type catalog"
  on public.google_place_type_catalog for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can read intel mappings"
  on public.intel_tag_mappings for select
  using (auth.role() = 'authenticated');

create policy "Users can view own place intel tags"
  on public.place_intel_tags for select
  using (auth.uid() = user_id);

create policy "Users can insert own place intel tags"
  on public.place_intel_tags for insert
  with check (auth.uid() = user_id);

create policy "Users can update own place intel tags"
  on public.place_intel_tags for update
  using (auth.uid() = user_id);

create policy "Users can delete own place intel tags"
  on public.place_intel_tags for delete
  using (auth.uid() = user_id);
