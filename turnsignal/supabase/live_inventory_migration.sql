-- Run this in Supabase SQL editor.

-- Deliberately a separate table from vehicles, not a new board value on
-- the existing table. Live Inventory vehicles never go through recon
-- tracking — no stages, no carrying cost, no priority scoring — and
-- keeping them in their own table means none of that machinery needs to
-- remember to exclude them; it simply never sees them, since it only
-- ever queries the vehicles table.
CREATE TABLE IF NOT EXISTS live_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  stock_number text,
  vehicle_type text,
  year integer,
  make text,
  model text,
  trim text,
  mileage integer,
  color text,
  vin text NOT NULL,
  dms_state text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  -- Soft-archive, not a hard delete — when a vehicle drops off a later
  -- import (presumed sold), the record stays with this set instead of
  -- disappearing outright, so there's still a trace it existed.
  removed_at timestamptz,
  UNIQUE (dealership_id, vin)
);

ALTER TABLE live_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dealership members can view their live inventory" ON live_inventory;
CREATE POLICY "Dealership members can view their live inventory"
ON live_inventory FOR SELECT
USING (
  dealership_id = public.current_dealership_id()
  OR public.can_manage_as_group_manager(dealership_id)
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
);

DROP POLICY IF EXISTS "Dealership members can manage their live inventory" ON live_inventory;
CREATE POLICY "Dealership members can manage their live inventory"
ON live_inventory FOR ALL
USING (
  dealership_id = public.current_dealership_id()
  OR public.can_manage_as_group_manager(dealership_id)
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
)
WITH CHECK (
  dealership_id = public.current_dealership_id()
  OR public.can_manage_as_group_manager(dealership_id)
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
);
