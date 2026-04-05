-- Fix cross-user data leakage
-- The tags and place_tags tables were missing RLS policies entirely,
-- and the shared-collection policy on places was too permissive.

-- ─── Enable RLS on tags and place_tags ──────────────────────────────────────

alter table public.tags enable row level security;
alter table public.place_tags enable row level security;

-- ─── Drop existing policies (safe if they don't exist) ─────────────────────

drop policy if exists "Users can view own tags" on public.tags;
drop policy if exists "Users can insert own tags" on public.tags;
drop policy if exists "Users can update own tags" on public.tags;
drop policy if exists "Users can delete own tags" on public.tags;
drop policy if exists "Public can view tags for link_access collections" on public.tags;

drop policy if exists "Users can view own place_tags" on public.place_tags;
drop policy if exists "Users can insert own place_tags" on public.place_tags;
drop policy if exists "Users can delete own place_tags" on public.place_tags;
drop policy if exists "Public can view place_tags for link_access collections" on public.place_tags;

-- ─── Tags: users can only see/manage their own tags ─────────────────────────

create policy "Users can view own tags"
  on public.tags for select
  using (auth.uid() = user_id);

create policy "Users can insert own tags"
  on public.tags for insert
  with check (auth.uid() = user_id);

create policy "Users can update own tags"
  on public.tags for update
  using (auth.uid() = user_id);

create policy "Users can delete own tags"
  on public.tags for delete
  using (auth.uid() = user_id);

-- Shared collections need to read the owner's tags for display
create policy "Public can view tags for link_access collections"
  on public.tags for select
  using (
    exists (
      select 1 from public.place_tags pt
      join public.list_places lp on lp.place_id = pt.place_id
      join public.lists l on l.id = lp.list_id
      where pt.tag_id = tags.id
        and l.visibility = 'link_access'
    )
  );

-- ─── Place_tags: users can manage tags on their own places ──────────────────

create policy "Users can view own place_tags"
  on public.place_tags for select
  using (
    exists (
      select 1 from public.places
      where places.id = place_tags.place_id
        and places.user_id = auth.uid()
    )
  );

create policy "Users can insert own place_tags"
  on public.place_tags for insert
  with check (
    exists (
      select 1 from public.places
      where places.id = place_tags.place_id
        and places.user_id = auth.uid()
    )
  );

create policy "Users can delete own place_tags"
  on public.place_tags for delete
  using (
    exists (
      select 1 from public.places
      where places.id = place_tags.place_id
        and places.user_id = auth.uid()
    )
  );

-- Shared collections need to read place_tags for display
create policy "Public can view place_tags for link_access collections"
  on public.place_tags for select
  using (
    exists (
      select 1 from public.list_places lp
      join public.lists l on l.id = lp.list_id
      where lp.place_id = place_tags.place_id
        and l.visibility = 'link_access'
    )
  );
