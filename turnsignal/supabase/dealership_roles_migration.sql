-- Run this in Supabase SQL editor.

-- 1. The role itself — separate from the existing 'dealer'/'owner' system
-- role. This is a job-function label within a dealership, always optional.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dealership_role text;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS dealership_role_check;
ALTER TABLE profiles ADD CONSTRAINT dealership_role_check
  CHECK (dealership_role IS NULL OR dealership_role IN ('manager', 'sales', 'service', 'detail', 'photo'));

-- Invites can carry a role too, so it's already set the moment someone
-- signs up instead of needing a second step.
ALTER TABLE dealership_invites ADD COLUMN IF NOT EXISTS dealership_role text;
ALTER TABLE dealership_invites DROP CONSTRAINT IF EXISTS invite_role_check;
ALTER TABLE dealership_invites ADD CONSTRAINT invite_role_check
  CHECK (dealership_role IS NULL OR dealership_role IN ('manager', 'sales', 'service', 'detail', 'photo'));

-- 2. Everyone needs to be able to see who else is in their own dealership
-- (this is what populates the "assign a role" list).
CREATE POLICY "View profiles in your own dealership"
ON profiles FOR SELECT
USING (
  dealership_id = public.current_dealership_id()
  OR EXISTS (SELECT 1 FROM profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'owner')
);

-- 3. Owner can update anyone — this is what lets you designate the first
-- Manager for a dealership.
CREATE POLICY "Owners can update any profile"
ON profiles FOR UPDATE
USING (EXISTS (SELECT 1 FROM profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'owner'))
WITH CHECK (EXISTS (SELECT 1 FROM profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'owner'));

-- 4. Once a Manager exists, they can assign roles to anyone else in their
-- own dealership too — this is what lets it grow past just you doing it.
CREATE POLICY "Managers can update profiles in their dealership"
ON profiles FOR UPDATE
USING (
  dealership_id = public.current_dealership_id()
  AND EXISTS (SELECT 1 FROM profiles p2 WHERE p2.id = auth.uid() AND p2.dealership_role = 'manager')
)
WITH CHECK (dealership_id = public.current_dealership_id());

-- 5. A real safeguard: even though the self-update-your-own-name policy
-- lets people update their own row, this trigger specifically blocks
-- anyone from changing dealership_role — their own or anyone else's —
-- unless they're an Owner or already a Manager. This is enforced
-- regardless of which RLS policy let the row through.
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

-- 6. New signups now carry their invited role straight into their profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, dealership_id, email, role, first_name, last_name, dealership_role)
  SELECT
    NEW.id,
    di.dealership_id,
    NEW.email,
    'dealer',
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    di.dealership_role
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
