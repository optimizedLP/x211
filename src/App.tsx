import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from './components/Layout'
import { Placeholder } from './components/Placeholder'
import { AuthProvider } from './lib/auth'
import { useAuth } from './lib/authContext'
import { isDemoBuild } from './lib/demo'
import { DeviceDetail } from './routes/DeviceDetail'
import { Devices } from './routes/Devices'
import { ImportPage } from './routes/Import'
import { Login } from './routes/Login'
import { NewDevice } from './routes/NewDevice'
import { Removed } from './routes/Removed'
import { WarrantyCliff } from './routes/WarrantyCliff'

/**
 * The whole app sits behind one check: is there a session? Nothing under
 * `Layout` can fetch data while signed out, so no screen can leak a query the
 * policies would refuse anyway.
 */
function Shell() {
  const { status } = useAuth()

  if (status === 'loading') {
    return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>
  }

  if (status === 'signed-out') return <Login />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Devices />} />
        <Route path="/devices/new" element={<NewDevice />} />
        <Route path="/devices/:id" element={<DeviceDetail />} />
        <Route path="/warranty" element={<WarrantyCliff />} />
        <Route path="/removed" element={<Removed />} />
        <Route
          path="/bulk"
          element={
            <Placeholder
              title="Peripherals & Other Supplies (unlabeled)"
              blurb="Chargers, keyboards, mice and loose cables never get an asset tag. They are tracked as quantity-on-hand by location instead of one row per unit."
              planned={[
                'Quantity-on-hand per category per location',
                'Adjust on receipt and on issue, with a running note',
                'Deliberately no per-unit rows — forcing 200 unlabeled chargers into 200 records makes the data worse',
              ]}
            />
          }
        />
        <Route path="/import" element={<ImportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

/**
 * GitHub Pages cannot rewrite unknown paths to `index.html`, so deep links on
 * the public demo would 404 on refresh. Hash routes (`/#/devices/abc`) work
 * everywhere with no server help; the real app keeps clean URLs on Vercel.
 */
const Router = isDemoBuild ? HashRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </Router>
  )
}
