import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { StatusBadge, WarrantyBadge } from '../components/Badge'
import { DeviceFields } from '../components/DeviceForm'
import { NOW } from '../lib/clock'
import { deviceToFormValues, formValuesToInput, validateDeviceForm } from '../lib/deviceForm'
import type { DeviceFormValues } from '../lib/deviceForm'
import { inventory } from '../lib/data'
import { useAsync } from '../lib/useAsync'
import { useInventoryVersion } from '../lib/useInventoryVersion'
import { warrantyLabel } from '../lib/warranty'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line/60 py-2 last:border-b-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm text-ink">{children}</dd>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <h2 className="mb-1 text-xs font-bold tracking-wider text-muted uppercase">{title}</h2>
      <dl>{children}</dl>
    </section>
  )
}

function Missing() {
  return <span className="text-xs text-warn italic">not recorded</span>
}

export function DeviceDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // One shared "today", same as every other screen.
  const now = NOW
  const version = useInventoryVersion()

  const deviceState = useAsync(() => inventory.getDevice(id), [id, version])
  const categoriesState = useAsync(() => inventory.listCategories(), [])
  const locationsState = useAsync(() => inventory.listLocations(), [])
  const staffState = useAsync(() => inventory.listStaff(), [])

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<DeviceFormValues | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const device = deviceState.data

  /** Back keeps list filters when there is history, and still works on a direct link. */
  const goBack = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate('/')
  }

  if (!device) {
    if (deviceState.loading) {
      return <p className="text-sm text-muted">Loading device…</p>
    }
    if (deviceState.error) {
      return (
        <div className="max-w-xl rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
          Could not load the device: {deviceState.error.message}
        </div>
      )
    }
    return (
      <div className="max-w-xl space-y-3 rounded-xl border border-line bg-panel p-6">
        <h1 className="text-lg font-semibold">No device with that id</h1>
        <p className="text-sm text-muted">
          The record may have been replaced by a demo reset. Search the fleet instead.
        </p>
        <Link to="/" className="inline-block text-sm font-semibold text-accent hover:text-ink">
          ← Back to devices
        </Link>
      </div>
    )
  }

  const categories = categoriesState.data ?? []
  const locations = locationsState.data ?? []
  const staff = staffState.data ?? []

  const category = categories.find((item) => item.id === device.categoryId)
  const room = locations.find((item) => item.id === device.locationId)
  const isSerialized = device.trackingType === 'serialized'

  const startEditing = () => {
    setForm(deviceToFormValues(device))
    setFormError(null)
    setSaveError(null)
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setForm(null)
    setFormError(null)
    setSaveError(null)
  }

  const update = <K extends keyof DeviceFormValues>(key: K, value: DeviceFormValues[K]) => {
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous))
  }

  const save = async () => {
    if (!form || saving) return
    const problem = validateDeviceForm(form)
    if (problem) {
      setFormError(problem)
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      await inventory.updateDevice(device.id, formValuesToInput(form))
      setEditing(false)
      setForm(null)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  /** Typed confirmation: the tag for a tagged unit, the word "remove" otherwise. */
  const confirmPhrase = device.assetTag ?? 'remove'
  const removalConfirmed = confirmText.trim().toLowerCase() === confirmPhrase.toLowerCase()

  const cancelRemoval = () => {
    setRemoving(false)
    setConfirmText('')
    setRemoveError(null)
  }

  const remove = async () => {
    if (removeBusy || !removalConfirmed) return
    setRemoveBusy(true)
    setRemoveError(null)
    try {
      await inventory.deleteDevice(device.id)
      // Land on the undo, not on a list where the record silently vanished.
      navigate('/removed')
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : String(error))
      setRemoveBusy(false)
    }
  }

  const restore = async () => {
    setActionError(null)
    try {
      await inventory.restoreDevice(device.id)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const missing = [
    !device.assetTag && 'asset tag',
    !device.serial && 'serial number',
    !device.warrantyEnd && 'warranty end date',
    !device.locationId && 'location',
  ].filter((item): item is string => Boolean(item))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={goBack}
            className="text-xs text-muted transition-colors hover:text-accent"
          >
            ← Devices
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {device.assetTag ?? 'Untagged device'}
            </h1>
            <StatusBadge status={device.status} />
            <WarrantyBadge warrantyEnd={device.warrantyEnd} now={now} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {device.brand} {device.model}
            {category && <span className="text-muted/70"> · {category.name}</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {warrantyLabel(device.warrantyEnd, now)}
            {device.warrantyEnd && <span className="text-muted/70"> · ends {device.warrantyEnd}</span>}
          </p>
        </div>

        {device.deletedAt ? (
          !editing && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startEditing}
                className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
              >
                Edit details
              </button>
              <button
                type="button"
                onClick={restore}
                className="rounded-lg border border-accent-2/40 bg-accent-2/10 px-3 py-1.5 text-xs font-semibold text-accent-2 transition-colors hover:bg-accent-2/20"
              >
                Restore record
              </button>
            </div>
          )
        ) : (
          !editing && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startEditing}
                className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
              >
                Edit details
              </button>
              <button
                type="button"
                onClick={() => {
                  setRemoving(true)
                  setConfirmText('')
                  setRemoveError(null)
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-bad/50 hover:text-bad"
              >
                Remove
              </button>
            </div>
          )
        )}
      </div>

      {saveError && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
          Could not save: {saveError}
        </div>
      )}

      {actionError && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
          {actionError}
        </div>
      )}

      {device.deletedAt && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
          <p className="font-semibold text-warn">This record is removed</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            It is out of the device list and the Warranty page, but nothing was erased. Restore it
            here, or from <strong>Recently removed</strong>.
          </p>
        </div>
      )}

      {removing && !device.deletedAt && (
        <div className="space-y-3 rounded-xl border border-bad/40 bg-bad/10 p-4">
          <p className="text-sm font-semibold text-bad">Remove {confirmPhrase}?</p>
          <p className="text-xs leading-relaxed text-muted">
            It drops out of the device list and the Warranty page. Nothing is erased — the record can
            be restored from <strong>Recently removed</strong>. If the device has left the
            school, set its status to <strong>Disposed</strong> instead: that is the action that keeps an
            audit trail.
          </p>
          <label className="block max-w-xs">
            <span className="text-xs text-muted">
              Type <span className="font-mono text-ink">{confirmPhrase}</span> to confirm
            </span>
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoComplete="off"
              aria-label={`Type ${confirmPhrase} to confirm removal`}
              className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 font-mono text-sm text-ink placeholder:text-muted/60 focus:border-bad/60 focus:ring-2 focus:ring-bad/20 focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={!removalConfirmed || removeBusy}
              className="rounded-lg border border-bad/50 bg-bad/15 px-3 py-1.5 text-xs font-semibold text-bad transition-colors hover:bg-bad/25 disabled:opacity-40"
            >
              {removeBusy ? 'Removing…' : 'Remove record'}
            </button>
            <button
              type="button"
              onClick={cancelRemoval}
              disabled={removeBusy}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
          {removeError && (
            <p className="rounded-lg border border-bad/40 bg-bad/15 px-3 py-2 text-xs text-bad">
              {removeError}
            </p>
          )}
        </div>
      )}

      {!editing && !device.deletedAt && missing.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
          <p className="font-semibold text-warn">
            Missing {missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`}
          </p>
          <p className="mt-1 text-xs text-muted">
            An unlabelled unit cannot be matched during a handover, and a unit without a warranty end
            date cannot be judged against the cliff. Fill these in while the device is in front of you.
          </p>
          <button
            type="button"
            onClick={startEditing}
            className="mt-3 rounded-lg border border-warn/50 bg-warn/15 px-3 py-1.5 text-xs font-semibold text-warn transition-colors hover:bg-warn/25"
          >
            Add the missing details
          </button>
        </div>
      )}

      {editing && form ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
          className="space-y-4 rounded-xl border border-accent/40 bg-panel p-5"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">Editing record</h2>
            <span className="text-[11px] text-muted">Blank fields are saved as not recorded.</span>
          </div>

          <DeviceFields
            values={form}
            onChange={update}
            categories={categories}
            locations={locations}
            staff={staff}
            keepCategoryId={device.categoryId}
            keepHolder={device.assignedTo}
          />

          <p className="text-[11px] text-muted">
            Holders are staff only — student names stay out of this app (FERPA).
          </p>

          {formError && (
            <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Identity">
            <Field label="Asset tag">
              {device.assetTag ? (
                <span className="font-mono text-[13px]">{device.assetTag}</span>
              ) : (
                <Missing />
              )}
            </Field>
            <Field label="Serial number">
              {device.serial ? (
                <span className="font-mono text-[13px]">{device.serial}</span>
              ) : (
                <Missing />
              )}
            </Field>
            <Field label="Category">
              {category?.name ?? <Missing />}
              {isSerialized && (
                <span className="ml-2 text-[11px] text-muted">one row per unit</span>
              )}
            </Field>
            <Field label="Brand / model">
              {device.brand} {device.model}
            </Field>
          </Panel>

          <Panel title="Assignment">
            <Field label="Status">
              <StatusBadge status={device.status} />
            </Field>
            <Field label="Location">{room?.name ?? <Missing />}</Field>
            <Field label="Holder">{device.assignedTo ?? <span className="text-muted">Unassigned</span>}</Field>
          </Panel>

          <Panel title="Warranty">
            <Field label="Warranty state">
              <span
                className={
                  device.warrantyEnd && warrantyLabel(device.warrantyEnd, now).startsWith('Expired')
                    ? 'text-bad'
                    : ''
                }
              >
                {warrantyLabel(device.warrantyEnd, now)}
              </span>
            </Field>
            <Field label="Warranty end">
              {device.warrantyEnd ? (
                <span className="font-mono text-[12.5px]">{device.warrantyEnd}</span>
              ) : (
                <Missing />
              )}
            </Field>

          </Panel>

          <section className="rounded-xl border border-line bg-panel p-4">
            <h2 className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">Notes</h2>
            {device.notes ? (
              <p className="text-sm leading-relaxed text-ink/90">{device.notes}</p>
            ) : (
              <p className="text-sm text-muted">No notes on this record.</p>
            )}

            <div className="mt-4 border-t border-line/60 pt-3">
              <h3 className="text-xs font-bold tracking-wider text-muted uppercase">Photo</h3>
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-dashed border-line px-3 py-4">
                <span aria-hidden="true" className="text-xl text-muted/60">
                  ▢
                </span>
                <p className="text-xs leading-relaxed text-muted">
                  Device photo and serial-plate photo land here once file storage is connected (needs
                  the backend).
                </p>
              </div>
            </div>

            <p className="mt-3 font-mono text-[11px] text-muted/70">
              {device.id} · updated {device.updatedAt} · created {device.createdAt}
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
