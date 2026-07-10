-- Run this in Supabase SQL editor.

-- Whether a service loaner is physically here/available or currently out
-- with a customer. Deliberately null for any vehicle not on the Loaners
-- board — this field only ever means something in that one context, and
-- gets cleared automatically the moment a vehicle leaves that board,
-- gets completed, or gets deleted (deletion clears it implicitly, since
-- the whole row goes with it).
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS loaner_status text;
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS loaner_status_check;
ALTER TABLE vehicles ADD CONSTRAINT loaner_status_check
  CHECK (loaner_status IS NULL OR loaner_status IN ('here', 'out'));
