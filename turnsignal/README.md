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
- [x] Boards and columns are now editable, Owner-only — rename, add, or delete any board or column per dealership (requires `supabase/boards_table_and_audit_migration.sql`). A "⚙ Manage" link appears next to the board tabs only when logged in as Owner.
- [x] Card title restyled — stock number is now bold and slightly larger, leading the rest of the title
- [x] Tap the day-count badge itself to open the stage timeline — no separate clock icon needed anymore
- [x] Per-dealership aging colors — Owner can set how many days until yellow/red for each dealership individually (requires `supabase/thresholds_and_names_migration.sql`). "🎨 Aging colors" appears next to "⚙ Manage" for Owner only.
- [x] Edit or delete any note after the fact — no more being stuck with a typo or a note on the wrong vehicle
- [x] First and last names — collected at signup, editable anytime via the new "Name" button. Notes, added-by, and completed-by all show the real name once it's set, falling back to the old email-based short name for anyone who hasn't set one yet.
- [x] Dealership roles — Manager, Sales, Service, Detail, Photo (requires `supabase/dealership_roles_migration.sql`). Owner can designate the first Manager for any dealership via the new "👤 Roles" button; once someone is a Manager, they can assign roles to others in their own dealership too — including at invite time. Roles are optional and don't restrict access yet (that's planned for later); right now they're just labels.
- [x] Notes modal auto-closes after adding a note instead of requiring a manual Close
- [x] Click anywhere on a card's title or details to edit it — the separate pencil button is gone
- [x] Board scroll resets to the start every time you switch tabs, instead of staying wherever it was left
- [x] Photos on each card — tap the photo icon next to Notes to view, add, or delete photos (requires `supabase/photos_and_damage_migration.sql`, sets up Supabase Storage for the first time)
- [x] Damage flag — a checkbox in the add/edit form; when checked, a bold "⚠ DAMAGE" badge shows directly on the card. Honest note: this is a visible on-board alert, not a push/email notification to a manager's phone — that's bigger infrastructure tied to the notifications system already on the roadmap.
- [x] Dealership groups — Owner can group dealerships together (e.g. "Johnson Motors") from the dealership picker, assigning each one via a dropdown on its card (requires `supabase/dealership_groups_migration.sql`). Anyone with the Manager role sees a new "🏢 Switch store" button letting them jump to any other store in their group with full access — same model as how Owner Mode already works, not view-only. A Manager only keeps Manager-only controls (Roles button, etc.) on their own home store, not on siblings they're visiting. Every new permission here is additive — nothing existing was modified, specifically to avoid repeating the earlier lockout.
- [x] Owner now automatically gets every feature a role gets, including the store switcher — fixed the gap where it only checked for Manager
- [x] Dealer list reorganized into three columns: Dealer Groups (one row per group, click to pick a specific store inside it), Dealers (standalone, ungrouped), and Paused
- [x] Analytics page — Owner and Manager only, "📊 Analytics" button right next to the dealership name. Current count and average time per stage, turn time (average/fastest/slowest) from Inbound to Price for Lot, bottleneck stage, longest-aging active vehicle, damage and overdue-loaner counts, all filterable by Today/Week/Month/Quarter/Year or a custom date range. Built from the existing `stage_history` and `vehicles` data — no new tables needed. Stats computation is kept separate from rendering specifically so a future chart view can reuse it directly.
- [x] Bottleneck stage recalculated — now based on current backlog (count × how long each vehicle has been sitting there right now), not just historical average duration. A single car stuck a week now correctly outweighs many cars moving quickly through a high-volume stage. Shared aging-threshold logic moved into `lib/aging.ts` so VehicleCard and Analytics can never drift apart.
- [x] Completed vehicles now collapse into a single "Completed (N)" toggle per column, Planner-style, instead of stacking up individually — tap to expand/collapse the whole group. Column header count now reflects active vehicles only, matching how Planner's main count works too.
- [x] Completed slim rows: the whole row is now tappable to pop back open (not just the narrow name text), with a clear chevron hint, and there's now an explicit way to collapse it back down again too
- [x] Mobile keyboard covering inputs in Notes and the Add/Edit vehicle form — added a scroll-into-view nudge once the keyboard finishes animating in. Honest caveat: this is a real iOS Safari viewport quirk, not something fully fixable from CSS alone — it should genuinely improve once this is wrapped as a native app shell later.
- [x] Dealerships and dealership groups can now be renamed anytime — editable name field on each, both in the dealer list and inside a group's member list. Uses permissions that already existed, no new SQL needed.
- [x] Owner profile deletion protection — the actual bug behind the recent account lockout. Dealership deletion no longer touches Owner-role profiles at all (the app code now explicitly excludes them), and a database trigger now makes it physically impossible for any Owner profile to be deleted by any code path, present or future, including raw SQL. Owner profiles no longer need a dealership_id at all (requires `supabase/protect_owner_profile_migration.sql`).
- [x] VIN scanner now validates against the real NHTSA checksum (49 CFR Part 565) — every North American VIN has a built-in check digit at position 9. The scanner pulls every possible 17-character window out of what it read and prefers whichever one actually passes the checksum, across both OCR passes, instead of just taking the first 17-character run it finds. If nothing passes, it says so clearly rather than silently accepting a likely-wrong guess.
- [x] Analytics headline renamed to "Turn Rate (Service → Price for Lot)" and recalculated to start from when a vehicle actually enters Service, not from Inbound — Inbound wait time (pickup/transit, out of the dealership's control) no longer counts toward it
- [x] "Aging red right now" no longer counts the Loaners board — those vehicles are already on the lot, out with customers or managers, not stuck in recon
- [x] Loaners board cards no longer show green/yellow/red color coding at all (still tracks and displays days, just neutral gray, same treatment Inbound already had) — shared aging logic now considers board, not just stage, so this can never drift out of sync between the cards and Analytics
- [x] Carrying cost (holding cost) — every card shows a running dollar total, using separate per-day rates for new vs used (requires `supabase/carrying_cost_migration.sql`). Rates live in Analytics (Owner/Manager only to edit, visible to everyone), with a live "Total carrying cost across active inventory" stat alongside it. A "New vehicle" checkbox on the add/edit form defaults smartly off the model year (current year or one year back) but is always manually overridable. Bonus consistency fix: Aging Colors is now Owner+Manager too, matching how every other dealership-level setting already works.
- [x] Carrying cost refined per clarified rules (requires `supabase/completed_at_migration.sql`): New vehicles' clock now starts when they actually enter Service (using the existing `recon_started_at`), not when the card is added — transit/inbound time never counts for new. Used still starts at card creation. Both freeze at the real moment of completion (a new `completed_at` timestamp) instead of climbing forever. Turn Rate's end point also moved to match — it's now "completed while in Price for Lot," not just "arrived in Price for Lot," since a vehicle can sit there a while before recon work is genuinely done. Card display simplified to just the dollar amount on its own line, no "holding cost" label, slightly more prominent than the surrounding details.
- [x] Carrying cost excludes the Loaners board entirely — those are vehicles already on the lot, not recon inventory accruing holding cost. Same exclusion pattern already used for aging colors.
- [x] Analytics: added "Added in this period," "Aging red right now" (a count, distinct from the single worst-case "longest aging"), and two clearly-marked placeholder cards reserved for floorplan cost data once that calculation is ready
- [x] Visible, always-on horizontal scrollbar for the board area — fixes desktop windows that aren't maximized having no obvious way to scroll
- [x] Completed vehicles now sink to the bottom of their column instead of sitting wherever their position value happens to place them
- [x] Stage history now shows duration down to the minute (e.g. "45 min", "3h 20m") instead of rounding to whole days, and timestamps include time-of-day
- [x] Waiting on Title now uses the exact same aging color thresholds as every other stage — its extra leniency is gone
- [x] Column headers are bolder and slightly larger so they stand out more
- [x] Header no longer overflows/freezes on phones — collapsed Invite/Name/Password/Dealer-list/Sign-out into a "⋯" dropdown menu, kept Switch Store and Analytics exactly where they were, and made the header wrap instead of ever pushing the page wider than the screen
- [x] Brightened low-contrast light-gray text on dark backgrounds (header captions/buttons, Analytics page header and headline card) — added a proper `mist` color specifically for this, since `steel` was too close to the dark background it sat on
- [x] Move a vehicle to any board, not just within the current one — the dropdown now groups every destination by board
- [x] Self-service signup — invite a teammate by email, they create their own password and get auto-linked to your dealership (requires `supabase/invite_system_migration.sql`)
- [x] Self-service password change — anyone logged in can change their own password, including accounts you created for them manually
- [x] Live cross-column drag preview — cards now visually shift into the column you're hovering over, not just on drop
- [x] Card title leads with stock number (e.g. "923567-2017 GMC Sierra 1500 SLT"), no longer duplicated below
- [x] Pause or permanently delete a dealership from Owner Mode (requires `supabase/deactivate_delete_dealership_migration.sql`) — pausing blocks their access without touching their data; delete requires typing the dealership's exact name to confirm
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
- [x] VIN scan — confirmed working end to end. The real bug turned out to be a crop-coordinate mismatch: the camera preview displays with `object-cover` (cropping the raw feed to fill the screen), but the photo capture was cropping based on the raw, uncropped frame instead of the on-screen displayed area — so the green guide box and the actual captured pixels were quietly misaligned, consistently losing the left side of the VIN. Fixed by computing the crop relative to the video's actual displayed bounding box. Combined with the NHTSA checksum validation above, this is now a reliable path, not a parked feature.

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
