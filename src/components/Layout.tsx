import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { inventory, isDemoData } from '../lib/data'
import { useInventoryVersion } from '../lib/useInventoryVersion'
import { WARRANTY_BUCKET_LABELS } from '../lib/warranty'
import { useAsync } from '../lib/useAsync'

interface NavItem {
  to: string
  label: string
  built: boolean
}

const NAV: readonly NavItem[] = [
  { to: '/', label: 'Devices', built: true },
  { to: '/warranty', label: 'Warranty cliff', built: true },
  { to: '/bulk', label: 'Peripherals & Other Supplies (unlabeled)', built: false },
  { to: '/import', label: 'Import from Excel', built: true },
  { to: '/removed', label: 'Recently removed', built: true },
]

function navClasses({ isActive }: { isActive: boolean }): string {
  const base = 'flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors'
  return isActive
    ? `${base} border-accent/40 bg-accent/10 text-accent`
    : `${base} border-transparent text-muted hover:bg-panel-2 hover:text-ink`
}

/** Live fleet counter — also proves the adapter's aggregate query works. */
function FleetSummary() {
  // Subscribe to writes so the counters follow a change made in any route.
  const version = useInventoryVersion()
  const summary = useAsync(() => inventory.warrantySummary(), [version])

  if (!summary.data) {
    return <p className="text-xs text-muted">Loading fleet…</p>
  }

  const out = summary.data.expired
  const soon = summary.data.d30 + summary.data.d60 + summary.data.d90

  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted">{WARRANTY_BUCKET_LABELS.expired}</span>
        <span className="font-semibold text-bad">{out}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted">Expiring ≤ 90 days</span>
        <span className="font-semibold text-warn">{soon}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted">No warranty date</span>
        <span className="font-semibold text-muted">{summary.data.unknown}</span>
      </div>
    </div>
  )
}

function DemoNotice() {
  const reset = async () => {
    await inventory.reset()
    window.location.reload()
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-relaxed text-muted">
        {isDemoData
          ? 'Running on seeded demo data in localStorage — no backend yet.'
          : 'Connected to a live backend.'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="w-full rounded-lg border border-line px-3 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:border-bad/50 hover:text-bad"
      >
        Reset demo data
      </button>
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="shrink-0 border-b border-line bg-panel md:flex md:w-64 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-baseline gap-3 px-5 pt-5 pb-4 md:block">
          <div className="font-mono text-lg font-bold tracking-tight text-accent">x211</div>
          <p className="text-xs text-muted md:mt-1">School Device Inventory</p>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navClasses}>
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'font-semibold' : ''}>{item.label}</span>
                  {!item.built && (
                    <span className="ml-2 rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
                      soon
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="hidden border-t border-line px-5 py-4 md:mt-auto md:block">
          <FleetSummary />
          <div className="mt-4 border-t border-line pt-4">
            <DemoNotice />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-5 py-7 md:px-8">{children}</div>
      </main>
    </div>
  )
}
