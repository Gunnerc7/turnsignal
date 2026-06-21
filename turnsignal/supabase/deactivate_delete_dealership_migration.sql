-- Run this in Supabase SQL editor.

-- 1. A simple on/off switch for a dealership — pausing access without
-- destroying any data, for when someone stops paying but might come back.
ALTER TABLE dealerships ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 2. Owners need to be able to update dealerships (to toggle active/inactive)...
CREATE POLICY "Owners can update dealerships"
ON dealerships FOR UPDATE
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner'))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner'));

-- ...and delete them, for permanent removal.
CREATE POLICY "Owners can delete dealerships"
ON dealerships FOR DELETE
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner'));

-- 3. Deleting a dealership also needs to clean up its team and pending
-- invites, since those aren't already covered by an Owner policy.
CREATE POLICY "Owners can delete profiles"
ON profiles FOR DELETE
USING (EXISTS (SELECT 1 FROM profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'owner'));

CREATE POLICY "Owners can delete dealership invites"
ON dealership_invites FOR DELETE
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner'));
