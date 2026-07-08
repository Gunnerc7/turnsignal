-- Run this in Supabase SQL editor.

-- A real timestamp for exactly when title_status last changed. Without
-- this, there's no way to tell "this has genuinely been Waiting on Title
-- for 12 days" from "this was just set five minutes ago" — the field
-- silently overwrites with no history. Backfilled to each vehicle's own
-- updated_at as a reasonable starting point for existing rows, since we
-- don't have real history before this column existed.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS title_status_updated_at timestamptz;
UPDATE vehicles SET title_status_updated_at = updated_at WHERE title_status_updated_at IS NULL AND title_status IS NOT NULL;
