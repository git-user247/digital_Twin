import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDashboardSummary } from './dashboardData.js'

test('dashboard totals and class counts use saved scans only', () => {
  const patients = [
    { patient_id: 'patient-a', name: 'Alias A', created_at: '2025-01-01T00:00:00Z' },
    { patient_id: 'patient-b', name: 'Alias B', created_at: '2025-01-02T00:00:00Z' },
  ]
  const scans = [
    { scan_id: 'a1', patient_id: 'patient-a', prediction: 'AMD', uploaded_at: '2025-02-01T00:00:00Z' },
    { scan_id: 'a2', patient_id: 'patient-a', prediction: 'Non-AMD', uploaded_at: '2025-02-05T00:00:00Z' },
    { scan_id: 'b1', patient_id: 'patient-b', prediction: 'amd', uploaded_at: '2025-02-03T00:00:00Z' },
    { scan_id: 'orphan', patient_id: 'unknown', prediction: 'AMD', uploaded_at: '2025-02-04T00:00:00Z' },
  ]

  const result = buildDashboardSummary(patients, scans)

  assert.equal(result.recentScans.length, 3)
  assert.deepEqual(result.predictionCounts, { AMD: 2, 'Non-AMD': 1 })
  assert.equal(result.recentPatients[0].patient_id, 'patient-a')
  assert.equal(result.recentPatients[0].savedScanCount, 2)
  assert.equal(result.recentPatients[0].latestScan.scan_id, 'a2')
})

test('dashboard uses recorded scan date and profile creation as explicit fallbacks', () => {
  const patients = [
    { patient_id: 'with-scan', created_at: '2024-01-01T00:00:00Z' },
    { patient_id: 'no-scan', created_at: '2025-01-01T00:00:00Z' },
    { patient_id: 'undated-scan', created_at: '2024-03-01T00:00:00Z' },
  ]
  const scans = [
    { scan_id: 'dated', patient_id: 'with-scan', prediction: 'AMD', scan_date: '2024-12-01' },
    { scan_id: 'undated', patient_id: 'undated-scan', prediction: 'Non-AMD' },
  ]

  const result = buildDashboardSummary(patients, scans)

  assert.equal(result.recentPatients[0].patient_id, 'no-scan')
  assert.equal(result.recentPatients[1].latestScan.scan_id, 'dated')
  assert.equal(result.recentPatients[2].latestScan, null)
  assert.equal(result.recentScans[0].scan_id, 'dated')
  assert.equal(result.recentScans[1].scan_id, 'undated')
})

test('dashboard search matches actual patient IDs and names', () => {
  const patients = [
    { patient_id: 'P-100', name: 'Research Alias' },
    { patient_id: 'P-200', name: 'Other Alias' },
  ]

  assert.deepEqual(
    buildDashboardSummary(patients, [], 'research').matchingPatients.map((patient) => patient.patient_id),
    ['P-100'],
  )
  assert.deepEqual(
    buildDashboardSummary(patients, [], 'p-200').matchingPatients.map((patient) => patient.patient_id),
    ['P-200'],
  )
})
