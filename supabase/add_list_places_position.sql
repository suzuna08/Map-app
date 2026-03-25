-- Add position column to list_places for manual ordering within collections
ALTER TABLE public.list_places ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
