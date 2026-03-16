-- Add order_index to tags for user-defined tag ordering
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0;

-- Backfill existing user tags: assign order_index by alphabetical name per user
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY name) - 1 AS rn
  FROM public.tags
  WHERE source = 'user'
)
UPDATE public.tags
SET order_index = ranked.rn
FROM ranked
WHERE public.tags.id = ranked.id;
