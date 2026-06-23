-- Run this in Supabase SQL editor.

-- 1. Boards now live in the database, one row per board, scoped to a
-- dealership. Stages live inside each board as a JSON list — simpler than
-- a second table, and this is exactly the kind of small, ordered list that
-- fits JSON well.
CREATE TABLE IF NOT EXISTS boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View boards for your own dealership"
ON boards FOR SELECT
USING (
  dealership_id = public.current_dealership_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
);

-- Only the Owner can create, rename, or delete boards/columns — everyone
-- else just sees whatever the Owner has set up.
CREATE POLICY "Owners can manage boards"
ON boards FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner'))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner'));

-- 2. Backfill the current hardcoded structure onto every dealership that
-- already exists, so nothing breaks for vehicles already in those columns.
INSERT INTO boards (dealership_id, key, label, position, stages)
SELECT d.id, b.key, b.label, b.position, b.stages
FROM dealerships d
CROSS JOIN (
  VALUES
    ('main', 'Main Board', 0, '[
      {"key":"inbound_trade_in","label":"Inbound / Trade-In"},
      {"key":"service","label":"Service"},
      {"key":"detail_backlog","label":"Detail Backlog"},
      {"key":"active_detail","label":"Active Detail"},
      {"key":"ready_for_photos","label":"Ready for Photos"},
      {"key":"price_for_lot","label":"Price for Lot"}
    ]'::jsonb),
    ('loaners', 'Loaners', 1, '[
      {"key":"loaners","label":"Loaners"},
      {"key":"service_loaners","label":"Service Loaners"}
    ]'::jsonb),
    ('body_shop', 'Body Shop', 2, '[{"key":"body_shop","label":"Body Shop"}]'::jsonb),
    ('waiting_on_title', 'Waiting on Title', 3, '[{"key":"waiting_on_title","label":"Waiting on Title"}]'::jsonb),
    ('auction_wholesale', 'Auction / Wholesale', 4, '[{"key":"auction_wholesale","label":"Auction / Wholesale"}]'::jsonb)
) AS b(key, label, position, stages)
WHERE NOT EXISTS (SELECT 1 FROM boards WHERE boards.dealership_id = d.id);

-- 3. From now on, every new dealership automatically gets the same
-- starting structure the moment it's created — Owner can edit it after.
CREATE OR REPLACE FUNCTION public.seed_default_boards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.boards (dealership_id, key, label, position, stages) VALUES
  (NEW.id, 'main', 'Main Board', 0, '[
    {"key":"inbound_trade_in","label":"Inbound / Trade-In"},
    {"key":"service","label":"Service"},
    {"key":"detail_backlog","label":"Detail Backlog"},
    {"key":"active_detail","label":"Active Detail"},
    {"key":"ready_for_photos","label":"Ready for Photos"},
    {"key":"price_for_lot","label":"Price for Lot"}
  ]'::jsonb),
  (NEW.id, 'loaners', 'Loaners', 1, '[
    {"key":"loaners","label":"Loaners"},
    {"key":"service_loaners","label":"Service Loaners"}
  ]'::jsonb),
  (NEW.id, 'body_shop', 'Body Shop', 2, '[{"key":"body_shop","label":"Body Shop"}]'::jsonb),
  (NEW.id, 'waiting_on_title', 'Waiting on Title', 3, '[{"key":"waiting_on_title","label":"Waiting on Title"}]'::jsonb),
  (NEW.id, 'auction_wholesale', 'Auction / Wholesale', 4, '[{"key":"auction_wholesale","label":"Auction / Wholesale"}]'::jsonb);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_dealership_created ON dealerships;
CREATE TRIGGER on_dealership_created
  AFTER INSERT ON dealerships
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_boards();

-- 4. Audit trail — who added a note, who created a vehicle, who marked it
-- complete.
ALTER TABLE vehicle_notes ADD COLUMN IF NOT EXISTS author_email text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS created_by_email text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS completed_by_email text;
