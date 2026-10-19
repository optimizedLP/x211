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

**Deployed.** A Supabase-backed inventory with a single access code, plus a public sample-data demo. The real fleet starts empty and is filled by hand or by CSV import.

| | |
|---|---|
| Built | App shell and routing · device list · instant cross-field search · status/category/location filters (kept in the URL) · sorting · warranty buckets with a shared "today" · warranty dashboard (expired / 30 / 60 / 90-day buckets, single + bulk declare obsolete with undo) · device detail with full-record editing (status, holder, asset tag, serial, warranty end, location, notes) · **new-device form** · **CSV/TSV import** with column mapping, dry-run validation and duplicate detection · **remove / restore** (soft delete with a *Recently removed* bin and permanent erase) |
| Planned | peripherals & other unlabeled supplies (the one planned stub in the nav) · scan/OCR capture · native `.xlsx` reading — Excel's *Save As → CSV UTF-8* is the supported path |
| Backend | Supabase — Postgres with row-level security. A browser-local adapter remains for the demo and for offline use |

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

## Data layer

Nothing in the UI talks to a database directly. Everything goes through one interface,
`InventoryAdapter` in `src/lib/data/types.ts`, implemented by Supabase in production and by
`localStorage` in the demo:

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
    demo.ts         demo-build flag (sample data + hash routing)
    data/
      types.ts      the InventoryAdapter seam
      supabaseAdapter.ts  Postgres implementation, used by the real app
      mockAdapter.ts  browser-local implementation, used by the demo
      seed.ts       blank fleet + categories (rooms and staff are learned)
      demoSeed.ts   invented fleet for the public demo only
  components/       app shell, badges, the shared device field set, placeholder pages
  routes/           Devices, DeviceDetail, NewDevice, Import, Removed, WarrantyCliff + planned stubs
```

## Notes

- Tailwind CSS v4 (via `@tailwindcss/vite`), React 19, React Router 7, TypeScript in strict mode.
