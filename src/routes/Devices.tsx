import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { StatusBadge, WarrantyBadge } from '../components/Badge'
import { NOW } from '../lib/clock'
import type { DeviceQuery } from '../lib/data'
import { inventory } from '../lib/data'
import type { Category, Device, DeviceStatus, Location } from '../lib/types'
import { ACTIVE_STATUSES, DEVICE_STATUSES, RETIRED_STATUSES } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import { daysRemaining, warrantyBucket } from '../lib/warranty'

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

  /** Replace rather than push, so the back button does not walk keystroke by keystroke. */
  const setParam = (key: string, value: string | null) => {
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

  const devicesState = useAsync(() => inventory.listDevices(query, now), [query])

  // Separates “nothing matches this search” from “there is nothing yet”. With the
  // demo fleet gone the list is genuinely empty on first run, and telling a new
  // user to clear filters on an empty fleet would be nonsense.
  const fleetState = useAsync(() => inventory.listDevices({ includeRetired: true }, now), [now])
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

  const hasFilters =
    search.trim() !== '' || statuses.length > 0 || categoryId !== '' || locationId !== '' || includeRetired

  const clearFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  const toggleStatus = (status: DeviceStatus) => {
    const next = statuses.includes(status)
      ? statuses.filter((item) => item !== status)
      : [...statuses, status]
    setParam('status', next.length ? next.join(',') : null)
  }

  const toggleRetired = () => {
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

  const statusChips = includeRetired ? DEVICE_STATUSES : ACTIVE_STATUSES

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
          <p className="mt-1 text-sm text-muted">
            Search across asset tag, serial, room, model, holder and status.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              to="/import"
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/40 hover:text-accent"
            >
              Import
            </Link>
            <Link
              to="/devices/new"
              className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
            >
              + New device
            </Link>
          </div>
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

      <div className="space-y-3 rounded-xl border border-line bg-panel p-4">
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
            ⌕
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => setParam('q', event.target.value)}
            placeholder="Try “chromebook 214”, “X211-1050”, a serial, or a staff name…"
            aria-label="Search devices"
            className="w-full rounded-lg border border-line bg-panel-2 py-2 pr-9 pl-8 text-sm text-ink placeholder:text-muted/70 focus:border-accent/60 focus:ring-2 focus:ring-accent/20 focus:outline-none"
          />
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

        <div className="flex flex-wrap gap-1.5">
          {statusChips.map((status) => {
            const active = statuses.includes(status)
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                aria-pressed={active}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? 'border-accent/50 bg-accent/15 font-semibold text-accent'
                    : 'border-line bg-panel-2 text-muted hover:text-ink'
                }`}
              >
                {status}
              </button>
            )
          })}
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
            Include retired (obsolete / pickup / disposed)
          </label>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:border-accent/40 hover:text-accent"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {devicesState.error && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
          Could not load devices: {devicesState.error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-line bg-panel-2">
            <tr>
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
                  Add one by hand, or bring the spreadsheet you already keep in through the importer.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Link
                    to="/import"
                    className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
                  >
                    Import a CSV
                  </Link>
                  <Link
                    to="/devices/new"
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    + New device
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-ink">No devices match those filters.</p>
                <p className="mt-1 text-xs text-muted">
                  {includeRetired
                    ? 'Try loosening the search or clearing a filter.'
                    : 'Retired devices are hidden — tick “Include retired” to see obsolete, pickup and disposed units.'}
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
    </div>
  )
}

function DeviceRow({
  device,
  category,
  location,
  now,
  onOpen,
}: {
  device: Device
  category: Category | undefined
  location: Location | undefined
  now: Date
  onOpen: () => void
}) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-line/70 last:border-b-0 hover:bg-white/[0.02]"
    >
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
