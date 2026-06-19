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
- [x] Stock number / mileage required fields
- [x] Per-column add button
- [x] Dealership name in header
- [x] Move vehicles between stages — drag-and-drop (via a small handle on each card, works with mouse and touch) plus the dropdown as a guaranteed-to-work fallback
- [x] Loaner overdue badge (red, based on loaner_return_date)
- [x] Title aging alert (Waiting on Title uses a 10-day threshold instead of the standard 5-day one)
- [x] Owner mode — requires running `supabase/owner_mode_migration.sql` first (see below)
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
