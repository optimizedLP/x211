import type { ReactNode } from 'react'

import type { DeviceStatus, Tone } from '../lib/types'
import {
  daysRemaining,
  statusTone,
  warrantyBucket,
  warrantyLabel,
  WARRANTY_BUCKET_TONES,
} from '../lib/warranty'

/**
 * Class strings are written out in full so Tailwind's scanner can see them —
 * never build these by string interpolation.
 */
const TONE_CLASSES: Record<Tone, string> = {
  ok: 'text-accent-2 bg-accent-2/10 border-accent-2/40',
  info: 'text-accent bg-accent/10 border-accent/40',
  warn: 'text-warn bg-warn/10 border-warn/40',
  bad: 'text-bad bg-bad/10 border-bad/40',
  muted: 'text-muted bg-panel-2 border-line',
}

export function Badge({
  tone,
  children,
  className = '',
}: {
  tone: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: DeviceStatus }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>
}

/** Warranty is the decision engine, so it gets the loudest colour on the row. */
export function WarrantyBadge({
  warrantyEnd,
  now,
}: {
  warrantyEnd: string | null
  now?: Date
}) {
  const bucket = warrantyBucket(warrantyEnd, now)
  const days = daysRemaining(warrantyEnd, now)

  let text: string
  if (bucket === 'unknown' || days === null) text = 'No date'
  else if (days < 0) text = 'Expired'
  else if (days === 0) text = 'Today'
  else text = `${days}d left`

  return (
    <span title={warrantyLabel(warrantyEnd, now)}>
      <Badge tone={WARRANTY_BUCKET_TONES[bucket]}>{text}</Badge>
    </span>
  )
}
