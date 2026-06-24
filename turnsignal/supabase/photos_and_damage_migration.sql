-- Run this in Supabase SQL editor.

-- 1. A storage bucket for vehicle photos. Public read (so photo URLs just
-- work directly with no extra signing step) but upload/delete is still
-- gated by the policies below, scoped per dealership.
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-photos', 'vehicle-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Photos are uploaded under a path like {dealership_id}/{vehicle_id}/{file},
-- so these policies check the first folder segment of the file path.
CREATE POLICY "View photos in your own dealership"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'vehicle-photos'
  AND ((storage.foldername(name))[1] = public.current_dealership_id()::text OR public.is_owner())
);

CREATE POLICY "Upload photos to your own dealership"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'vehicle-photos'
  AND ((storage.foldername(name))[1] = public.current_dealership_id()::text OR public.is_owner())
);

CREATE POLICY "Delete photos in your own dealership"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'vehicle-photos'
  AND ((storage.foldername(name))[1] = public.current_dealership_id()::text OR public.is_owner())
);

-- 2. A table tracking which photos belong to which vehicle.
CREATE TABLE IF NOT EXISTS vehicle_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehicle_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View photos for vehicles in your dealership"
ON vehicle_photos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM vehicles
    WHERE vehicles.id = vehicle_photos.vehicle_id
    AND (vehicles.dealership_id = public.current_dealership_id() OR public.is_owner())
  )
);

CREATE POLICY "Add photos for vehicles in your dealership"
ON vehicle_photos FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM vehicles
    WHERE vehicles.id = vehicle_photos.vehicle_id
    AND (vehicles.dealership_id = public.current_dealership_id() OR public.is_owner())
  )
);

CREATE POLICY "Delete photos for vehicles in your dealership"
ON vehicle_photos FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM vehicles
    WHERE vehicles.id = vehicle_photos.vehicle_id
    AND (vehicles.dealership_id = public.current_dealership_id() OR public.is_owner())
  )
);

-- 3. The damage flag itself — this is what drives the visible alert on
-- the card. (A true push/email alert to a manager's phone is bigger
-- infrastructure, tied to the notifications system already on the
-- roadmap — this gives you the visible, on-board version of that today.)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS has_damage boolean NOT NULL DEFAULT false;
