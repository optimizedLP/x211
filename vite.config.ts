import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * `npm run build:demo` sets VITE_DEMO=1 and produces the public showcase that
 * GitHub Pages serves. Everything else builds the real app for Vercel.
 *
 * The demo build blanks the Supabase variables by definition, so no public
 * bundle can ever contain the project URL or publishable key — even if
 * `.env.local` happens to sit in the working tree.
 */
const demo = process.env.VITE_DEMO === '1'

export default defineConfig({
  // GitHub Pages project sites live at /<repo>/; Vercel serves from the root.
  base: demo ? '/x211/' : '/',
  plugins: [react(), tailwindcss()],
  define: {
    // Always a literal, so the minifier can fold `isDemoBuild` to false in the
    // real build and drop the sample fleet from the shipped bundle.
    'import.meta.env.VITE_DEMO': JSON.stringify(demo ? '1' : ''),
    ...(demo
      ? {
          'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
          'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(''),
        }
      : {}),
  },
})
