-- Run this in Supabase SQL editor.

-- Tagging people in a note. Cached names alongside the ids (same pattern
-- already used for assigned_to_name) so displaying who's tagged never
-- needs an extra join.
ALTER TABLE vehicle_notes ADD COLUMN IF NOT EXISTS tagged_user_ids uuid[] DEFAULT '{}';
ALTER TABLE vehicle_notes ADD COLUMN IF NOT EXISTS tagged_user_names text[] DEFAULT '{}';
