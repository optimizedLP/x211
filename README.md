# x211 — School Device Inventory

A website to track every device at a NYC public school — laptops, Chromebooks, iPads, monitors,
printers, chargers and peripherals — with warranty tracking and an obsolete/disposal workflow.

## What it does

- Device list with instant search, status/category/location filters (kept in the URL), sorting and a
  warranty dashboard split into expired / 30 / 60 / 90-day buckets.
- Full-record device editing, a new-device form, and CSV/TSV import with column mapping, dry-run
  validation and duplicate detection. Nothing is overwritten — a duplicate asset tag is skipped.
- Soft delete with a **Recently removed** bin: removing a record is undoable, while a device that
  left the school is marked **Disposed** so its history survives.
- Light by day, dark after sunset, with a remembered override.
- Supabase in production (Postgres + row-level security, one shared access code); browser-local
  storage for offline work and for the demo.

## Public demo

https://optimizedlp.github.io/x211/ — a separate build with invented sample data, and no sign-in.
