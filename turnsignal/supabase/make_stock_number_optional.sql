-- Run this in Supabase SQL editor — makes stock number optional at the
-- database level too, not just in the form. Safe to run even if it's
-- already nullable.
ALTER TABLE vehicles ALTER COLUMN stock_number DROP NOT NULL;
