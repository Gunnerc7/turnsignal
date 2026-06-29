-- Run this in Supabase SQL editor.

-- Needed so carrying cost and Turn Rate can both freeze at the actual
-- moment a vehicle was marked complete, instead of continuing to count
-- forever (or until someone happens to look at it).
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS completed_at timestamptz;
