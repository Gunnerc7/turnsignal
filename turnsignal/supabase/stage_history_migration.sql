-- Run this in Supabase SQL editor.

-- 1. The running total needs a fixed starting point that never moves once set —
-- the moment a vehicle first leaves Inbound/Trade-In (or, if added directly
-- into a later stage, the moment it was created).
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS recon_started_at timestamptz;

-- 2. The full history of every stage a vehicle has passed through — this is
-- what makes "which stage is slowest" and "how long did this one take" real,
-- answerable questions instead of guesses.
CREATE TABLE IF NOT EXISTS stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  board text NOT NULL,
  stage text NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz
);

ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stage history for vehicles in your dealership"
ON stage_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM vehicles
    WHERE vehicles.id = stage_history.vehicle_id
    AND (
      vehicles.dealership_id = public.current_dealership_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
    )
  )
);

CREATE POLICY "Insert stage history for vehicles in your dealership"
ON stage_history FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM vehicles
    WHERE vehicles.id = stage_history.vehicle_id
    AND (
      vehicles.dealership_id = public.current_dealership_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
    )
  )
);

CREATE POLICY "Update stage history for vehicles in your dealership"
ON stage_history FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM vehicles
    WHERE vehicles.id = stage_history.vehicle_id
    AND (
      vehicles.dealership_id = public.current_dealership_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
    )
  )
);
