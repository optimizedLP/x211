import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge, WarrantyBadge } from '../components/Badge'
import { NOW } from '../lib/clock'
import { inventory } from '../lib/data'
import type { Category, Device, DeviceStatus, Location, Tone } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import { useInventoryVersion } from '../lib/useInventoryVersion'
import type { WarrantyBucket } from '../lib/warranty'
import {
  daysRemaining,
  WARRANTY_BUCKET_LABELS,
  WARRANTY_BUCKET_TONES,
} from '../lib/warranty'

/** The cliff, in the order it matters: already past, then the three horizons. */
const CLIFF_BUCKETS = ['expired', 'd30', 'd60', 'd90'] as const

const OTHER_BUCKETS = ['ok', 'unknown'] as const

const BUCKET_HINTS: Record<WarrantyBucket, string> = {
  expired: 'No repair possible — declare obsolete',
  d30: 'Act this month',
  d60: 'Next 60 days',
  d90: 'This quarter',
  ok: 'No action needed',
  unknown: 'Needs a date',
}

const COUNT_CLASSES: Record<Tone, string> = {
  ok: 'text-accent-2',
  info: 'text-accent',
  warn: 'text-warn',
  bad: 'text-bad',
  muted: 'text-muted',
}

interface DeclareNotice {
  ids: readonly string[]
  /** Status per device before the change, so undo restores each one exactly. */
  previous: Record<string, DeviceStatus>
}

function BucketTile({
  bucket,
  count,
  active,
  onSelect,
}: {
  bucket: WarrantyBucket
  count: number
  active: boolean
  onSelect: () => void
}) {
  const tone = WARRANTY_BUCKET_TONES[bucket]
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`rounded-xl border p-4 text-left transition-colors ${
        active
          ? 'border-accent bg-accent/10'
          : 'border-line bg-panel hover:border-accent/40 hover:bg-panel-2'
      }`}
    >
      <div className={`text-3xl font-semibold tabular-nums ${COUNT_CLASSES[tone]}`}>{count}</div>
      <div className="mt-1 text-sm font-semibold text-ink">{WARRANTY_BUCKET_LABELS[bucket]}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-muted">{BUCKET_HINTS[bucket]}</div>
    </button>
  )
}

export function WarrantyCliff() {
  const [bucket, setBucket] = useState<WarrantyBucket>('expired')
  const [selected, setSelected] = useState<readonly string[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<DeclareNotice | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // One shared "today" for the whole screen, same as the device list.
  const now = NOW
  const version = useInventoryVersion()

  const summaryState = useAsync(() => inventory.warrantySummary(now), [now, version])
  const categoriesState = useAsync(() => inventory.listCategories(), [])
  const locationsState = useAsync(() => inventory.listLocations(), [])

  const devicesState = useAsync(
    () => inventory.listDevices({ warrantyBuckets: [bucket], includeRetired: false }, now),
    [bucket, now, version],
  )

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
    return [...list].sort((a, b) => {
      const left = daysRemaining(a.warrantyEnd, now)
      const right = daysRemaining(b.warrantyEnd, now)
      if (left === null && right === null) return (a.assetTag ?? '').localeCompare(b.assetTag ?? '')
      if (left === null) return 1
      if (right === null) return -1
      return left - right
    })
  }, [devicesState.data, now])

  const canDeclare = bucket === 'expired'
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const selectedDevices = useMemo(
    () => rows.filter((device) => selectedSet.has(device.id)),
    [rows, selectedSet],
  )

  const selectBucket = (next: WarrantyBucket) => {
    setBucket(next)
    setSelected([])
    setActionError(null)
  }

  const toggleSelected = (id: string) => {
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    )
  }

  const toggleAll = () => {
    const allSelected = rows.length > 0 && selected.length === rows.length
    setSelected(allSelected ? [] : rows.map((device) => device.id))
  }

  const declareObsolete = async (devices: readonly Device[]) => {
    if (devices.length === 0 || busy) return
    setBusy(true)
    setActionError(null)
    const previous: Record<string, DeviceStatus> = {}
    for (const device of devices) previous[device.id] = device.status

    try {
      await inventory.updateDevices(
        devices.map((device) => device.id),
        { status: 'Obsolete' },
      )
      setNotice({ ids: devices.map((device) => device.id), previous })
      setSelected([])
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const undo = async () => {
    if (!notice || busy) return
    setBusy(true)
    try {
      await Promise.all(
        notice.ids.map((id) =>
          inventory.updateDevice(id, { status: notice.previous[id] as DeviceStatus }),
        ),
      )
      setNotice(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const summary = summaryState.data
  const shownCount = summaryState.loading ? '…' : String(summary?.[bucket] ?? 0)
  const allSelected = rows.length > 0 && selected.length === rows.length

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Warranty cliff</h1>
          <p className="mt-1 text-sm text-muted">
            Inside warranty you can open a repair ticket. Past it, nothing can be done — the device is
            declared obsolete and DOE collects it. This is the whole decision, ordered by urgency.
          </p>
        </div>
        <Link
          to="/"
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/40 hover:text-accent"
        >
          Device list →
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CLIFF_BUCKETS.map((key) => (
          <BucketTile
            key={key}
            bucket={key}
            count={summary?.[key] ?? 0}
            active={bucket === key}
            onSelect={() => selectBucket(key)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Also view</span>
        {OTHER_BUCKETS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => selectBucket(key)}
            aria-pressed={bucket === key}
            className={`rounded-lg border px-2.5 py-1.5 transition-colors ${
              bucket === key
                ? 'border-accent/50 bg-accent/15 font-semibold text-accent'
                : 'border-line bg-panel-2 text-muted hover:text-ink'
            }`}
          >
            {WARRANTY_BUCKET_LABELS[key]} · {summary?.[key] ?? 0}
          </button>
        ))}
        <span className="ml-auto text-muted">
          {summaryState.error ? 'Counts unavailable' : 'Counts exclude retired units'}
        </span>
      </div>

      {summaryState.error && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
          Could not load warranty counts: {summaryState.error.message}
        </div>
      )}

      {actionError && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
          Could not update devices: {actionError}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold tracking-tight">{WARRANTY_BUCKET_LABELS[bucket]}</h2>
            <span className="text-sm text-muted tabular-nums">{shownCount} devices</span>
          </div>
          {!canDeclare && bucket !== 'unknown' && (
            <p className="text-xs text-muted">
              Still inside warranty — nothing to declare obsolete yet.
            </p>
          )}
          {bucket === 'unknown' && (
            <p className="text-xs text-warn">These units need a warranty end date before they can be judged.</p>
          )}
        </div>

        {canDeclare && selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
            <span className="font-semibold text-accent">{selected.length} selected</span>
            <button
              type="button"
              onClick={() => declareObsolete(selectedDevices)}
              disabled={busy}
              className="rounded-lg border border-bad/50 bg-bad/15 px-3 py-1.5 text-xs font-semibold text-bad transition-colors hover:bg-bad/25 disabled:opacity-50"
            >
              {busy ? 'Working…' : `Declare ${selected.length} obsolete`}
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-xs text-muted hover:text-ink"
            >
              Clear selection
            </button>
          </div>
        )}

        {devicesState.error && (
          <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
            Could not load devices: {devicesState.error.message}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-line bg-panel-2">
              <tr>
                {canDeclare && (
                  <th scope="col" className="w-10 px-3 py-2.5 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all devices in this bucket"
                      className="size-3.5 accent-[#5b8cff]"
                    />
                  </th>
                )}
                {['Asset tag', 'Serial', 'Category', 'Model', 'Location', 'Status', 'Warranty'].map(
                  (label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-3 py-2.5 text-left text-[11px] font-bold tracking-wider text-muted uppercase"
                    >
                      {label}
                    </th>
                  ),
                )}
                {canDeclare && (
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-right text-[11px] font-bold tracking-wider text-muted uppercase"
                  >
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((device) => (
                <CliffRow
                  key={device.id}
                  device={device}
                  category={categoryMap.get(device.categoryId)}
                  location={device.locationId ? locationMap.get(device.locationId) : undefined}
                  now={now}
                  selectable={canDeclare}
                  checked={selectedSet.has(device.id)}
                  onToggle={() => toggleSelected(device.id)}
                  onDeclare={() => declareObsolete([device])}
                  busy={busy}
                />
              ))}
            </tbody>
          </table>

          {devicesState.loading && rows.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted">Loading devices…</p>
          )}

          {!devicesState.loading && rows.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-ink">No devices in this bucket.</p>
              <p className="mt-1 text-xs text-muted">
                Retired units are excluded — once declared obsolete they leave the cliff and join the
                retired fleet.
              </p>
            </div>
          )}
        </div>
      </section>

      {notice && (
        <div
          role="status"
          className="fixed right-5 bottom-5 z-50 flex max-w-sm items-start gap-4 rounded-xl border border-accent-2/50 bg-panel px-4 py-3 shadow-lg shadow-black/40"
        >
          <div className="text-sm">
            <p className="font-semibold text-ink">
              Declared {notice.ids.length} {notice.ids.length === 1 ? 'device' : 'devices'} obsolete
            </p>
            <p className="mt-0.5 text-xs text-muted">They moved into the retired fleet.</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={undo}
              disabled={busy}
              className="rounded-md border border-accent/50 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent disabled:opacity-50"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-[11px] text-muted hover:text-ink"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CliffRow({
  device,
  category,
  location,
  now,
  selectable,
  checked,
  onToggle,
  onDeclare,
  busy,
}: {
  device: Device
  category: Category | undefined
  location: Location | undefined
  now: Date
  selectable: boolean
  checked: boolean
  onToggle: () => void
  onDeclare: () => void
  busy: boolean
}) {
  return (
    <tr className="border-b border-line/70 last:border-b-0 hover:bg-white/[0.02]">
      {selectable && (
        <td className="px-3 py-2.5">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            aria-label={`Select ${device.assetTag ?? device.model}`}
            className="size-3.5 accent-[#5b8cff]"
          />
        </td>
      )}
      <td className="px-3 py-2.5 whitespace-nowrap">
        {device.assetTag ? (
          <span className="font-mono text-[12.5px] text-ink">{device.assetTag}</span>
        ) : (
          <span className="text-xs text-warn italic">no tag</span>
        )}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {device.serial ? (
          <span className="font-mono text-[12.5px] text-muted">{device.serial}</span>
        ) : (
          <span className="text-xs text-warn italic">no serial</span>
        )}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-muted">{category?.name ?? '—'}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="text-ink">{device.model}</span>
        <span className="ml-2 text-xs text-muted">{device.brand}</span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-muted">
        {location?.name ?? (device.locationId ? '—' : 'unassigned')}
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
      {selectable && (
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={onDeclare}
            disabled={busy}
            className="rounded-md border border-bad/40 bg-bad/10 px-2.5 py-1 text-[11px] font-semibold text-bad transition-colors hover:bg-bad/20 disabled:opacity-50"
          >
            Declare obsolete
          </button>
        </td>
      )}
    </tr>
  )
}
