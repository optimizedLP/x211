import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
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

/**
 * `js-clipper` arrives through the OCR line splitter and is Latin-1 encoded:
 * one comment contains ¹ and ², which are not valid UTF-8. Rolldown decodes
 * plugin output as UTF-8 and refuses the file, so decode it explicitly and
 * hand it back as a JavaScript string.
 */
function latin1Clipper(): Plugin {
  return {
    name: 'latin1-js-clipper',
    enforce: 'pre',
    load(id) {
      if (!/[\\/]js-clipper[\\/]clipper\.js$/.test(id)) return null
      const path = id.startsWith('file:') ? fileURLToPath(id) : id
      return readFileSync(path, 'latin1')
    },
  }
}

export default defineConfig({
  // GitHub Pages project sites live at /<repo>/; Vercel serves from the root.
  base: demo ? '/x211/' : '/',
  plugins: [latin1Clipper(), react(), tailwindcss()],
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
