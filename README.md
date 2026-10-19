# x211 — School Device Inventory

A website to track every device at a NYC public school — laptops, Chromebooks, iPads, monitors,
printers, chargers, peripherals — with warranty tracking and an obsolete/disposal workflow.

## Live

| | |
|---|---|
| App (access code required) | https://x211-nyc.vercel.app |
| Public demo (sample data) | https://optimizedlp.github.io/x211/ |

The demo is a separate build of this same code: invented devices, browser-local storage, no sign-in
and no backend credentials. See [Public demo](#public-demo-github-pages).

## Status

**Frontend spine, warranty dashboard, device detail/editing and data entry, running on browser-local data.** No backend yet, by design — and no demo rows: the fleet starts empty and is filled by hand or by CSV import.

| | |
|---|---|
| Built | App shell and routing · device list · instant cross-field search · status/category/location filters (kept in the URL) · sorting · warranty buckets with a shared "today" · warranty dashboard (expired / 30 / 60 / 90-day buckets, single + bulk declare obsolete with undo) · device detail with full-record editing (status, holder, asset tag, serial, warranty end, location, notes) · **new-device form** · **CSV/TSV import** with column mapping, dry-run validation and duplicate detection · **remove / restore** (soft delete with a *Recently removed* bin and permanent erase) |
| Planned | peripherals & other unlabeled supplies (the one planned stub in the nav) · scan/OCR capture · native `.xlsx` reading — Excel's *Save As → CSV UTF-8* is the supported path |
| Backend | Not started — the data layer is behind an interface so it can be swapped in later |

## Quick start

```bash
npm install
npm run dev         # http://localhost:5173
npm run build       # typecheck + production build (real app, Vercel)
npm run build:demo  # typecheck + sample-data build for GitHub Pages
npm run lint
```

## Public demo (GitHub Pages)

The showcase at https://optimizedlp.github.io/x211/ is built by `npm run build:demo`, which differs
from the real build in exactly four ways:

- **Invented data.** `src/lib/data/demoSeed.ts` supplies 44 fictional devices, ten rooms and seven
  people, with dates generated relative to the day the page loads. The real app still starts empty.
- **No backend.** `vite.config.ts` blanks `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in
  demo builds, so the browser-local adapter takes over and no credential can reach a public bundle.
  The Pages workflow fails the build if `dist` ever contains `supabase.co` or a publishable key.
- **Own storage key.** Demo data lives under `x211:demo:v1`, never mixed with local development data.
- **Hash routing.** Pages cannot rewrite unknown paths, so the demo uses `/#/devices/abc`; the real
  app keeps clean URLs. `base` is `/x211/` for Pages and `/` for Vercel.

`.github/workflows/pages.yml` builds and deploys on every push to `main`. One-time setup: repository
**Settings → Pages → Source: GitHub Actions**.

## Frontend first, backend later

The UI never talks to a database. Everything goes through one interface,
`InventoryAdapter` in `src/lib/data/types.ts`:

```ts
listDevices(query, now)   // filtering/search happens behind the interface
getDevice(id)
updateDevice(id, patch)
updateDevices(ids, patch) // one batch status change, not N round trips
createDevice(input)       // one record; throws on a duplicate asset tag
importDevices(inputs)     // bulk; duplicate tags are reported and skipped, never overwritten
deleteDevice(id)          // soft delete: hidden everywhere, still owns its tag
restoreDevice(id)
listDeletedDevices()
purgeDevice(id)           // permanent erase; refused unless already soft-deleted
listCategories()
listLocations()
listStaff()                 // holder picker — staff only, no student names
listBulkItems()
warrantySummary(now)      // bucket counts for the dashboard
```

Today that interface is implemented by `src/lib/data/mockAdapter.ts`, which keeps the records in this
browser's `localStorage`, starting from an empty fleet. When the Supabase project exists, add `supabaseAdapter.ts` implementing the
same interface and switch it on in `src/lib/data/index.ts`. **No component or route changes** — they
only know the interface.

Filtering and search deliberately live behind the interface rather than in the table component, so a
real backend can run them as SQL instead of shipping every row to the browser.

### Device detail and editing

`/devices/:id` is the full record: identity, assignment, warranty, notes, and an honest placeholder
where photos will go once file storage exists. Editing covers status, holder, asset tag, serial,
category, location, warranty end and notes. Blank fields save as "not recorded" — which is how a tag
gets filled in for the unlabeled units. Rows on the device list open the record by click or keyboard.

List filters live in the URL (`?q=`, `status=`, `category=`, `location=`, `retired=1`), so opening a
device and coming back restores the same list, and a filtered view is bookmarkable.

Writes go through `src/lib/data/index.ts`, which wraps the adapter and bumps a shared version
counter. Screens pass `useInventoryVersion()` into their fetch dependencies, so declaring a device
obsolete updates the warranty dashboard and the device list together.

### Adding devices

Two routes, one field set. `src/lib/deviceForm.ts` owns the form values, the validation and the
mapping onto `NewDeviceInput`, and `src/components/DeviceForm.tsx` renders the inputs — the detail
editor, the new-device form and the import all agree because there is only one implementation.

**Manual (`/devices/new`)** — for one unit at a time. Brand and category are required; model, tag and
serial are not, because a real share of the fleet has none of them yet. A duplicate asset tag is
refused, case-insensitively.

**Import (`/import`)** — upload a CSV/TSV or paste cells straight from Excel. Then:

1. **Column mapping**, guessed from the header names (`Asset Tag`, `S/N`, `Warranty Expiration`,
   `Assigned To`, …) and overridable per field. Brand and category are required; model is optional
   and sits at the end of the downloadable template.
2. **Dry run** — the preview is generated by the same function that produces the records, so what is
   shown is what would be written. Per-row errors (blank category, duplicate tag, unreadable date,
   warranty end before start) block that row; warnings (unknown status, unknown holder, unknown room,
   warranty end derived from the purchase date) let it through and say what was assumed.
3. **Commit** — only clean rows are written, then a result screen reports what landed and what was
   skipped because its tag already existed.

A *blank or unknown category* can be mapped to a fallback category, which is reported on each affected
row rather than applied quietly. Dates accept `YYYY-MM-DD`, `M/D/YYYY`, `M/D/YY` and Excel serial
numbers. Nothing is ever overwritten: a tag that exists is skipped, so the import can be re-run after
fixing a sheet. `Download CSV template` gives a blank file whose headers already map.

### Removing a record

Removal is a **soft delete**, because the common mistake is a mistyped or mis-imported record, not a
laptop vanishing. `Remove` on the device detail page asks you to type the asset tag, hides the record
from the list, the Warranty page and every counter, and sends you to **Recently removed** — the undo.
Restoring puts it back exactly as it was.

A removed record still owns its asset tag, so an import or a manual add cannot take the tag and leave
a restore primed to collide. Erasing for good is a second, separate click in the bin, and the data
layer refuses to purge anything that has not been removed first.

**This is not the disposal workflow.** A device that left the school should be set to `Disposed`, which
keeps its history; the confirmation panel says so in as many words, and so does the bin.


### Warranty counts

The dashboard counts only the fleet still in play — units already Obsolete or Disposed
are history. That keeps each bucket tile equal to the rows listed beneath it.

### Starting state

The fleet starts **empty**, and so do the room and holder lists. `src/lib/data/seed.ts` supplies only
the nine categories, which a device needs in order to exist.

Rooms and people are **learned from imports**: the first sheet that mentions “Room 214” or “M. Rivera”
creates that room and that holder in the same write, and the dry run says how many it will add
(“Also adds 2 new rooms and 3 new holders”). Matching ignores case, punctuation and a leading “Room”,
so “214”, “Room 214” and “room 214” are one room. Re-importing a known name adds nothing.

Devices enter either through **+ New device** or **Import**. Re-importing a sheet is safe: rows whose
asset tag already exists are refused in the dry run and skipped, and nothing is ever overwritten.

The dry run previews the first 30 rows and offers **Show all N rows** for the rest — every row is
validated whether it is on screen or not.

**Clear all data** in the top bar empties the fleet and asks for confirmation first — it is a local
reset, not a demo reseed. It only appears when no backend is configured; with Supabase the same slot
is **Sign out**.

## Layout

```
src/
  lib/
    types.ts        domain model (devices, statuses, categories, locations, bulk items)
    warranty.ts     warranty buckets, day countdowns and status tones
    dates.ts        tolerant spreadsheet date parsing (ISO, US, Excel serials)
    csv.ts          dependency-free RFC 4180 reader + separator detection
    sun.ts          local sunrise/sunset maths, no API and no network
    theme.ts        light-by-day / dark-by-night, with a remembered override
    importPlan.ts   column guessing, row validation and the dry-run plan
    deviceForm.ts   shared form values, validation and NewDeviceInput mapping
    reference.ts    room/staff name keys, shared by the importer and the adapter
    clock.ts        one shared "now", so no two rows disagree about today
    useAsync.ts     small loading/error hook for adapter calls
    useInventoryVersion.ts  subscribes screens to writes so they refetch
    data/
      types.ts      the InventoryAdapter seam
      mockAdapter.ts  localStorage implementation (swap this out later)
      seed.ts       blank fleet + categories (rooms and staff are learned)
  components/       app shell, badges, the shared device field set, placeholder pages
  routes/           Devices, DeviceDetail, NewDevice, Import, Removed, WarrantyCliff + planned stubs
```

## Data rules

- **No student names.** Holders are staff only (room/location plus staff initials). If a device is
  ever linked to a named student, FERPA applies.
- This is a **local operational tracker**, not a replacement for the official DOE asset system.

## Notes

- Tailwind CSS v4 (via `@tailwindcss/vite`), React 19, React Router 7, TypeScript in strict mode.
- The colour palette is defined once in `src/index.css`: light is the `:root` default, dark overrides
  under `html[data-theme='dark']`. `src/lib/theme.ts` sets that attribute from the sun, rechecking
  every 30 seconds; the glyph button in the bottom-right corner cycles auto → light → dark and the
  choice is remembered in `localStorage`.
- The top bar is full width and fixed, and carries the only navigation. "Recently removed" sits in a
  quiet footer link under the page content rather than in the menu.
