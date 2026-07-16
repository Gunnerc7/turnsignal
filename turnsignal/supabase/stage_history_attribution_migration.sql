-- Run this in Supabase SQL editor.

-- Who moved a vehicle into each stage (or who added it, for the very
-- first entry) — shown directly on each row in the Timeline, so it's
-- possible to tell who actually made a given move, not just when it
-- happened.
ALTER TABLE stage_history ADD COLUMN IF NOT EXISTS moved_by_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE stage_history ADD COLUMN IF NOT EXISTS moved_by_name text;
