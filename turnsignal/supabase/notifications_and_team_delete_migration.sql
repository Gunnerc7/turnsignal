-- Run this in Supabase SQL editor.

-- 1. Who a card is currently assigned to. A real foreign key (not just a
-- name snapshot) since we need to query "what's assigned to me" — unlike
-- created_by/completed_by, which are historical audit fields, this is a
-- live "current state" field, so it also gets a cached display name that
-- refreshes every time the assignment itself changes.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS assigned_to_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS assigned_to_name text;

-- 2. In-app notifications. Deliberately generic (a "type" isn't included
-- yet since only assignment notifications exist today) but the shape
-- leaves room to grow into other triggers later without a schema change —
-- recipient + dealership + optional vehicle link + a plain message.
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dealership_id uuid NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE CASCADE,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- You can only ever see and manage your own notifications.
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
USING (recipient_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

-- Anyone with real access to a dealership (a regular dealer there, the
-- Owner, or a Manager via their group) can create a notification for
-- someone in that same dealership — this is what "assigning a card"
-- actually does under the hood.
CREATE POLICY "Dealership members can create notifications"
ON notifications FOR INSERT
WITH CHECK (
  dealership_id = public.current_dealership_id()
  OR public.is_owner()
  OR public.can_manage_as_group_manager(dealership_id)
);

-- 3. Deleting a teammate's access. Owner can already do this from an
-- earlier migration; adding the equivalent for Managers, scoped to their
-- own group via the same function powering every other manager
-- permission. The existing protect_owner_profile_trigger (from the
-- account-lockout fix) already makes it physically impossible for either
-- of these to ever delete an Owner profile, regardless of this policy.
DROP POLICY IF EXISTS "Owners can delete profiles" ON profiles;
CREATE POLICY "Owners can delete profiles"
ON profiles FOR DELETE
USING (public.is_owner());

DROP POLICY IF EXISTS "Managers can delete profiles in their group" ON profiles;
CREATE POLICY "Managers can delete profiles in their group"
ON profiles FOR DELETE
USING (public.can_manage_as_group_manager(dealership_id));
