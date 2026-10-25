import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildLongitudinalData,
  buildAmdProgressAssessment,
  buildAmdProgressSummary,
  buildOverallAmdTimeline,
  getModelProbability,
  getObservationEye,
  parseObservationDate,
  STRUCTURAL_PROGRESS_STATUS,
} from './longitudinalData.js'

test('observation dates must be valid canonical calendar dates', () => {
  assert.equal(parseObservationDate('2024-02-29'), '2024-02-29')
  assert.equal(parseObservationDate('0001-01-01'), '0001-01-01')
  assert.equal(parseObservationDate('0000-01-01'), null)
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

function assessmentScans({ previousProbability = 0.25, latestProbability = 0.4, eye = 'left', modelVersion = 'model-v1' } = {}) {
  return [
    {
      scan_id: 'previous',
      patient_id: 'patient-1',
      scan_date: '2025-01-01',
      eye_side: eye,
      prediction: 'Non-AMD',
      model_version: modelVersion,
      class_probabilities: { AMD: previousProbability },
    },
    {
      scan_id: 'latest',
      patient_id: 'patient-1',
      scan_date: '2025-01-11',
      eye_side: eye,
      prediction: 'AMD',
      model_version: modelVersion,
      class_probabilities: { AMD: latestProbability },
    },
  ]
}

test('AMD assessment calculates latest minus previous in percentage points and elapsed days', () => {
  const assessment = buildAmdProgressAssessment(assessmentScans(), 'patient-1', 'left')
  assert.equal(assessment.status, 'comparison')
  assert.equal(assessment.previous.scan.scan_id, 'previous')
  assert.equal(assessment.latest.scan.scan_id, 'latest')
  assert.equal(assessment.elapsedDays, 10)
  assert.ok(Math.abs(assessment.changePp - 15) < 1e-10)
  assert.equal(assessment.direction, 'increased')
})

test('AMD assessment identifies increased, decreased, and unchanged probability directions', () => {
  assert.equal(
    buildAmdProgressAssessment(assessmentScans({ previousProbability: 0.2, latestProbability: 0.8 }), 'patient-1', 'left').direction,
    'increased',
  )
  assert.equal(
    buildAmdProgressAssessment(assessmentScans({ previousProbability: 0.8, latestProbability: 0.2 }), 'patient-1', 'left').direction,
    'decreased',
  )
  assert.equal(
    buildAmdProgressAssessment(assessmentScans({ previousProbability: 0.2, latestProbability: 0.2 }), 'patient-1', 'left').direction,
    'unchanged',
  )
})

test('AMD assessment leaves invalid or missing probabilities unavailable', () => {
  for (const value of [undefined, -0.01, 1.01, '0.5']) {
    const scans = assessmentScans()
    scans[1].class_probabilities.AMD = value
    const assessment = buildAmdProgressAssessment(scans, 'patient-1', 'left')
    assert.equal(assessment.latest.probability, null)
    assert.equal(assessment.changePp, null)
    assert.equal(assessment.direction, null)
    assert.match(buildAmdProgressSummary(assessment), /cannot be calculated/)
  }
})

test('AMD assessment handles no scans and one eligible dated scan', () => {
  assert.equal(buildAmdProgressAssessment([], 'patient-1', 'left').status, 'no-observations')
  assert.match(
    buildAmdProgressSummary(buildAmdProgressAssessment([], 'patient-1', 'left')),
    /No dated left-eye observations/,
  )
  const singleScan = assessmentScans().slice(0, 1)
  const assessment = buildAmdProgressAssessment(singleScan, 'patient-1', 'left')
  assert.equal(assessment.status, 'insufficient-history')
  assert.equal(assessment.latest.scan.scan_id, 'previous')
  assert.match(buildAmdProgressSummary(assessment), /insufficient history/)
})

test('AMD assessment excludes missing and invalid dates rather than using upload timestamps', () => {
  const scans = [
    ...assessmentScans(),
    {
      scan_id: 'undated-latest-upload',
      patient_id: 'patient-1',
      uploaded_at: '2030-01-01T00:00:00Z',
      eye_side: 'left',
      model_version: 'model-v1',
      class_probabilities: { AMD: 0.99 },
    },
    {
      scan_id: 'invalid-date',
      patient_id: 'patient-1',
      scan_date: '2025-02-30',
      eye_side: 'left',
      model_version: 'model-v1',
      class_probabilities: { AMD: 0.95 },
    },
  ]
  const assessment = buildAmdProgressAssessment(scans, 'patient-1', 'left')
  assert.equal(assessment.latest.scan.scan_id, 'latest')
  assert.equal(assessment.datedObservationCount, 2)
})

test('AMD assessment keeps left and right eye observations separate and patient scoped', () => {
  const scans = [
    ...assessmentScans({ eye: 'left' }),
    ...assessmentScans({ eye: 'right' }).map((scan) => ({ ...scan, scan_id: `${scan.scan_id}-right` })),
    ...assessmentScans().map((scan) => ({ ...scan, patient_id: 'patient-2', scan_id: `${scan.scan_id}-other` })),
  ]
  const left = buildAmdProgressAssessment(scans, 'patient-1', 'left')
  const right = buildAmdProgressAssessment(scans, 'patient-1', 'right')
  assert.equal(left.previous.scan.scan_id, 'previous')
  assert.equal(left.latest.scan.scan_id, 'latest')
  assert.equal(right.previous.scan.scan_id, 'previous-right')
  assert.equal(right.latest.scan.scan_id, 'latest-right')
  assert.equal(buildAmdProgressAssessment(scans, 'patient-1', 'unknown').status, 'invalid-eye')
})

test('model and preprocessing metadata limitations are explicitly returned', () => {
  const differentVersions = assessmentScans({ modelVersion: 'model-v1' })
  differentVersions[1].model_version = 'model-v2'
  const mismatch = buildAmdProgressAssessment(differentVersions, 'patient-1', 'left')
  assert.equal(mismatch.modelVersionStatus, 'different')
  assert.equal(mismatch.preprocessingStatus, 'unrecorded')
  assert.ok(Math.abs(mismatch.changePp - 15) < 1e-10)

  const missingVersions = assessmentScans()
  delete missingVersions[0].model_version
  delete missingVersions[1].model_version
  assert.equal(
    buildAmdProgressAssessment(missingVersions, 'patient-1', 'left').modelVersionStatus,
    'unavailable',
  )
})

test('AMD progress summaries are neutral and never claim clinical progression', () => {
  const increase = buildAmdProgressSummary(buildAmdProgressAssessment(assessmentScans(), 'patient-1', 'left'))
  const decrease = buildAmdProgressSummary(
    buildAmdProgressAssessment(assessmentScans({ previousProbability: 0.8, latestProbability: 0.2 }), 'patient-1', 'left'),
  )
  const unchanged = buildAmdProgressSummary(
    buildAmdProgressAssessment(assessmentScans({ previousProbability: 0.4, latestProbability: 0.4 }), 'patient-1', 'left'),
  )
  for (const summary of [increase, decrease, unchanged]) {
    assert.match(summary, /model output/)
    assert.match(summary, /does not independently establish clinical disease progression/)
  }
  assert.match(increase, /increased from 25\.00% to 40\.00%/)
  assert.match(decrease, /decreased from 80\.00% to 20\.00%/)
  assert.match(unchanged, /unchanged at 40\.00%/)
})

test('structural progress has no inferred score in the assessment data', () => {
  const assessment = buildAmdProgressAssessment(assessmentScans(), 'patient-1', 'left')
  assert.equal(Object.hasOwn(assessment, 'structuralProgression'), false)
  assert.equal(assessment.preprocessingStatus, 'unrecorded')
  assert.equal(STRUCTURAL_PROGRESS_STATUS, 'Structural progression not quantified')
})

test('overall timeline includes every eligible saved observation in deterministic order', () => {
  const scans = [
    { scan_id: 'scan-c', patient_id: 'patient-1', scan_date: '2025-02-01', eye_side: 'left', model_version: 'v1', class_probabilities: { AMD: 0.7 } },
    { scan_id: 'scan-b', patient_id: 'patient-1', scan_date: '2025-01-01', eye_side: 'left', model_version: 'v1', class_probabilities: { AMD: 0.4 } },
    { scan_id: 'scan-a', patient_id: 'patient-1', scan_date: '2025-01-01', eye_side: 'left', model_version: 'v1', class_probabilities: { AMD: 0.2 } },
    { scan_id: 'right', patient_id: 'patient-1', scan_date: '2025-01-02', eye_side: 'right', model_version: 'v1', class_probabilities: { AMD: 0.9 } },
    { scan_id: 'other', patient_id: 'patient-2', scan_date: '2025-01-02', eye_side: 'left', model_version: 'v1', class_probabilities: { AMD: 0.8 } },
  ]
  const timeline = buildOverallAmdTimeline(scans, 'patient-1', 'left')
  assert.equal(timeline.observationCount, 3)
  assert.deepEqual(timeline.rows.map((row) => row.scanId), ['scan-a', 'scan-b', 'scan-c'])
  assert.equal(timeline.distinctDateCount, 2)
  assert.equal(timeline.rows[0].changePp, null)
  assert.ok(Math.abs(timeline.rows[1].changePp - 20) < 1e-10)
  assert.ok(Math.abs(timeline.rows[2].changePp - 30) < 1e-10)
  assert.ok(Math.abs(timeline.overallChangePp - 50) < 1e-10)
  assert.equal(timeline.elapsedDays, 31)
  assert.equal(timeline.chartData.length, 3)
  assert.equal(timeline.groups.length, 1)
})

test('overall timeline retains duplicate same-date observations and same-day zero elapsed time', () => {
  const scans = [
    { scan_id: 'second', patient_id: 'patient-1', scan_date: '2025-03-05', eye_side: 'right', model_version: 'v1', class_probabilities: { AMD: 0.6 } },
    { scan_id: 'first', patient_id: 'patient-1', scan_date: '2025-03-05', eye_side: 'right', model_version: 'v1', class_probabilities: { AMD: 0.3 } },
  ]
  const timeline = buildOverallAmdTimeline(scans, 'patient-1', 'right')
  assert.deepEqual(timeline.rows.map((row) => row.scanId), ['first', 'second'])
  assert.equal(timeline.observationCount, 2)
  assert.equal(timeline.distinctDateCount, 1)
  assert.equal(timeline.elapsedDays, 0)
  assert.ok(Math.abs(timeline.overallChangePp - 30) < 1e-10)
  assert.equal(timeline.rows[0].axisTimestamp, timeline.rows[1].axisTimestamp)
  assert.equal(timeline.chartData.length, 2)
  assert.equal(timeline.rows[0].sameDateCount, 2)
  assert.equal(timeline.rows[1].sameDateCount, 2)
})

test('overall timeline reports single and empty history without inventing an overall change', () => {
  const one = buildOverallAmdTimeline([
    { scan_id: 'only', patient_id: 'patient-1', scan_date: '2025-01-01', eye_side: 'left', class_probabilities: { AMD: 0.5 } },
  ], 'patient-1', 'left')
  assert.equal(one.observationCount, 1)
  assert.equal(one.overallChangePp, null)
  assert.equal(one.elapsedDays, null)

  const empty = buildOverallAmdTimeline([], 'patient-1', 'left')
  assert.equal(empty.observationCount, 0)
  assert.equal(empty.first, null)
  assert.equal(empty.latest, null)
  assert.equal(empty.overallChangePp, null)
})

test('overall timeline marks missing dates and probabilities without substituting values', () => {
  const timeline = buildOverallAmdTimeline([
    { scan_id: 'one', patient_id: 'patient-1', scan_date: '2025-01-01', eye_side: 'left', model_version: 'v1', class_probabilities: { AMD: 0.2 } },
    { scan_id: 'two', patient_id: 'patient-1', scan_date: '2025-01-02', eye_side: 'left', model_version: 'v1' },
    { scan_id: 'undated', patient_id: 'patient-1', eye_side: 'left', uploaded_at: '2030-01-01T00:00:00Z', model_version: 'v1', class_probabilities: { AMD: 0.99 } },
  ], 'patient-1', 'left')
  assert.equal(timeline.observationCount, 2)
  assert.equal(timeline.excludedUndatedCount, 1)
  assert.equal(timeline.rows[1].probability, null)
  assert.equal(timeline.rows[1].changePp, null)
  assert.equal(timeline.overallChangePp, null)
})

test('overall timeline visually groups model versions and flags non-comparable consecutive changes', () => {
  const timeline = buildOverallAmdTimeline([
    { scan_id: 'one', patient_id: 'patient-1', scan_date: '2025-01-01', eye_side: 'left', model_version: 'v1', class_probabilities: { AMD: 0.2 } },
    { scan_id: 'two', patient_id: 'patient-1', scan_date: '2025-01-02', eye_side: 'left', model_version: 'v2', class_probabilities: { AMD: 0.5 } },
    { scan_id: 'three', patient_id: 'patient-1', scan_date: '2025-01-03', eye_side: 'left', class_probabilities: { AMD: 0.8 } },
  ], 'patient-1', 'left')
  assert.equal(timeline.groups.length, 3)
  assert.equal(timeline.groups[0].modelVersion, 'v1')
  assert.equal(timeline.groups[1].modelVersion, 'v2')
  assert.equal(timeline.groups[2].isolated, true)
  assert.equal(timeline.rows[1].changeComparable, false)
  assert.equal(timeline.rows[1].changePp, 30)
  assert.equal(timeline.rows[1].modelVersionStatus, 'different')
  assert.equal(timeline.rows[2].modelVersionStatus, 'unavailable')
  assert.equal(timeline.rows[1].changeComparable, false)
  assert.equal(timeline.earliestLatestModelVersionStatus, 'unavailable')
})
