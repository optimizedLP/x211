import { useState } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../components/Badge'
import { inventory } from '../lib/data'
import type { Device } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import { useInventoryVersion } from '../lib/useInventoryVersion'

function removedAt(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * The undo bin for soft-deleted records.
 *
 * Removal is deliberately reversible: the common mistake is a mistyped or
 * mis-imported record, not a laptop going missing. Erasing permanently is a
 * second, separate action, and the data layer refuses to purge anything that
 * has not been removed first.
 */
export function Removed() {
  const version = useInventoryVersion()
  const state = useAsync(() => inventory.listDeletedDevices(), [version])

  const [confirmEraseId, setConfirmEraseId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const devices = state.data ?? []

  const run = async (id: string, action: () => Promise<unknown>) => {
    if (busyId) return
    setBusyId(id)
    setError(null)
    try {
      await action()
      setConfirmEraseId(null)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/" className="text-xs text-muted transition-colors hover:text-accent">
          ← Devices
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Recently removed</h1>
        <p className="mt-1 text-sm text-muted">
          Removed records are hidden from the fleet, the warranty cliff and every counter, but nothing is
          erased. Restore one to put it back exactly where it was.
        </p>
      </div>

      <div className="rounded-xl border border-warn/30 bg-warn/[0.07] p-4 text-xs leading-relaxed text-muted">
        <strong className="text-ink">Removing is not disposing.</strong> A device that physically left the
        school should be set to <strong>Disposed</strong> so the record keeps its history. Remove is for
        records that were never real — a typo, a duplicate, a mis-imported row.
      </div>

      {error && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">{error}</div>
      )}

      {state.error && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
          Could not load removed records: {state.error.message}
        </div>
      )}

      {state.loading && devices.length === 0 && (
        <p className="text-sm text-muted">Loading removed records…</p>
      )}

      {!state.loading && devices.length === 0 && (
        <div className="rounded-xl border border-line bg-panel px-4 py-12 text-center">
          <p className="text-sm text-ink">Nothing has been removed.</p>
          <p className="mt-1 text-xs text-muted">
            Remove a record from its detail page and it will appear here, labelled with the time it went.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent"
          >
            Back to devices
          </Link>
        </div>
      )}

      {devices.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-line bg-panel-2">
              <tr>
                {['Device', 'Serial', 'Status', 'Removed', 'Actions'].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="px-3 py-2 text-left text-[11px] font-bold tracking-wider text-muted uppercase whitespace-nowrap"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <RemovedRow
                  key={device.id}
                  device={device}
                  busy={busyId === device.id}
                  confirming={confirmEraseId === device.id}
                  onRestore={() => run(device.id, () => inventory.restoreDevice(device.id))}
                  onAskErase={() => setConfirmEraseId(device.id)}
                  onCancelErase={() => setConfirmEraseId(null)}
                  onErase={() => run(device.id, () => inventory.purgeDevice(device.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RemovedRow({
  device,
  busy,
  confirming,
  onRestore,
  onAskErase,
  onCancelErase,
  onErase,
}: {
  device: Device
  busy: boolean
  confirming: boolean
  onRestore: () => void
  onAskErase: () => void
  onCancelErase: () => void
  onErase: () => void
}) {
  return (
    <tr className="border-b border-line/70 align-top last:border-b-0">
      <td className="px-3 py-2.5">
        <div className="font-mono text-[12.5px] text-ink">
          {device.assetTag ?? <span className="font-sans text-xs text-warn italic">no tag</span>}
        </div>
        <div className="text-xs text-muted">
          {device.brand} {device.model}
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono text-[12.5px] whitespace-nowrap text-muted">
        {device.serial ?? '—'}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <StatusBadge status={device.status} />
      </td>
      <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted">{removedAt(device.deletedAt)}</td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRestore}
            disabled={busy}
            className="rounded-lg border border-accent-2/40 bg-accent-2/10 px-2.5 py-1 text-xs font-semibold text-accent-2 transition-colors hover:bg-accent-2/20 disabled:opacity-40"
          >
            {busy ? 'Working…' : 'Restore'}
          </button>

          {confirming ? (
            <>
              <button
                type="button"
                onClick={onErase}
                disabled={busy}
                className="rounded-lg border border-bad/50 bg-bad/15 px-2.5 py-1 text-xs font-semibold text-bad transition-colors hover:bg-bad/25 disabled:opacity-40"
              >
                {busy ? 'Erasing…' : 'Yes, erase forever'}
              </button>
              <button
                type="button"
                onClick={onCancelErase}
                disabled={busy}
                className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:text-ink disabled:opacity-40"
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onAskErase}
              className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-bad/50 hover:text-bad"
            >
              Delete permanently
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
