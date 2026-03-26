-- Add optional emoji icon to collections (lists)
-- Stores a single emoji character, e.g. '🍜'. NULL means no emoji (color-only circle).
alter table public.lists
  add column if not exists emoji text;
