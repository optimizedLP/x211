interface PlaceholderProps {
  title: string
  blurb: string
  planned: readonly string[]
}

/**
 * Honest stub for the sections that are scoped but not built yet. Keeping the
 * nav complete means the shape of the app is visible from the first commit.
 */
export function Placeholder({ title, blurb, planned }: PlaceholderProps) {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <span className="rounded border border-line bg-panel-2 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
          planned
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">{blurb}</p>
      <ul className="mt-5 space-y-2 rounded-xl border border-line bg-panel p-5">
        {planned.map((item) => (
          <li key={item} className="flex gap-3 text-sm text-ink/90">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
