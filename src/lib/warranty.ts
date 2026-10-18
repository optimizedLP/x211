import { NOW } from './clock'
import type { DeviceStatus, Tone } from './types'

/**
 * Warranty is the decision engine for this app: inside warranty you can open a
 * repair ticket, outside it the device is declared obsolete and DOE collects
 * it. Everything here exists to answer "what is about to fall off the cliff?"
 * without anyone squinting at a spreadsheet.
 */

export type WarrantyBucket = 'expired' | 'd30' | 'd60' | 'd90' | 'ok' | 'unknown'

export const WARRANTY_BUCKETS: readonly WarrantyBucket[] = [
  'expired',
  'd30',
  'd60',
  'd90',
  'ok',
  'unknown',
]

export const WARRANTY_BUCKET_LABELS: Record<WarrantyBucket, string> = {
  expired: 'Expired',
  d30: 'Expiring ≤ 30 days',
  d60: 'Expiring 31–60 days',
  d90: 'Expiring 61–90 days',
  ok: 'In warranty',
  unknown: 'No warranty date',
}

export const WARRANTY_BUCKET_TONES: Record<WarrantyBucket, Tone> = {
  expired: 'bad',
  d30: 'warn',
  d60: 'warn',
  d90: 'info',
  ok: 'ok',
  unknown: 'muted',
}

const MS_PER_DAY = 86_400_000

/** Whole days from `now` until `isoDate`; negative once the date has passed. */
export function daysRemaining(isoDate: string | null, now: Date = NOW): number | null {
  if (!isoDate) return null
  const end = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(end.getTime())) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((end.getTime() - today.getTime()) / MS_PER_DAY)
}

export function warrantyBucket(warrantyEnd: string | null, now: Date = NOW): WarrantyBucket {
  const days = daysRemaining(warrantyEnd, now)
  if (days === null) return 'unknown'
  if (days < 0) return 'expired'
  if (days <= 30) return 'd30'
  if (days <= 60) return 'd60'
  if (days <= 90) return 'd90'
  return 'ok'
}

/** Human-readable countdown, e.g. "in 12 days", "expired 40 days ago". */
export function warrantyLabel(warrantyEnd: string | null, now: Date = NOW): string {
  const days = daysRemaining(warrantyEnd, now)
  if (days === null) return 'Unknown'
  if (days < 0) {
    const ago = Math.abs(days)
    return `Expired ${ago} ${ago === 1 ? 'day' : 'days'} ago`
  }
  if (days === 0) return 'Expires today'
  return `Expires in ${days} ${days === 1 ? 'day' : 'days'}`
}

export function statusTone(status: DeviceStatus): Tone {
  switch (status) {
    case 'In Service':
      return 'ok'
    case 'Needs Repair':
    case 'Ticket Open':
      return 'warn'
    case 'Obsolete':
      return 'info'
    case 'Disposed':
      return 'muted'
  }
}

/** Add `months` to an ISO date, clamping the day to the end of the target month. */
export function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00`)
  const day = date.getDate()
  date.setMonth(date.getMonth() + months)
  if (date.getDate() < day) date.setDate(0)
  return toIsoDate(date)
}

export function toIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
