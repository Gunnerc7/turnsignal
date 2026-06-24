-- Run this in Supabase SQL editor.
-- Every policy here is brand new and additive — nothing existing is
-- touched or replaced, specifically to avoid repeating the earlier lockout.

-- 1. Groups of dealerships under one ownership umbrella (e.g. "Johnson Motors").
CREATE TABLE IF NOT EXISTS dealership_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dealership_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage dealership groups"
ON dealership_groups FOR ALL
USING (public.is_owner())
WITH CHECK (public.is_owner());

ALTER TABLE dealerships ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES dealership_groups(id) ON DELETE SET NULL;

-- 2. The core helper — is the calling user a Manager, and does the target
-- dealership share their own dealership's group? SECURITY DEFINER means
-- its internal lookups bypass RLS instead of looping back through it.
CREATE OR REPLACE FUNCTION public.can_manage_as_group_manager(target_dealership_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN dealerships my_d ON my_d.id = p.dealership_id
    JOIN dealerships target_d ON target_d.id = target_dealership_id
    WHERE p.id = auth.uid()
      AND p.dealership_role = 'manager'
      AND my_d.group_id IS NOT NULL
      AND my_d.group_id = target_d.group_id
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_as_group_manager(uuid) TO authenticated;

-- 3. Managers can see which dealerships are in their own group (needed to
-- populate the store-switcher) and can fully work in any of them.
CREATE POLICY "Managers can view dealerships in their group"
ON dealerships FOR SELECT
USING (public.can_manage_as_group_manager(id));

CREATE POLICY "Managers can view sibling-store boards"
ON boards FOR SELECT
USING (public.can_manage_as_group_manager(dealership_id));

CREATE POLICY "Managers can manage sibling-store vehicles"
ON vehicles FOR ALL
USING (public.can_manage_as_group_manager(dealership_id))
WITH CHECK (public.can_manage_as_group_manager(dealership_id));

CREATE POLICY "Managers can manage sibling-store notes"
ON vehicle_notes FOR ALL
USING (
  EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = vehicle_notes.vehicle_id AND public.can_manage_as_group_manager(vehicles.dealership_id))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = vehicle_notes.vehicle_id AND public.can_manage_as_group_manager(vehicles.dealership_id))
);

CREATE POLICY "Managers can view sibling-store stage history"
ON stage_history FOR SELECT
USING (
  EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = stage_history.vehicle_id AND public.can_manage_as_group_manager(vehicles.dealership_id))
);

CREATE POLICY "Managers can manage sibling-store photos table"
ON vehicle_photos FOR ALL
USING (
  EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = vehicle_photos.vehicle_id AND public.can_manage_as_group_manager(vehicles.dealership_id))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = vehicle_photos.vehicle_id AND public.can_manage_as_group_manager(vehicles.dealership_id))
);

CREATE POLICY "Managers can view sibling-store photo files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'vehicle-photos'
  AND public.can_manage_as_group_manager(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Managers can upload sibling-store photo files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'vehicle-photos'
  AND public.can_manage_as_group_manager(((storage.foldername(name))[1])::uuid)
);
