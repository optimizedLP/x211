/**
 * True only in the public showcase build (`npm run build:demo`).
 *
 * That build is what GitHub Pages serves: browser-local storage, invented
 * sample rows, hash routing, and no Supabase client at all. The production
 * build on Vercel ignores every demo branch.
 */
export const isDemoBuild = import.meta.env.VITE_DEMO === '1'
