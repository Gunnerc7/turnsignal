-- Run this in Supabase SQL editor to add Owner mode support.

-- 1. Add a role column to profiles (defaults to 'dealer' for everyone existing)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'dealer';

-- 2. Mark your own account as Owner — replace with your actual login email
UPDATE profiles SET role = 'owner' WHERE email = 'YOUR_EMAIL_HERE';

-- 3. Let Owners see every dealership (needed for the dealer-switcher list)
CREATE POLICY "Owners can view all dealerships"
ON dealerships FOR SELECT
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
);

-- 4. Let Owners view and edit every dealership's vehicles
CREATE POLICY "Owners can manage all vehicles"
ON vehicles FOR ALL
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
);
