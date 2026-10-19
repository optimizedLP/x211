import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { useAuth } from '../lib/authContext'
import { inventory, isDemoData } from '../lib/data'
import type { ThemeMode } from '../lib/theme'
import { useTheme } from '../lib/theme'

interface NavItem {
  to: string
  label: string
}

/**
 * "Recently removed" is deliberately absent: removing a record is meant to be
 * rare, so it lives in the quiet footer link rather than in the main menu.
 */
const NAV: readonly NavItem[] = [
  { to: '/', label: 'Devices' },
  { to: '/warranty', label: 'Warranty' },
  { to: '/bulk', label: 'Other Supplies (unlabeled)' },
]

function navClasses({ isActive }: { isActive: boolean }): string {
  const base =
    'shrink-0 rounded-[11px] border px-3 py-1.5 text-[13px] transition-colors duration-150'
  return isActive
    ? `${base} border-accent/45 bg-accent/15 font-semibold text-accent`
    : `${base} border-transparent text-muted hover:bg-panel-2 hover:text-ink`
}

/**
 * One control, two meanings: a real session can be signed out, while the
 * no-backend demo has no account and offers a local reset instead.
 */
function AccountAction() {
  const { signOut } = useAuth()

  const reset = async () => {
    if (!window.confirm('Delete every record stored in this browser? This cannot be undone.')) return
    await inventory.reset()
    window.location.reload()
  }

  if (isDemoData) {
    return (
      <button
        type="button"
        onClick={() => void reset()}
        className="rounded-[11px] border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-bad/50 hover:text-bad"
      >
        Clear all data
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="rounded-[11px] border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/45 hover:text-accent"
    >
      Sign out
    </button>
  )
}

const THEME_GLYPH: Record<ThemeMode, string> = { auto: '◐', light: '☀', dark: '☾' }

const THEME_HINT: Record<ThemeMode, string> = {
  auto: 'Theme: auto (follows the sun). Click for light.',
  light: 'Theme: light. Click for dark.',
  dark: 'Theme: dark. Click to follow the sun again.',
}

function ThemeToggle() {
  const { mode, cycle } = useTheme()
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={THEME_HINT[mode]}
      title={THEME_HINT[mode]}
      className="fixed right-[18px] bottom-[18px] z-50 grid size-[42px] place-items-center rounded-full border border-line bg-panel/85 text-[17px] leading-none text-muted shadow-lg backdrop-blur-md transition-colors hover:border-accent/45 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
    >
      <span aria-hidden="true">{THEME_GLYPH[mode]}</span>
    </button>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-panel/85 backdrop-blur-md">
        <div className="flex h-14 items-center gap-2 px-4 md:gap-3 md:px-6">
          <Link
            to="/"
            className="mr-1 shrink-0 font-mono text-lg font-bold tracking-tight text-accent"
          >
            x211
          </Link>

          <nav aria-label="Main" className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navClasses}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <AccountAction />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pt-[76px] pb-10 md:px-8">{children}</main>

      <footer className="mx-auto max-w-6xl px-5 pb-8 md:px-8">
        <div className="border-t border-line/70 pt-3.5">
          <Link
            to="/removed"
            title="Recover a record that was removed by mistake"
            className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] text-muted/80 transition-colors hover:bg-panel-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            <span aria-hidden="true">↺</span> Recently removed
          </Link>
        </div>
      </footer>

      <ThemeToggle />
    </div>
  )
}
