-- Run this in Supabase SQL editor.
-- Enables real-time change events on the two tables that need live updates:
-- vehicles (so the board refreshes instantly when anyone moves a card) and
-- notifications (so the bell badge updates the moment a new notification lands).
ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
