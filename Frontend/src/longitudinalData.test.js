import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildLongitudinalData,
  getModelProbability,
  getObservationEye,
  parseObservationDate,
} from './longitudinalData.js'

test('observation dates must be valid canonical calendar dates', () => {
  assert.equal(parseObservationDate('2024-02-29'), '2024-02-29')
  assert.equal(parseObservationDate('0001-01-01'), '0001-01-01')
  assert.equal(parseObservationDate('2023-02-29'), null)
  assert.equal(parseObservationDate('2024-2-09'), null)
  assert.equal(parseObservationDate('2024-01-01T10:00:00Z'), null)
  assert.equal(parseObservationDate(undefined), null)
})

test('unknown eye values are not assigned to either eye', () => {
  assert.equal(getObservationEye({ eye_side: 'LEFT' }), 'left')
  assert.equal(getObservationEye({ eye_side: 'right' }), 'right')
  assert.equal(getObservationEye({ eye_side: 'both' }), 'unknown')
  assert.equal(getObservationEye({}), 'unknown')
})

test('probabilities are read from stored fields and constrained to valid values', () => {
  assert.equal(getModelProbability({ class_probabilities: { AMD: 0.35 } }, 'AMD'), 0.35)
  assert.equal(getModelProbability({ amd_probability: 0.4 }, 'AMD'), 0.4)
  assert.equal(getModelProbability({ class_probabilities: { AMD: 1.1 } }, 'AMD'), null)
  assert.equal(getModelProbability({ class_probabilities: { 'Non-AMD': '0.5' } }, 'Non-AMD'), null)
})

test('history orders valid scan dates before undated records without using upload times', () => {
  const scans = [
    { scan_id: 'later', scan_date: '2025-01-02', uploaded_at: '2020-01-01T00:00:00Z' },
    { scan_id: 'unknown' },
    { scan_id: 'earlier', scan_date: '2024-12-31', uploaded_at: '2030-01-01T00:00:00Z' },
  ]
  const result = buildLongitudinalData(scans)
  assert.deepEqual(result.orderedScans.map((scan) => scan.scan_id), ['earlier', 'later', 'unknown'])
  assert.equal(result.undatedCount, 1)
})

test('chart keeps each eye and model version in a separate series', () => {
  const scans = [
    { scan_id: 'l1', scan_date: '2024-01-01', eye_side: 'left', model_version: 'v1', class_probabilities: { AMD: 0.2 } },
    { scan_id: 'r1', scan_date: '2024-01-02', eye_side: 'right', model_version: 'v1', class_probabilities: { AMD: 0.3 } },
    { scan_id: 'l2', scan_date: '2024-01-03', eye_side: 'left', model_version: 'v2', class_probabilities: { AMD: 0.4 } },
    { scan_id: 'u1', scan_date: '2024-01-04', class_probabilities: { AMD: 0.5 } },
  ]
  const result = buildLongitudinalData(scans)
  assert.equal(result.seriesGroups.length, 4)
  assert.equal(result.chartData[0][result.seriesGroups[0].key], 0.2)
  assert.equal(result.chartData[1][result.seriesGroups[0].key], null)
  assert.equal(result.chartData[2][result.seriesGroups[0].key], null)
  assert.equal(result.seriesGroups[3].eye, 'unknown')
  assert.equal(result.chartData[3][result.seriesGroups[3].key], 0.5)
  assert.equal(result.chartData[0][result.seriesGroups[3].key], null)
  assert.equal(buildLongitudinalData(scans, 'left').chartData.length, 2)
})

test('percentage-point comparisons require the same known eye and model version', () => {
  const scans = [
    { scan_id: 'l1', scan_date: '2024-01-01', eye_side: 'left', model_version: 'v1', prediction: 'Non-AMD', class_probabilities: { AMD: 0.2, 'Non-AMD': 0.8 } },
    { scan_id: 'r1', scan_date: '2024-01-02', eye_side: 'right', model_version: 'v1', prediction: 'AMD', class_probabilities: { AMD: 0.4, 'Non-AMD': 0.6 } },
    { scan_id: 'l2', scan_date: '2024-01-03', eye_side: 'left', model_version: 'v1', prediction: 'AMD', class_probabilities: { AMD: 0.35, 'Non-AMD': 0.65 } },
    { scan_id: 'l3', scan_date: '2024-01-04', eye_side: 'left', model_version: 'v2', prediction: 'AMD', class_probabilities: { AMD: 0.5, 'Non-AMD': 0.5 } },
    { scan_id: 'undated', eye_side: 'left', model_version: 'v1', prediction: 'AMD', class_probabilities: { AMD: 0.6 } },
  ]
  const comparisons = buildLongitudinalData(scans).comparisons
  assert.equal(comparisons.length, 2)
  assert.ok(Math.abs(comparisons[0].amdChangePp - 15) < 1e-10)
  assert.ok(Math.abs(comparisons[0].nonAmdChangePp + 15) < 1e-10)
  assert.equal(comparisons[0].predictionChanged, true)
  assert.equal(comparisons[1].comparable, false)
  assert.equal(comparisons[1].amdChangePp, null)
})

test('missing model versions disable comparisons even when predictions exist', () => {
  const scans = [
    { scan_id: 'one', scan_date: '2024-01-01', eye_side: 'right', prediction: 'AMD', class_probabilities: { AMD: 0.3 } },
    { scan_id: 'two', scan_date: '2024-02-01', eye_side: 'right', prediction: 'Non-AMD', class_probabilities: { AMD: 0.4 } },
  ]
  const [comparison] = buildLongitudinalData(scans).comparisons
  assert.equal(comparison.comparable, false)
  assert.equal(comparison.amdChangePp, null)
  assert.match(comparison.reason, /unavailable/)
})
