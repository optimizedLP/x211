import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { StatusBadge, WarrantyBadge } from '../components/Badge'
import { useAuth } from '../lib/authContext'
import { NOW } from '../lib/clock'
import type { DeviceQuery } from '../lib/data'
import { inventory } from '../lib/data'
import { devicesToCsv, downloadCsv, exportFilename } from '../lib/exportDevices'
import type { Category, Device, DeviceStatus, Location } from '../lib/types'
import { ACTIVE_STATUSES, DEVICE_STATUSES, RETIRED_STATUSES } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import { useInventoryVersion } from '../lib/useInventoryVersion'
import { daysRemaining, toIsoDate, warrantyBucket } from '../lib/warranty'

type SortKey = 'assetTag' | 'serial' | 'category' | 'location' | 'holder' | 'status' | 'warranty'

const COLUMNS: readonly { key: SortKey; label: string }[] = [
  { key: 'assetTag', label: 'Asset tag' },
  { key: 'serial', label: 'Serial' },
  { key: 'category', label: 'Category' },
  { key: 'location', label: 'Location' },
  { key: 'holder', label: 'Holder' },
  { key: 'status', label: 'Status' },
  { key: 'warranty', label: 'Warranty' },
]

function sortValue(
  device: Device,
  key: SortKey,
  categories: Map<string, Category>,
  locations: Map<string, Location>,
  now: Date,
): string | number {
  switch (key) {
    case 'assetTag':
      return device.assetTag ?? ''
    case 'serial':
      return device.serial ?? ''
    case 'category':
      return categories.get(device.categoryId)?.name ?? ''
    case 'location':
      return device.locationId ? (locations.get(device.locationId)?.name ?? '') : ''
    case 'holder':
      return device.assignedTo ?? ''
    case 'status':
      return device.status
    case 'warranty': {
      const days = daysRemaining(device.warrantyEnd, now)
      // Undated warranties sort last rather than jumping to the front.
      return days ?? Number.POSITIVE_INFINITY
    }
  }
}

function parseStatuses(raw: string | null): DeviceStatus[] {
  if (!raw) return []
  return raw
    .split(',')
    .filter((value): value is DeviceStatus => (DEVICE_STATUSES as readonly string[]).includes(value))
}

function SortHeader({
  column,
  activeKey,
  direction,
  onSort,
}: {
  column: { key: SortKey; label: string }
  activeKey: SortKey
  direction: 'asc' | 'desc'
  onSort: (key: SortKey) => void
}) {
  const active = activeKey === column.key
  return (
    <th scope="col" className="px-3 py-2.5 text-left">
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={`inline-flex items-center gap-1 text-[11px] font-bold tracking-wider uppercase transition-colors ${
          active ? 'text-accent' : 'text-muted hover:text-ink'
        }`}
      >
        {column.label}
        <span aria-hidden="true" className={active ? 'opacity-100' : 'opacity-0'}>
          {direction === 'asc' ? '▲' : '▼'}
        </span>
      </button>
    </th>
  )
}

export function Devices() {
  // Filters live in the URL, so opening a device and coming back returns to the
  // same list instead of a blank one. Sorting stays local — it is a view
  // preference, not a saved view.
  const [searchParams, setSearchParams] = useSearchParams()
  const [sortKey, setSortKey] = useState<SortKey>('warranty')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const search = searchParams.get('q') ?? ''
  const statuses = useMemo(() => parseStatuses(searchParams.get('status')), [searchParams])
  const categoryId = searchParams.get('category') ?? ''
  const locationId = searchParams.get('location') ?? ''
  const includeRetired = searchParams.get('retired') === '1'

  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  // Bulk selection. Ids rather than row objects, so sorting and refetching keep
  // the same devices selected; cleared whenever the filter changes so nothing
  // invisible is ever removed by a stale selection.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [confirmingBulkRemove, setConfirmingBulkRemove] = useState(false)
  const [bulkRemoving, setBulkRemoving] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  /**
   * A changed filter can hide rows, so anything selected is dropped: the bulk
   * action must never reach a device that is no longer on screen.
   */
  const resetSelection = () => {
    setSelectedIds(new Set())
    setConfirmingBulkRemove(false)
    setBulkError(null)
  }

  /** Replace rather than push, so the back button does not walk keystroke by keystroke. */
  const setParam = (key: string, value: string | null) => {
    resetSelection()
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  }

  // One shared "today" for the whole screen, so no two rows can disagree.
  const now = NOW

  const categoriesState = useAsync(() => inventory.listCategories(), [])
  const locationsState = useAsync(() => inventory.listLocations(), [])

  const query = useMemo<DeviceQuery>(
    () => ({
      search: search.trim() || undefined,
      statuses: statuses.length ? statuses : undefined,
      categoryId: categoryId || undefined,
      locationId: locationId || undefined,
      includeRetired,
    }),
    [search, statuses, categoryId, locationId, includeRetired],
  )

  // Subscribed to writes, so a bulk removal (or an edit made on another
  // screen) refetches this list instead of leaving rows that no longer exist.
  const version = useInventoryVersion()
  const devicesState = useAsync(() => inventory.listDevices(query, now), [query, version])

  // Separates “nothing matches this search” from “there is nothing yet”. With the
  // demo fleet gone the list is genuinely empty on first run, and telling a new
  // user to clear filters on an empty fleet would be nonsense.
  const fleetState = useAsync(() => inventory.listDevices({ includeRetired: true }, now), [
    now,
    version,
  ])
  const fleetIsEmpty = (fleetState.data?.length ?? 0) === 0

  const categoryMap = useMemo(
    () => new Map((categoriesState.data ?? []).map((category) => [category.id, category])),
    [categoriesState.data],
  )
  const locationMap = useMemo(
    () => new Map((locationsState.data ?? []).map((location) => [location.id, location])),
    [locationsState.data],
  )

  const rows = useMemo(() => {
    const list = devicesState.data ?? []
    const direction = sortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const left = sortValue(a, sortKey, categoryMap, locationMap, now)
      const right = sortValue(b, sortKey, categoryMap, locationMap, now)
      if (typeof left === 'number' && typeof right === 'number') return direction * (left - right)
      return direction * String(left).localeCompare(String(right))
    })
  }, [devicesState.data, sortKey, sortDir, categoryMap, locationMap, now])

  const expiredCount = useMemo(
    () => rows.filter((device) => warrantyBucket(device.warrantyEnd, now) === 'expired').length,
    [rows, now],
  )

  // Only rows on screen count: a search that narrows the list cannot leave a
  // hidden device selected.
  const selectedRows = useMemo(
    () => rows.filter((device) => selectedIds.has(device.id)),
    [rows, selectedIds],
  )
  const allSelected = rows.length > 0 && selectedRows.length === rows.length
  const someSelected = selectedRows.length > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])

  // The export menu is a small popover: close it on outside click or Escape,
  // the same dismissal people expect from any menu.
  useEffect(() => {
    if (!exportOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [exportOpen])

  const toggleRow = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setConfirmingBulkRemove(false)
    setBulkError(null)
  }

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((device) => device.id)))
    setConfirmingBulkRemove(false)
    setBulkError(null)
  }

  const removeSelected = async () => {
    if (bulkRemoving || selectedRows.length === 0) return
    setBulkRemoving(true)
    setBulkError(null)
    try {
      await inventory.deleteDevices(selectedRows.map((device) => device.id))
      setSelectedIds(new Set())
      setConfirmingBulkRemove(false)
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : String(error))
    } finally {
      setBulkRemoving(false)
    }
  }

  const hasFilters =
    search.trim() !== '' || statuses.length > 0 || categoryId !== '' || locationId !== '' || includeRetired

  const clearFilters = () => {
    resetSelection()
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  const toggleRetired = () => {
    resetSelection()
    const showRetired = !includeRetired
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (showRetired) {
          next.set('retired', '1')
          return next
        }
        next.delete('retired')
        // Drop retired status filters that are about to be hidden from the UI.
        const kept = statuses.filter((status) => !RETIRED_STATUSES.includes(status))
        if (kept.length) next.set('status', kept.join(','))
        else next.delete('status')
        return next
      },
      { replace: true },
    )
  }

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((previous) => (previous === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  // Retired states only make sense while retired records are visible, and the
  // dropdown is single-select, matching Category and Location.
  const statusOptions = includeRetired ? DEVICE_STATUSES : ACTIVE_STATUSES
  const statusFilter = statuses[0] ?? ''

  // Export always covers exactly the rows on screen (filtered + sorted), so a
  // filtered view exports that slice and the unfiltered list exports the fleet.
  const activeCategoryName =
    categoryId !== ''
      ? (categoriesState.data ?? []).find((category) => category.id === categoryId)?.name ?? ''
      : ''
  const activeLocationName =
    locationId !== ''
      ? (locationsState.data ?? []).find((location) => location.id === locationId)?.name ?? ''
      : ''
  const exportHint = statusFilter || activeCategoryName || activeLocationName || search.trim() || null
  const exportDescription = [
    statusFilter ? `Status: ${statusFilter}` : null,
    activeCategoryName ? `Category: ${activeCategoryName}` : null,
    activeLocationName ? `Location: ${activeLocationName}` : null,
    search.trim() ? `Search: “${search.trim()}”` : null,
    includeRetired ? 'Including retired' : null,
  ].filter((part): part is string => part !== null)
  const exportDateLabel = toIsoDate(NOW)

  const handleExportCsv = () => {
    setExportOpen(false)
    if (rows.length === 0) return
    downloadCsv(exportFilename(exportHint), devicesToCsv(rows, categoryMap, locationMap))
  }

  const handleExportPrint = () => {
    setExportOpen(false)
    if (rows.length === 0) return
    window.print()
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
          <p className="mt-1 text-sm text-muted">
            Search across asset tag, serial, room, model, holder and status.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Import stays reachable from the empty state and /import itself; the
              header keeps a single primary action. */}
          {isAdmin && (
            <div className="flex flex-wrap justify-end gap-2">
              <Link
                to="/devices/new"
                className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
              >
                + New device
              </Link>
            </div>
          )}
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{rows.length}</div>
            <div className="text-xs text-muted">
              {expiredCount > 0 && <span className="text-bad">{expiredCount} out of warranty</span>}
            </div>
            <Link
              to="/warranty"
              className="mt-1 inline-block text-xs font-semibold text-accent hover:text-ink"
            >
              Warranty →
            </Link>
          </div>
        </div>
      </header>

      <div className="space-y-3 rounded-xl border border-line bg-panel p-4 print:hidden">
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
            ⌕
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => setParam('q', event.target.value)}
            aria-label="Search devices"
            className="w-full rounded-lg border border-line bg-panel-2 py-2 pr-9 pl-8 text-sm text-ink focus:border-accent/60 focus:ring-2 focus:ring-accent/20 focus:outline-none"
          />
          {/* A native placeholder cannot style half its text, so the hint is an
              overlay: "Try" stays upright and the examples are italic. */}
          {!search && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-8 max-w-[calc(100%-4rem)] -translate-y-1/2 truncate text-sm text-muted/70"
            >
              Try <em>"iPad", "asset tag", "s/n", or "room 326"...</em>
            </span>
          )}
          {search && (
            <button
              type="button"
              onClick={() => setParam('q', null)}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-muted hover:text-ink"
            >
              clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2 text-muted">
            Category
            <select
              value={categoryId}
              onChange={(event) => setParam('category', event.target.value)}
              className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-xs text-ink focus:border-accent/60 focus:outline-none"
            >
              <option value="">All</option>
              {(categoriesState.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-muted">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setParam('status', event.target.value)}
              className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-xs text-ink focus:border-accent/60 focus:outline-none"
            >
              <option value="">All</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-muted">
            Location
            <select
              value={locationId}
              onChange={(event) => setParam('location', event.target.value)}
              className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-xs text-ink focus:border-accent/60 focus:outline-none"
            >
              <option value="">All</option>
              {(locationsState.data ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-muted">
            <input
              type="checkbox"
              checked={includeRetired}
              onChange={toggleRetired}
              className="size-3.5 accent-accent"
            />
            Include retired (obsolete / disposed)
          </label>

          {isAdmin && (
            <label className="flex items-center gap-2 text-muted">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={rows.length === 0}
                className="size-3.5 accent-accent disabled:opacity-40"
              />
              Select all
              {someSelected && (
                <span className="text-[11px]">
                  ({selectedRows.length} of {rows.length})
                </span>
              )}
            </label>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Notion-style export: arrow up into a bar. Menu offers CSV for
                Excel and Print/PDF for paper or file — both cover exactly the
                rows on screen. Visible to guests too: they can already read
                everything shown here. */}
            <div ref={exportMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setExportOpen((previous) => !previous)}
                aria-haspopup="menu"
                aria-expanded={exportOpen}
                aria-label="Export visible devices"
                title={
                  rows.length === 0
                    ? 'Nothing to export'
                    : `Export ${rows.length} visible ${rows.length === 1 ? 'device' : 'devices'} as CSV or print`}
                disabled={rows.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-default disabled:opacity-40"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 2.5h10" />
                  <path d="M8 13V5.5" />
                  <path d="M5.2 8.3 8 5.5l2.8 2.8" />
                </svg>
                Export
              </button>
              {exportOpen && rows.length > 0 && (
                <div
                  role="menu"
                  aria-label="Export format"
                  className="absolute top-full right-0 z-30 mt-1.5 w-52 overflow-hidden rounded-xl border border-line bg-panel shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleExportCsv}
                    className="block w-full px-3.5 py-2.5 text-left transition-colors hover:bg-panel-2"
                  >
                    <span className="block text-xs font-semibold text-ink">CSV (Excel)</span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      Spreadsheet of the {rows.length} visible{' '}
                      {rows.length === 1 ? 'row' : 'rows'}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleExportPrint}
                    className="block w-full border-t border-line px-3.5 py-2.5 text-left transition-colors hover:bg-panel-2"
                  >
                    <span className="block text-xs font-semibold text-ink">Print / PDF</span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      Manifest for paper or Save as PDF
                    </span>
                  </button>
                </div>
              )}
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:border-accent/40 hover:text-accent"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {devicesState.error && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
          Could not load devices: {devicesState.error.message}
        </div>
      )}

      {isAdmin && selectedRows.length > 0 && (
        <div className="space-y-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-xs print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-ink">
              {selectedRows.length} {selectedRows.length === 1 ? 'device' : 'devices'} selected
            </span>
            {!confirmingBulkRemove ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmingBulkRemove(true)}
                  className="rounded-lg border border-bad/50 bg-bad/10 px-3 py-1.5 font-semibold text-bad transition-colors hover:bg-bad/20"
                >
                  Remove selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="rounded-lg border border-line px-3 py-1.5 font-semibold text-muted transition-colors hover:text-ink"
                >
                  Clear selection
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={removeSelected}
                  disabled={bulkRemoving}
                  className="rounded-lg border border-bad/50 bg-bad/15 px-3 py-1.5 font-semibold text-bad transition-colors hover:bg-bad/25 disabled:opacity-40"
                >
                  {bulkRemoving
                    ? 'Removing…'
                    : `Remove ${selectedRows.length} ${selectedRows.length === 1 ? 'device' : 'devices'}`}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingBulkRemove(false)}
                  disabled={bulkRemoving}
                  className="rounded-lg border border-line px-3 py-1.5 font-semibold text-muted transition-colors hover:text-ink disabled:opacity-40"
                >
                  Cancel
                </button>
                <span className="text-muted">
                  Nothing is erased — they move to{' '}
                  <strong className="text-ink">Recently removed</strong>, where each can be restored.
                </span>
              </>
            )}
          </div>
          {bulkError && (
            <p className="rounded-lg border border-bad/40 bg-bad/15 px-3 py-2 text-bad">
              Nothing was removed: {bulkError}
            </p>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-panel print:hidden">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-line bg-panel-2">
            <tr>
              {isAdmin && (
                <th scope="col" className="w-9 px-3 py-2.5 text-left">
                  <span className="sr-only">Select</span>
                  <span aria-hidden="true" className="text-[11px] font-bold tracking-wider text-muted uppercase">
                    ✓
                  </span>
                </th>
              )}
              {COLUMNS.map((column) => (
                <SortHeader
                  key={column.key}
                  column={column}
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                category={categoryMap.get(device.categoryId)}
                location={device.locationId ? locationMap.get(device.locationId) : undefined}
                now={now}
                selectable={isAdmin}
                selected={selectedIds.has(device.id)}
                onToggleSelect={() => toggleRow(device.id)}
                onOpen={() => navigate(`/devices/${device.id}`)}
              />
            ))}
          </tbody>
        </table>

        {devicesState.loading && rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted">Loading devices…</p>
        )}

        {!devicesState.loading && rows.length === 0 && (
          <div className="px-4 py-12 text-center">
            {fleetIsEmpty ? (
              <>
                <p className="text-sm text-ink">No devices yet.</p>
                <p className="mt-1 text-xs text-muted">
                  {isAdmin
                    ? 'Import the spreadsheet, scan a label, or type one in by hand.'
                    : 'An admin adds and imports devices. This account can browse what is here.'}
                </p>
                {isAdmin && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Link
                      to="/devices/new"
                      className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
                    >
                      Add your first devices
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-ink">No devices match those filters.</p>
                <p className="mt-1 text-xs text-muted">
                  {includeRetired
                    ? 'Try loosening the search or clearing a filter.'
                    : 'Retired devices are hidden — tick “Include retired” to see obsolete and disposed units.'}
                </p>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-4 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent"
                  >
                    Clear filters
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/*
       * Only the device list offers the bin, and only to an admin: it restores
       * and erases records. It is deliberately quiet and sits after the table,
       * because removing a record is a rare undo, not a destination — and it
       * makes no sense on the warranty or supplies pages.
       */}
      {isAdmin && (
        <div className="border-t border-line/70 pt-3.5 print:hidden">
          <Link
            to="/removed"
            title="Recover a record that was removed by mistake"
            className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] text-muted/80 transition-colors hover:bg-panel-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            <span aria-hidden="true">↺</span> Recently removed
          </Link>
        </div>
      )}

      {/* Print-only manifest: hidden on screen, the only thing printed. Same
          rows and order as the visible table, as plain text for paper/PDF. */}
      <section aria-hidden="true" className="hidden print:block">
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>x211 Device list</h1>
        <p style={{ fontSize: 12, marginTop: 4 }}>
          {rows.length} {rows.length === 1 ? 'device' : 'devices'} · {exportDateLabel}
          {exportDescription.length > 0 ? ` · ${exportDescription.join(' · ')}` : ''}
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 11 }}>
          <thead>
            <tr>
              {['Asset tag', 'Serial', 'Category', 'Location', 'Holder', 'Status', 'Warranty'].map(
                (heading) => (
                  <th
                    key={heading}
                    style={{ textAlign: 'left', borderBottom: '1px solid #999', padding: '6px 8px' }}
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((device) => (
              <tr key={device.id}>
                <td style={{ borderBottom: '1px solid #ccc', padding: '5px 8px' }}>
                  {device.assetTag ?? 'no tag'}
                </td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '5px 8px' }}>
                  {device.serial ?? 'no serial'}
                </td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '5px 8px' }}>
                  {categoryMap.get(device.categoryId)?.name ?? '—'}
                </td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '5px 8px' }}>
                  {device.locationId ? (locationMap.get(device.locationId)?.name ?? '—') : 'unassigned'}
                </td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '5px 8px' }}>
                  {device.assignedTo ?? '—'}
                </td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '5px 8px' }}>{device.status}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '5px 8px' }}>
                  {device.warrantyEnd ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function DeviceRow({
  device,
  category,
  location,
  now,
  selectable,
  selected,
  onToggleSelect,
  onOpen,
}: {
  device: Device
  category: Category | undefined
  location: Location | undefined
  now: Date
  selectable: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
}) {
  return (
    <tr
      onClick={onOpen}
      className={`cursor-pointer border-b border-line/70 last:border-b-0 hover:bg-white/[0.02] ${
        selected ? 'bg-accent/[0.06]' : ''
      }`}
    >
      {selectable && (
        <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
          {/* A tick must not open the record: the cell stops the row click. */}
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${device.assetTag ?? device.model}`}
            className="size-3.5 accent-accent"
          />
        </td>
      )}
      <td className="px-3 py-2.5 whitespace-nowrap">
        {/* The link carries the keyboard/screen-reader path; the row click is the mouse path. */}
        <Link
          to={`/devices/${device.id}`}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Open ${device.assetTag ?? device.model}`}
          className="inline-block rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {device.assetTag ? (
            <span className="font-mono text-[12.5px] text-ink">{device.assetTag}</span>
          ) : (
            <span className="text-xs text-warn italic">no tag</span>
          )}
        </Link>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {device.serial ? (
          <span className="font-mono text-[12.5px] text-muted">{device.serial}</span>
        ) : (
          <span className="text-xs text-warn italic">no serial</span>
        )}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-muted">{category?.name ?? '—'}</td>
      <td className="px-3 py-2.5 whitespace-nowrap text-muted">
        {location?.name ?? (device.locationId ? '—' : 'unassigned')}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-muted">
        {device.assignedTo ?? <span className="text-muted/60">—</span>}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <StatusBadge status={device.status} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <WarrantyBadge warrantyEnd={device.warrantyEnd} now={now} />
          <span className="font-mono text-[11px] text-muted">{device.warrantyEnd ?? '—'}</span>
        </div>
      </td>
    </tr>
  )
}
