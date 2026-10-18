/**
 * The app's notion of "now", captured once per page load.
 *
 * Reading the clock during render is impure, so the value is frozen here and
 * shared by the UI, the warranty helpers and the data layer — which also means
 * every row on a screen agrees about what today is. Warranty buckets care about
 * whole days, so a stale value could only matter if the tab stayed open past
 * midnight; a reload fixes that.
 */
export const NOW = new Date()
