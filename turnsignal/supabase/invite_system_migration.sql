-- Run this in Supabase SQL editor.

-- 1. Pending invites: you add an email here, tied to a dealership. When
-- someone signs up with that exact email, the trigger below automatically
-- creates their profile linked to that dealership.
CREATE TABLE IF NOT EXISTS dealership_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

ALTER TABLE dealership_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealers can invite to their own dealership"
ON dealership_invites FOR INSERT
WITH CHECK (
  dealership_id = public.current_dealership_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
);

CREATE POLICY "Dealers can view invites for their own dealership"
ON dealership_invites FOR SELECT
USING (
  dealership_id = public.current_dealership_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
);

-- 2. The trigger: fires automatically every time someone creates an
-- account. Looks for a matching pending invite by email; if found, creates
-- their profile linked to that dealership and marks the invite used. If no
-- invite matches, nothing happens — they just won't have dealership access.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, dealership_id, email, role)
  SELECT NEW.id, di.dealership_id, NEW.email, 'dealer'
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
