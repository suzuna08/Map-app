-- Share settings: per-collection control over what's visible to link viewers
alter table public.lists
  add column if not exists share_notes boolean not null default true,
  add column if not exists share_photos boolean not null default true,
  add column if not exists share_tags boolean not null default false;

-- Allow anonymous users to read photo rows for places in shared collections
create policy "Public can view photos in link_access collections"
  on place_photos for select
  using (
    exists (
      select 1 from list_places lp
      join lists l on l.id = lp.list_id
      where lp.place_id = place_photos.place_id
        and l.user_id = place_photos.user_id
        and l.visibility = 'link_access'
        and l.share_photos = true
    )
  );

-- Allow anonymous users to read place_tags for places in shared collections
create policy "Public can view place_tags in link_access collections"
  on place_tags for select
  using (
    exists (
      select 1 from list_places lp
      join lists l on l.id = lp.list_id
      where lp.place_id = place_tags.place_id
        and l.visibility = 'link_access'
        and l.share_tags = true
    )
  );

-- Allow anonymous users to read tag definitions referenced by shared collections
create policy "Public can view tags in link_access collections"
  on tags for select
  using (
    exists (
      select 1 from place_tags pt
      join list_places lp on lp.place_id = pt.place_id
      join lists l on l.id = lp.list_id
      where pt.tag_id = tags.id
        and l.visibility = 'link_access'
        and l.share_tags = true
    )
  );
