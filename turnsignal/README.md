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
- [x] VIN decode (NHTSA API) — needs your real VIN to test
- [x] VIN camera scan — needs testing on your phone, camera behavior can't be tested from here
- [x] Stock number / mileage required fields
- [x] Per-column add button
- [x] Dealership name in header
- [ ] Drag-and-drop between columns (cards are added directly to a column for now; moving a card to a different stage isn't built yet)
- [ ] Owner/admin mode (needs a small database change first — ask me when you're ready)
- [ ] Loaner return date alerts, title aging alerts

## A note on board/stage values

Vehicles are stored with a `board` and `stage` value. Main board stages use:
`inbound_trade_in`, `service`, `detail_backlog`, `active_detail`, `ready_for_photos`, `price_for_lot`.
Sidebar boards use: `loaners`, `body_shop`, `waiting_on_title`, `auction_wholesale`.
These are internal values only — the app displays the friendly labels you
already know (e.g. "Inbound / Trade-In").
