-- Run this in Supabase SQL editor.

-- The Loaners toggle is an opt-IN (most loaners shouldn't count, flip on
-- when one should). This is the opposite: an opt-OUT for a vehicle that
-- would normally count toward carrying cost but shouldn't in this one
-- case — e.g. an already-sold vehicle brought back in briefly for a
-- re-detail. Applies to any board; default false so nothing changes for
-- any existing vehicle.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS carrying_cost_excluded boolean NOT NULL DEFAULT false;
