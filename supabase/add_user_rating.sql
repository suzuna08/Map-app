-- Add personal user rating columns to places
-- user_rating: 0.5-step values from 0.5 to 5.0
-- user_rated_at: timestamp of when the user last set or changed the rating

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS user_rating numeric(2,1) NULL,
  ADD COLUMN IF NOT EXISTS user_rated_at timestamptz NULL;

-- Optional: add a check constraint to enforce the 0.5-step range
ALTER TABLE public.places
  ADD CONSTRAINT chk_user_rating
  CHECK (user_rating IS NULL OR (user_rating >= 0.5 AND user_rating <= 5.0 AND user_rating * 2 = FLOOR(user_rating * 2)));
