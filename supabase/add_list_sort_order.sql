-- Add sort_order to lists for user-defined collection ordering
ALTER TABLE public.lists ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Backfill existing lists: assign sort_order by created_at per user
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) - 1 AS rn
  FROM public.lists
)
UPDATE public.lists
SET sort_order = ranked.rn
FROM ranked
WHERE public.lists.id = ranked.id;
