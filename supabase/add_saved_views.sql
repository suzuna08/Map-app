-- Saved Views: lightweight user-defined filter/sort/layout presets
create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filters_json jsonb not null default '{}'::jsonb,
  sort_by text not null default 'newest',
  layout_mode text not null default 'grid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_views enable row level security;

create policy "Users can view own saved views"
  on public.saved_views for select using (auth.uid() = user_id);
create policy "Users can insert own saved views"
  on public.saved_views for insert with check (auth.uid() = user_id);
create policy "Users can update own saved views"
  on public.saved_views for update using (auth.uid() = user_id);
create policy "Users can delete own saved views"
  on public.saved_views for delete using (auth.uid() = user_id);

create index idx_saved_views_user_id on public.saved_views(user_id);
