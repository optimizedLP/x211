import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { DeviceFields } from '../components/DeviceForm'
import { inventory } from '../lib/data'
import { blankDeviceForm, formValuesToInput, validateDeviceForm } from '../lib/deviceForm'
import type { DeviceFormValues } from '../lib/deviceForm'
import { useAsync } from '../lib/useAsync'

/**
 * One device, typed in by hand. The fields are the same component the detail
 * editor uses, so the two can never drift apart — and it is the landing place
 * for anything a spreadsheet import cannot express.
 */
export function NewDevice() {
  const navigate = useNavigate()

  const categoriesState = useAsync(() => inventory.listCategories(), [])
  const locationsState = useAsync(() => inventory.listLocations(), [])
  const staffState = useAsync(() => inventory.listStaff(), [])

  const categories = categoriesState.data ?? []
  const [form, setForm] = useState<DeviceFormValues>(() => blankDeviceForm())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const update = <K extends keyof DeviceFormValues>(key: K, value: DeviceFormValues[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  const save = async () => {
    if (saving) return
    const problem = validateDeviceForm(form)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const created = await inventory.createDevice(formValuesToInput(form))
      navigate(`/devices/${created.id}`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link to="/" className="text-xs text-muted transition-colors hover:text-accent">
          ← Devices
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New device</h1>
        <p className="mt-1 text-sm text-muted">
          For one unit at a time. Adding a whole fleet?{' '}
          <Link to="/import" className="font-semibold text-accent hover:text-ink">
            Import a spreadsheet
          </Link>{' '}
          instead.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
        className="space-y-4 rounded-xl border border-line bg-panel p-5"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Device details</h2>
          <span className="text-[11px] text-muted">
            Only brand, model and category are required — tag and serial can follow.
          </span>
        </div>

        <DeviceFields
          values={form}
          onChange={update}
          categories={categories}
          locations={locationsState.data ?? []}
          staff={staffState.data ?? []}
        />

        <p className="text-[11px] text-muted">
          Holders are staff only — student names stay out of this app (FERPA).
        </p>

        {error && (
          <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add device'}
          </button>
          <Link
            to="/"
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
