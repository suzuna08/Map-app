-- Extend lists table for Collections feature
-- Adds visibility control and shareable slug

-- visibility: 'private' (default) or 'link_access'
alter table public.lists
  add column if not exists visibility text not null default 'private';

-- share_slug: unique URL-safe identifier for public sharing
alter table public.lists
  add column if not exists share_slug text;

-- Ensure share_slug is unique across all lists
create unique index if not exists idx_lists_share_slug
  on public.lists(share_slug) where share_slug is not null;

-- Allow anonymous read access to link_access collections and their places
create policy "Public can view link_access lists"
  on public.lists for select
  using (visibility = 'link_access');

create policy "Public can view link_access list places"
  on public.list_places for select
  using (
    exists (
      select 1 from public.lists
      where lists.id = list_places.list_id
        and lists.visibility = 'link_access'
    )
  );

-- Allow public read of places that belong to a link_access collection
create policy "Public can view places in link_access collections"
  on public.places for select
  using (
    exists (
      select 1 from public.list_places lp
      join public.lists l on l.id = lp.list_id
      where lp.place_id = places.id
        and l.visibility = 'link_access'
    )
  );
