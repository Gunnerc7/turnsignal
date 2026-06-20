-- Run this in Supabase SQL editor.

-- Mileage optional too, same reasoning as stock number.
ALTER TABLE vehicles ALTER COLUMN mileage DROP NOT NULL;

-- A simple optional color field — not VIN-decodable, so it's always manual.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS color text;
