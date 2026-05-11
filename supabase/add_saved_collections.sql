-- Saved collections: bookmark references to shared collections (read-only view)
CREATE TABLE IF NOT EXISTS saved_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_list_id uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, source_list_id)
);

ALTER TABLE saved_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own bookmarks"
  ON saved_collections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own bookmarks"
  ON saved_collections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own bookmarks"
  ON saved_collections FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own bookmarks"
  ON saved_collections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_saved_collections_user ON saved_collections(user_id);
CREATE INDEX idx_saved_collections_source ON saved_collections(source_list_id);
