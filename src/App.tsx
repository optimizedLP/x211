import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from './components/Layout'
import { Placeholder } from './components/Placeholder'
import { DeviceDetail } from './routes/DeviceDetail'
import { Devices } from './routes/Devices'
import { ImportPage } from './routes/Import'
import { NewDevice } from './routes/NewDevice'
import { Removed } from './routes/Removed'
import { WarrantyCliff } from './routes/WarrantyCliff'

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}
