-- Run this in Supabase SQL editor. This replaces the broken policies from
-- last time with versions that avoid the self-referencing loop.

-- Two small helper functions, same pattern as the existing
-- current_dealership_id() — SECURITY DEFINER means their internal lookup
-- bypasses RLS instead of triggering it again, which is what avoids the loop.
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner');
$$;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND dealership_role = 'manager');
$$;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;

-- Re-create the three policies using those functions instead of an inline
-- subquery directly against profiles (that direct subquery was the loop).
CREATE POLICY "View profiles in your own dealership"
ON profiles FOR SELECT
USING (
  dealership_id = public.current_dealership_id()
  OR public.is_owner()
);

CREATE POLICY "Owners can update any profile"
ON profiles FOR UPDATE
USING (public.is_owner())
WITH CHECK (public.is_owner());

CREATE POLICY "Managers can update profiles in their dealership"
ON profiles FOR UPDATE
USING (
  dealership_id = public.current_dealership_id()
  AND public.is_manager()
)
WITH CHECK (dealership_id = public.current_dealership_id());

-- The trigger from last time was actually fine (it only fires on UPDATE,
-- and was already wrapped in SECURITY DEFINER correctly) — restoring it.
CREATE OR REPLACE FUNCTION public.protect_dealership_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.dealership_role IS DISTINCT FROM OLD.dealership_role THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'owner' OR dealership_role = 'manager')
    ) THEN
      RAISE EXCEPTION 'Only an Owner or Manager can change a dealership role.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_dealership_role_trigger ON profiles;
CREATE TRIGGER protect_dealership_role_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_dealership_role();
