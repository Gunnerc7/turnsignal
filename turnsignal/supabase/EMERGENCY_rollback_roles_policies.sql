-- Run this immediately to restore login access.
-- This only removes the new permission rules and trigger added for
-- dealership roles — it does NOT touch any data, columns, or other tables.

DROP POLICY IF EXISTS "View profiles in your own dealership" ON profiles;
DROP POLICY IF EXISTS "Owners can update any profile" ON profiles;
DROP POLICY IF EXISTS "Managers can update profiles in their dealership" ON profiles;
DROP TRIGGER IF EXISTS protect_dealership_role_trigger ON profiles;
DROP FUNCTION IF EXISTS public.protect_dealership_role();
