-- Run this in Supabase SQL editor.

-- 1. Owner profiles should never need a dealership_id — Owner Mode works
-- entirely off the role field, not this column. Making it nullable removes
-- the need for the workaround value used during recovery.
ALTER TABLE profiles ALTER COLUMN dealership_id DROP NOT NULL;
UPDATE profiles SET dealership_id = NULL WHERE role = 'owner';

-- 2. The real fix: a database-level guarantee that an Owner profile can
-- never be deleted, by ANY code path — not just the one that caused this
-- incident, but anything now or in the future, including direct SQL.
CREATE OR REPLACE FUNCTION public.protect_owner_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'owner' THEN
    RAISE EXCEPTION 'Owner profiles cannot be deleted. Remove owner status first if this is intentional.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_owner_profile_trigger ON profiles;
CREATE TRIGGER protect_owner_profile_trigger
  BEFORE DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_profile();
