-- Run this in Supabase SQL editor.

-- 1. Per-dealership carrying cost rates — different for new vs used,
-- since every dealer calculates this differently. Defaults to 0 (no cost
-- shown) until Owner/Manager actually sets real numbers.
ALTER TABLE dealerships ADD COLUMN IF NOT EXISTS new_carrying_cost_per_day numeric NOT NULL DEFAULT 0;
ALTER TABLE dealerships ADD COLUMN IF NOT EXISTS used_carrying_cost_per_day numeric NOT NULL DEFAULT 0;

-- 2. New vs used flag per vehicle. Defaults to false (used) — the
-- "everything is used unless it qualifies" rule is enforced in the app,
-- not the database, since it depends on the current year at the moment
-- a vehicle is added.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_new boolean NOT NULL DEFAULT false;

-- 3. Managers need to be able to update dealership-level settings (this
-- is what lets them control carrying cost rates, and — bonus consistency
-- fix — aging color thresholds, which was Owner-only until now even
-- though it's the same kind of setting). Reuses the same group-aware
-- function already powering every other manager permission, so this
-- also covers sibling stores in their group, same as everywhere else.
CREATE POLICY "Managers can update dealerships in their group"
ON dealerships FOR UPDATE
USING (public.can_manage_as_group_manager(id))
WITH CHECK (public.can_manage_as_group_manager(id));
