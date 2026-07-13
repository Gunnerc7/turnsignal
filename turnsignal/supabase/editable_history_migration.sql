-- Run this in Supabase SQL editor.

-- Audit trail for manual history edits/deletes. Stores enough to show
-- "what changed, who changed it, when" without needing to reconstruct
-- anything — original and new values are both captured directly.
CREATE TABLE IF NOT EXISTS stage_history_edits (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE CASCADE,
  stage_history_id uuid,
  edited_by_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  edited_by_name text,
  action text NOT NULL CHECK (action IN ('edit', 'delete')),
  stage text,
  original_entered_at timestamptz,
  original_exited_at timestamptz,
  new_entered_at timestamptz,
  new_exited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stage_history_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dealership members can view history edits" ON stage_history_edits;
CREATE POLICY "Dealership members can view history edits"
ON stage_history_edits FOR SELECT
USING (
  vehicle_id IN (SELECT id FROM vehicles WHERE dealership_id = public.current_dealership_id())
  OR EXISTS (
    SELECT 1 FROM vehicles WHERE vehicles.id = vehicle_id
    AND public.can_manage_as_group_manager(vehicles.dealership_id)
  )
);

DROP POLICY IF EXISTS "Owners and managers can log history edits" ON stage_history_edits;
CREATE POLICY "Owners and managers can log history edits"
ON stage_history_edits FOR INSERT
WITH CHECK (
  vehicle_id IN (SELECT id FROM vehicles WHERE dealership_id = public.current_dealership_id())
  OR EXISTS (
    SELECT 1 FROM vehicles WHERE vehicles.id = vehicle_id
    AND public.can_manage_as_group_manager(vehicles.dealership_id)
  )
);

-- A real database-level guarantee, not just a UI restriction — mirrors
-- the exact same pattern already used to protect title status. The
-- automatic flow every move already goes through (closing a stage by
-- setting exited_at, or Undo briefly reopening it within its 30-second
-- window) stays open to everyone, since neither of those is a manual
-- edit. Changing an entry's entered_at, changing an already-closed
-- exited_at to a genuinely different value, or deleting an entry
-- outright are the actual manual edits this protects — those require
-- Owner or Manager.
CREATE OR REPLACE FUNCTION public.protect_stage_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dealership_id uuid;
  is_privileged boolean;
BEGIN
  SELECT dealership_id INTO v_dealership_id FROM vehicles WHERE id = COALESCE(NEW.vehicle_id, OLD.vehicle_id);
  is_privileged := public.is_owner() OR public.can_manage_as_group_manager(v_dealership_id);

  IF TG_OP = 'DELETE' THEN
    IF NOT is_privileged THEN
      RAISE EXCEPTION 'Only an Owner or Manager can delete a history entry.';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.entered_at IS DISTINCT FROM OLD.entered_at AND NOT is_privileged THEN
    RAISE EXCEPTION 'Only an Owner or Manager can edit a history entry.';
  END IF;

  IF OLD.exited_at IS NOT NULL AND NEW.exited_at IS NOT NULL
     AND NEW.exited_at IS DISTINCT FROM OLD.exited_at AND NOT is_privileged THEN
    RAISE EXCEPTION 'Only an Owner or Manager can edit a history entry.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_stage_history_trigger ON stage_history;
CREATE TRIGGER protect_stage_history_trigger
  BEFORE UPDATE OR DELETE ON stage_history
  FOR EACH ROW EXECUTE FUNCTION public.protect_stage_history();
