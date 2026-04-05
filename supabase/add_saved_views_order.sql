-- Add order_index to saved_views for user-defined ordering
alter table public.saved_views
  add column if not exists order_index integer not null default 0;
