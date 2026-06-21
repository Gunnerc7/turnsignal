# TurnSignal

Vehicle recon tracker for independent dealerships.

## What this is

This is the real, code-level version of TurnSignal, connected to the same
Supabase backend your Lovable project uses. No Lovable credits required to
keep building from here — changes happen directly in this code.

## Getting it live (no coding experience required)

1. **Create a GitHub repository.** Go to github.com, click "New repository,"
   name it `turnsignal`, and create it.
2. **Upload this code.** On the new repo's page, click "uploading an existing
   file" and drag in everything from this folder (you can drag the whole
   folder in most browsers).
3. **Connect it to Vercel.** Go to vercel.com, click "Add New Project," and
   select the `turnsignal` repository you just created.
4. **Add your environment variables in Vercel.** In the project setup screen,
   add two environment variables:
   - `VITE_SUPABASE_URL` → `https://ofsiaawfohekhpfmyqaf.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` → (the long key from your .env file)
5. **Click Deploy.** Vercel builds and hosts it automatically. You'll get a
   live URL in about a minute.

## Running it on your own computer (optional)

If you want to preview changes before deploying, you'll need Node.js
installed (nodejs.org, the LTS version). Then, in a terminal, inside this
folder:

```
npm install
npm run dev
```

That starts it at http://localhost:5173

## Status

- [x] Login (Supabase email/password auth)
- [x] Supabase connection wired to your real project
- [x] Main kanban board, reading/writing real data from your `vehicles` table
- [x] Sidebar boards (Loaners, Body Shop, Waiting on Title, Auction/Wholesale)
- [x] VIN decode (NHTSA API)
- [x] Stock number and mileage are both optional now — not every vehicle has them right away (requires `supabase/mileage_optional_and_color.sql`)
- [x] Optional color field, manual entry (VINs don't encode color)
- [x] Full editing — pencil icon on each card opens the same form pre-filled, saves changes instead of creating a duplicate
- [x] Delete a vehicle — from the edit modal (pencil icon), with confirmation
- [x] Completed cards collapse to a slim row, Planner-style — tap the name to peek at full details again
- [x] Loaners board now has two columns: Loaners and Service Loaners
- [x] Reorder cards within a column by dragging — uses the `position` column that already existed in the schema
- [x] Move a vehicle to any board, not just within the current one — the dropdown now groups every destination by board
- [x] Self-service signup — invite a teammate by email, they create their own password and get auto-linked to your dealership (requires `supabase/invite_system_migration.sql`)
- [x] Self-service password change — anyone logged in can change their own password, including accounts you created for them manually
- [x] Per-column add button
- [x] Dealership name in header
- [x] Move vehicles between stages — drag-and-drop (via a small handle on each card, works with mouse and touch) plus the dropdown as a guaranteed-to-work fallback
- [x] Loaner overdue badge (red, based on loaner_return_date)
- [x] Title aging alert (Waiting on Title uses a 10-day threshold instead of the standard 5-day one)
- [x] Total recon time tracking — the badge shows continuous total time since leaving Inbound/Trade-In, never resets on a stage move (requires `supabase/stage_history_migration.sql`)
- [x] Per-vehicle stage timeline — tap the clock icon on a card to see exactly how long it spent in each stage
- [x] Notes — multiple timestamped notes per vehicle, latest shown on the card, click to see full history (requires `supabase/notes_and_completed_migration.sql`)
- [x] Completed checkbox on each card, Planner-style (same migration above)
- [x] Owner mode — requires running `supabase/owner_mode_migration.sql` first (see below)
- [x] Add new dealerships directly from Owner Mode (no SQL needed for this part)

## Adding a user to any dealership (manual, for now)

Creating someone's actual login still has to be done manually — see "Owner mode setup" below for why. Once a dealership exists (built into the app now), add a person to it like this:

1. Lovable → Cloud icon → Users → create the new user (email + password, enable auto-confirm if available)
2. Copy that new user's UUID
3. Run this in the SQL editor, swapping in the real values:

```sql
INSERT INTO profiles (id, dealership_id, email, role)
VALUES (
  'PASTE_NEW_USER_UUID_HERE',
  (SELECT id FROM dealerships WHERE name = 'Johnson Motors Menomonie'),
  'their_email_here',
  'dealer'
);
```

That looks up the dealership by name, so this same snippet works for any dealership you've created — just change the name and the person's info.
- [ ] VIN camera scan — paused for now; many VIN stickers don't even have a barcode, and live barcode scanning in-browser turned out to be unreliable. Manual entry + Decode button is the current path.

## Owner mode setup (one-time)

1. Open `supabase/owner_mode_migration.sql` in this folder
2. Replace `YOUR_EMAIL_HERE` with your actual login email
3. Run the whole file in Supabase's SQL editor (Lovable → Cloud icon → Database → SQL editor)
4. Sign out and back in on the live app — you'll now see a dealership picker instead of going straight to a board

## On drag-and-drop

Vehicles move between stages using a "Move to…" dropdown on each card instead of
dragging. This was a deliberate choice: native drag-and-drop gestures are
unreliable on mobile browsers, and this tool is meant to be used on a phone
in a parking lot. A dropdown always works the same way regardless of device.
