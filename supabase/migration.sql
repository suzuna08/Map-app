-- Places imported from Google Maps CSV
create table public.places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  note text,
  url text,
  tags text,
  comment text,
  source_list text,
  created_at timestamptz not null default now()
);

-- Custom lists created by users
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text default '#6366f1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Junction table for places <-> lists (many-to-many)
create table public.list_places (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique(list_id, place_id)
);

-- Row Level Security
alter table public.places enable row level security;
alter table public.lists enable row level security;
alter table public.list_places enable row level security;

create policy "Users can view own places" on public.places for select using (auth.uid() = user_id);
create policy "Users can insert own places" on public.places for insert with check (auth.uid() = user_id);
create policy "Users can update own places" on public.places for update using (auth.uid() = user_id);
create policy "Users can delete own places" on public.places for delete using (auth.uid() = user_id);

create policy "Users can view own lists" on public.lists for select using (auth.uid() = user_id);
create policy "Users can insert own lists" on public.lists for insert with check (auth.uid() = user_id);
create policy "Users can update own lists" on public.lists for update using (auth.uid() = user_id);
create policy "Users can delete own lists" on public.lists for delete using (auth.uid() = user_id);

create policy "Users can view own list places" on public.list_places for select using (
  exists (select 1 from public.lists where lists.id = list_places.list_id and lists.user_id = auth.uid())
);
create policy "Users can insert into own lists" on public.list_places for insert with check (
  exists (select 1 from public.lists where lists.id = list_places.list_id and lists.user_id = auth.uid())
);
create policy "Users can delete from own lists" on public.list_places for delete using (
  exists (select 1 from public.lists where lists.id = list_places.list_id and lists.user_id = auth.uid())
);

create index idx_places_user_id on public.places(user_id);
create index idx_lists_user_id on public.lists(user_id);
create index idx_list_places_list_id on public.list_places(list_id);
create index idx_list_places_place_id on public.list_places(place_id);
