-- Place photos table
create table if not exists place_photos (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order int not null default 0,
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index idx_place_photos_place_id on place_photos(place_id);
create index idx_place_photos_user_id on place_photos(user_id);

-- RLS
alter table place_photos enable row level security;

create policy "Users can view own photos"
  on place_photos for select
  using (auth.uid() = user_id);

create policy "Users can insert own photos"
  on place_photos for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own photos"
  on place_photos for delete
  using (auth.uid() = user_id);

create policy "Users can update own photos"
  on place_photos for update
  using (auth.uid() = user_id);

-- Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'place-photos',
  'place-photos',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Storage RLS: users can upload to their own folder
create policy "Users upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'place-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage RLS: public read
create policy "Public read place-photos"
  on storage.objects for select
  using (bucket_id = 'place-photos');

-- Storage RLS: users can delete own files
create policy "Users delete own photos"
  on storage.objects for delete
  using (
    bucket_id = 'place-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
