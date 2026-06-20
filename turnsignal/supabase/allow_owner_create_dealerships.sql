-- Run this in Supabase SQL editor — allows the Owner role to create new dealerships.

CREATE POLICY "Owners can create dealerships"
ON dealerships FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
);
