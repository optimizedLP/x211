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
          <Route
            path="/handover"
            element={
              <Placeholder
                title="Handover / disposal"
                blurb="The artifact that solves the 170-device pickup: bulk select, change status, export a manifest with a pickup reference number."
                planned={[
                  'Bulk select across the device list, then change status in one action',
                  'Disposal manifest export as CSV and PDF, with date, pickup reference and witness',
                  'Manifest history so you can prove what left the building, and when',
                  'Optional CSV/Excel export of the same selection for DOE paperwork',
                ]}
              />
            }
          />
          <Route
            path="/labels"
            element={
              <Placeholder
                title="Asset labels"
                blurb="Many devices arrived with no label at all. Printing a QR code plus a human-readable ID fixes that, and every label makes the next handover faster."
                planned={[
                  'Generate and print sheets of QR-coded asset labels (Avery-style layouts)',
                  'Scan-to-record: point a phone camera at a tag and the record opens',
                  'Next-tag suggestion so numbering never collides with existing labels',
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
