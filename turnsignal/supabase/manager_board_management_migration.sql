-- Run this in Supabase SQL editor.

-- Managers can currently view boards (from dealership_groups_migration.sql)
-- but not create, rename, reorder, or delete them — that was Owner-only.
-- This extends write access to Managers too, scoped to their own group via
-- the same function every other manager permission already uses.
CREATE POLICY "Managers can manage boards in their group"
ON boards FOR ALL
USING (public.can_manage_as_group_manager(dealership_id))
WITH CHECK (public.can_manage_as_group_manager(dealership_id));
