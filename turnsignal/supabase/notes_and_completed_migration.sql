-- Run this in Supabase SQL editor.

-- 1. A proper notes table — lets each vehicle have multiple timestamped notes
-- instead of a single overwritable text field.
CREATE TABLE IF NOT EXISTS vehicle_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehicle_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View notes for vehicles in your dealership"
ON vehicle_notes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM vehicles
    WHERE vehicles.id = vehicle_notes.vehicle_id
    AND (
      vehicles.dealership_id = public.current_dealership_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
    )
  )
);

CREATE POLICY "Add notes for vehicles in your dealership"
ON vehicle_notes FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM vehicles
    WHERE vehicles.id = vehicle_notes.vehicle_id
    AND (
      vehicles.dealership_id = public.current_dealership_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
    )
  )
);

-- 2. A "completed" checkbox, Planner-style.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;
