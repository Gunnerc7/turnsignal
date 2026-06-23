-- Run this in Supabase SQL editor.

-- 1. Per-dealership aging colors — each dealership can set its own
-- yellow/red day counts instead of a fixed 3/5 for everyone.
ALTER TABLE dealerships ADD COLUMN IF NOT EXISTS yellow_threshold_days integer NOT NULL DEFAULT 3;
ALTER TABLE dealerships ADD COLUMN IF NOT EXISTS red_threshold_days integer NOT NULL DEFAULT 5;

-- 2. First and last name on profiles, plus snapshotted display names on
-- notes and vehicles — snapshotting means historical entries keep showing
-- the name as it was at the time, like a real audit trail should.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE vehicle_notes ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS completed_by_name text;

-- 3. People need to be able to set their own name.
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 4. People also need to be able to edit or delete their own notes — and
-- since this app shares full access within a dealership rather than
-- locking things to one author, anyone in the same dealership (or Owner)
-- can fix a note that was added under the wrong vehicle.
CREATE POLICY "Update notes for vehicles in your dealership"
ON vehicle_notes FOR UPDATE
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

CREATE POLICY "Delete notes for vehicles in your dealership"
ON vehicle_notes FOR DELETE
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

-- 5. New signups now capture first/last name (collected on the signup
-- form) straight into their profile automatically.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, dealership_id, email, role, first_name, last_name)
  SELECT
    NEW.id,
    di.dealership_id,
    NEW.email,
    'dealer',
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  FROM public.dealership_invites di
  WHERE di.email = NEW.email AND di.used_at IS NULL
  ORDER BY di.created_at DESC
  LIMIT 1;

  UPDATE public.dealership_invites
  SET used_at = now()
  WHERE email = NEW.email AND used_at IS NULL;

  RETURN NEW;
END;
$$;
