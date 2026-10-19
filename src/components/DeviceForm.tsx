import type { Category, DeviceStatus, Location, Staff } from '../lib/types'
import { DEVICE_STATUSES } from '../lib/types'
import type { DeviceFormValues } from '../lib/deviceForm'

const INPUT_CLASS =
  'mt-1 w-full rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-sm text-ink placeholder:text-muted/60 focus:border-accent/60 focus:ring-2 focus:ring-accent/20 focus:outline-none'

interface DeviceFieldsProps {
  values: DeviceFormValues
  onChange: <K extends keyof DeviceFormValues>(key: K, value: DeviceFormValues[K]) => void
  categories: readonly Category[]
  locations: readonly Location[]
  staff: readonly Staff[]
  /** Kept selectable even when it is missing from the lists (imported or legacy values). */
  keepCategoryId?: string
  keepHolder?: string | null
}

export function DeviceFields({
  values,
  onChange,
  categories,
  locations,
  staff,
  keepCategoryId,
  keepHolder,
}: DeviceFieldsProps) {
  const categoryOptions = categories.filter(
    (category) => category.trackingType === 'serialized' || category.id === keepCategoryId,
  )
  const holderOptions =
    keepHolder && !staff.some((person) => person.name === keepHolder)
      ? [{ id: 'legacy-holder', name: keepHolder }, ...staff]
      : staff

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="text-xs text-muted">Asset tag</span>
        <input
          value={values.assetTag}
          onChange={(event) => onChange('assetTag', event.target.value)}
          placeholder="X211-1050"
          autoComplete="off"
          className={`${INPUT_CLASS} font-mono`}
        />
      </label>

      <label className="block">
        <span className="text-xs text-muted">Serial number</span>
        <input
          value={values.serial}
          onChange={(event) => onChange('serial', event.target.value)}
          placeholder="Read it off the bottom of the unit"
          autoComplete="off"
          className={`${INPUT_CLASS} font-mono`}
        />
      </label>

      <label className="block">
        <span className="text-xs text-muted">Category</span>
        <select
          value={values.categoryId}
          onChange={(event) => onChange('categoryId', event.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">Choose a category…</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs text-muted">Status</span>
        <select
          value={values.status}
          onChange={(event) => onChange('status', event.target.value as DeviceStatus)}
          className={INPUT_CLASS}
        >
          {DEVICE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs text-muted">Brand</span>
        <input
          value={values.brand}
          onChange={(event) => onChange('brand', event.target.value)}
          placeholder="Lenovo"
          className={INPUT_CLASS}
        />
      </label>

      <label className="block">
        <span className="text-xs text-muted">Model</span>
        <input
          value={values.model}
          onChange={(event) => onChange('model', event.target.value)}
          placeholder="ThinkPad T14 Gen 3"
          className={INPUT_CLASS}
        />
      </label>

      <label className="block">
        <span className="text-xs text-muted">Location</span>
        <select
          value={values.locationId}
          onChange={(event) => onChange('locationId', event.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">Unassigned</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs text-muted">Holder</span>
        <select
          value={values.assignedTo}
          onChange={(event) => onChange('assignedTo', event.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">Unassigned</option>
          {holderOptions.map((person) => (
            <option key={person.id} value={person.name}>
              {person.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs text-muted">Warranty end</span>
        <input
          type="date"
          value={values.warrantyEnd}
          onChange={(event) => onChange('warrantyEnd', event.target.value)}
          className={INPUT_CLASS}
        />
      </label>

      <label className="block sm:col-span-2">
        <span className="text-xs text-muted">Notes</span>
        <textarea
          value={values.notes}
          onChange={(event) => onChange('notes', event.target.value)}
          rows={3}
          placeholder="Damage, repairs, cart slot, missing paperwork…"
          className={`${INPUT_CLASS} resize-y`}
        />
      </label>
    </div>
  )
}
