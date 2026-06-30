-- Run this in Supabase SQL editor.

-- 1. Title status — three real states (kept state-agnostic on purpose, no
-- "WI" prefix, so this works for a dealer in any state), plus null for
-- "not yet determined," which is the deliberate default for every new
-- vehicle until someone actually knows the answer.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS title_status text;
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS title_status_check;
ALTER TABLE vehicles ADD CONSTRAINT title_status_check
  CHECK (title_status IS NULL OR title_status IN ('has_title', 'poa', 'waiting'));

-- 2. A real database-level guarantee that only Owner or Manager can ever
-- change this field — not just a UI restriction. Mirrors the exact same
-- pattern already used to protect dealership_role, and uses the same
-- group-aware function every other manager permission already runs
-- through, so this also works correctly when a Manager is managing a
-- sibling store in their group via Switch Store.
CREATE OR REPLACE FUNCTION public.protect_title_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.title_status IS DISTINCT FROM OLD.title_status THEN
    IF NOT (public.is_owner() OR public.can_manage_as_group_manager(NEW.dealership_id)) THEN
      RAISE EXCEPTION 'Only an Owner or Manager can change title status.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_title_status_trigger ON vehicles;
CREATE TRIGGER protect_title_status_trigger
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION public.protect_title_status();
