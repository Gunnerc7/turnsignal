-- Run this in Supabase SQL editor.

-- Who set the loaner return date, and whether the "due date reached"
-- notification has already fired — without the second column, the same
-- notification would fire again every time anyone opens the board after
-- the date passes.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS loaner_return_date_set_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS loaner_return_date_notified boolean NOT NULL DEFAULT false;

-- Replaces the old rule where only "Waiting on Title" made a loaner
-- accrue carrying cost. That was too narrow — a loaner can be a real,
-- ongoing cost for plenty of reasons title status alone can't capture
-- (not live yet, etc.). This is a direct, manual switch instead: off by
-- default (matching how loaners have always worked), on only when
-- someone actually flips it for a specific vehicle, for whatever reason
-- applies to that one.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS loaner_track_carrying_cost boolean NOT NULL DEFAULT false;
