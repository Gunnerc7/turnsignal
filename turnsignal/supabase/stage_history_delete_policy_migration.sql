-- Run this in Supabase SQL editor.

-- stage_history has had SELECT, INSERT, and UPDATE policies since its
-- first migration, but never a DELETE policy — meaning every delete
-- attempt has always been silently blocked by RLS (Postgres denies by
-- default when no policy matches an operation, with no error raised,
-- just zero rows affected). The new protect_stage_history_trigger from
-- editable_history_migration.sql never even got a chance to run its
-- Owner/Manager check, because RLS was filtering the row out before the
-- trigger could fire. This policy is intentionally broad (same-dealership
-- access, matching the existing SELECT/UPDATE policies) — the trigger is
-- what actually enforces Owner/Manager-only deletion; this just lets a
-- legitimate request reach it in the first place.
DROP POLICY IF EXISTS "Delete stage history for vehicles in your dealership" ON stage_history;
CREATE POLICY "Delete stage history for vehicles in your dealership"
ON stage_history FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM vehicles
    WHERE vehicles.id = stage_history.vehicle_id
    AND (
      vehicles.dealership_id = public.current_dealership_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
      OR public.can_manage_as_group_manager(vehicles.dealership_id)
    )
  )
);
