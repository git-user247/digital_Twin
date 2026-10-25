export const STRUCTURAL_PROGRESS_STATUS = 'Structural progression not quantified'

export function parseObservationDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1) return null
  const parsed = new Date(0)
  parsed.setUTCHours(0, 0, 0, 0)
  parsed.setUTCFullYear(year, month - 1, day)
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null
  return value
}

export function getObservationEye(scan) {
  const eye = typeof scan?.eye_side === 'string' ? scan.eye_side.toLowerCase() : ''
  return eye === 'left' || eye === 'right' ? eye : 'unknown'
}

export function getModelProbability(scan, label) {
  const value = label === 'AMD'
    ? scan?.class_probabilities?.AMD ?? scan?.amd_probability
    : scan?.class_probabilities?.['Non-AMD']
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null
}

function observationDayNumber(value) {
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(0)
  parsed.setUTCHours(0, 0, 0, 0)
  parsed.setUTCFullYear(year, month - 1, day)
  return parsed.getTime() / 86_400_000
}

export function buildAmdProgressAssessment(scans, patientId, eye) {
  if (eye !== 'left' && eye !== 'right') {
    return { eye, status: 'invalid-eye', previous: null, latest: null }
  }

  const observations = scans
    .map((scan, index) => ({ scan, index, date: parseObservationDate(scan?.scan_date) }))
    .filter(({ scan, date }) => (
      date
      && scan.patient_id === patientId
      && getObservationEye(scan) === eye
    ))
    .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index)

  if (!observations.length) {
    return {
      eye,
      status: 'no-observations',
      previous: null,
      latest: null,
      datedObservationCount: 0,
    }
  }

  const latestObservation = observations[observations.length - 1]
  const latest = {
    scan: latestObservation.scan,
    date: latestObservation.date,
    probability: getModelProbability(latestObservation.scan, 'AMD'),
  }
  if (observations.length < 2) {
    return {
      eye,
      status: 'insufficient-history',
      previous: null,
      latest,
      datedObservationCount: observations.length,
    }
  }

  const previousObservation = observations[observations.length - 2]
  const previous = {
    scan: previousObservation.scan,
    date: previousObservation.date,
    probability: getModelProbability(previousObservation.scan, 'AMD'),
  }
  const elapsedDays = observationDayNumber(latest.date) - observationDayNumber(previous.date)
  const changePp = previous.probability !== null && latest.probability !== null
    ? (latest.probability - previous.probability) * 100
    : null
  const previousModelVersion = typeof previous.scan.model_version === 'string'
    ? previous.scan.model_version.trim()
    : ''
  const latestModelVersion = typeof latest.scan.model_version === 'string'
    ? latest.scan.model_version.trim()
    : ''
  const modelVersionStatus = !previousModelVersion || !latestModelVersion
    ? 'unavailable'
    : previousModelVersion === latestModelVersion
      ? 'same'
      : 'different'

  return {
    eye,
    status: 'comparison',
    previous,
    latest,
    elapsedDays,
    changePp,
    direction: changePp === null
      ? null
      : changePp > 0
        ? 'increased'
        : changePp < 0
          ? 'decreased'
          : 'unchanged',
    predictionChanged: Boolean(previous.scan.prediction)
      && Boolean(latest.scan.prediction)
      && previous.scan.prediction !== latest.scan.prediction,
    modelVersionStatus,
    preprocessingStatus: 'unrecorded',
    datedObservationCount: observations.length,
  }
}

export function buildAmdProgressSummary(assessment) {
  if (assessment.status === 'no-observations') {
    return `No dated ${assessment.eye}-eye observations are available for an AMD probability comparison.`
  }
  if (assessment.status === 'insufficient-history') {
    return `Only one dated ${assessment.eye}-eye observation is available. There is insufficient history for a scan-to-scan comparison.`
  }
  if (assessment.status !== 'comparison') {
    return 'A comparison cannot be created for the selected eye.'
  }
  if (assessment.changePp === null) {
    return `A scan-to-scan model-probability difference cannot be calculated because the AMD probability is missing or invalid for at least one observation.`
  }

  const previousProbability = `${(assessment.previous.probability * 100).toFixed(2)}%`
  const latestProbability = `${(assessment.latest.probability * 100).toFixed(2)}%`
  const absoluteChange = Math.abs(assessment.changePp).toFixed(2)
  const elapsed = `${assessment.elapsedDays} ${assessment.elapsedDays === 1 ? 'day' : 'days'}`
  let summary
  if (assessment.direction === 'increased') {
    summary = `The model's AMD prediction probability increased from ${previousProbability} to ${latestProbability}, a change of ${absoluteChange} percentage points over ${elapsed}.`
  } else if (assessment.direction === 'decreased') {
    summary = `The model's AMD prediction probability decreased from ${previousProbability} to ${latestProbability}, a change of ${absoluteChange} percentage points over ${elapsed}.`
  } else {
    summary = `The model's AMD prediction probability was unchanged at ${latestProbability} over ${elapsed}.`
  }
  return `${summary} This is a change in model output and does not independently establish clinical disease progression.`
}

function compareStableScanId(first, second) {
  const firstId = typeof first.scan.scan_id === 'string' ? first.scan.scan_id : ''
  const secondId = typeof second.scan.scan_id === 'string' ? second.scan.scan_id : ''
  return firstId.localeCompare(secondId) || first.sourceIndex - second.sourceIndex
}

export function buildOverallAmdTimeline(scans, patientId, eye) {
  const dated = scans
    .map((scan, sourceIndex) => ({
      scan,
      sourceIndex,
      date: parseObservationDate(scan?.scan_date),
    }))
    .filter(({ scan, date }) => (
      date
      && scan.patient_id === patientId
      && getObservationEye(scan) === eye
    ))
    .sort((first, second) => (
      first.date.localeCompare(second.date)
      || compareStableScanId(first, second)
    ))

  const rows = dated.map(({ scan, date }, index) => {
    const probability = getModelProbability(scan, 'AMD')
    const previousScan = index > 0 ? dated[index - 1].scan : null
    const previousProbability = previousScan ? getModelProbability(previousScan, 'AMD') : null
    const previousVersion = typeof previousScan?.model_version === 'string'
      ? previousScan.model_version.trim()
      : ''
    const currentVersion = typeof scan.model_version === 'string' ? scan.model_version.trim() : ''
    const modelVersionStatus = !previousScan
      ? 'first'
      : !previousVersion || !currentVersion
        ? 'unavailable'
        : previousVersion === currentVersion
          ? 'same'
          : 'different'
    const changePp = previousScan && previousProbability !== null && probability !== null
      ? (probability - previousProbability) * 100
      : null
    const seriesKey = currentVersion
      ? `model:${currentVersion}`
      : `unknown:${scan.scan_id || index}`

    return {
      observationNumber: index + 1,
      scan,
      scanId: scan.scan_id || 'Scan identifier unavailable',
      shortScanId: typeof scan.scan_id === 'string' ? scan.scan_id.slice(0, 8) : 'Unavailable',
      date,
      axisLabel: date,
      axisTimestamp: Date.parse(`${date}T00:00:00Z`),
      eye,
      prediction: typeof scan.prediction === 'string' && scan.prediction.trim()
        ? scan.prediction
        : 'Not available',
      probability,
      modelVersion: currentVersion || null,
      uploadTimestamp: typeof scan.uploaded_at === 'string' ? scan.uploaded_at : null,
      seriesKey,
      changePp,
      changeComparable: Boolean(previousScan)
        && modelVersionStatus === 'same'
        && previousProbability !== null
        && probability !== null,
      modelVersionStatus,
      previousScanId: previousScan?.scan_id || null,
    }
  })

  const sameDateCounts = new Map()
  for (const row of rows) sameDateCounts.set(row.date, (sameDateCounts.get(row.date) || 0) + 1)
  const sameDateOrdinals = new Map()
  for (const row of rows) {
    row.sameDateCount = sameDateCounts.get(row.date)
    row.sameDateOrdinal = sameDateOrdinals.get(row.date) || 0
    sameDateOrdinals.set(row.date, row.sameDateOrdinal + 1)
  }

  const groups = []
  const seenGroups = new Set()
  for (const row of rows) {
    if (seenGroups.has(row.seriesKey)) continue
    seenGroups.add(row.seriesKey)
    groups.push({
      key: `overallProbability${groups.length}`,
      seriesKey: row.seriesKey,
      modelVersion: row.modelVersion,
      isolated: !row.modelVersion,
    })
  }

  const chartData = rows.map((row) => {
    const point = {
      ...row,
      amdProbability: row.probability,
    }
    for (const group of groups) {
      point[group.key] = group.seriesKey === row.seriesKey ? row.probability : null
    }
    return point
  })

  const first = rows[0] || null
  const latest = rows.at(-1) || null
  const overallChangePp = rows.length > 1
    && first.probability !== null
    && latest.probability !== null
    ? (latest.probability - first.probability) * 100
    : null
  const elapsedDays = rows.length > 1
    ? observationDayNumber(latest.date) - observationDayNumber(first.date)
    : null

  return {
    eye,
    rows,
    chartData,
    groups,
    observationCount: rows.length,
    distinctDateCount: new Set(rows.map((row) => row.date)).size,
    excludedUndatedCount: scans.filter((scan) => (
      scan.patient_id === patientId
      && getObservationEye(scan) === eye
      && !parseObservationDate(scan?.scan_date)
    )).length,
    first,
    latest,
    elapsedDays,
    overallChangePp,
    overallDirection: overallChangePp === null
      ? null
      : overallChangePp > 0
        ? 'increased'
        : overallChangePp < 0
          ? 'decreased'
          : 'unchanged',
    earliestLatestModelVersionStatus: !first || !latest || first.scanId === latest.scanId
        ? 'same-observation'
        : !first.modelVersion || !latest.modelVersion
          ? 'unavailable'
          : first.modelVersion === latest.modelVersion
            ? 'same'
            : 'different',
  }
}

export function buildLongitudinalData(scans, eyeFilter = 'all') {
  const ordered = scans
    .map((scan, index) => ({ scan, index, date: parseObservationDate(scan?.scan_date) }))
    .sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date) || a.index - b.index
      if (a.date) return -1
      if (b.date) return 1
      return a.index - b.index
    })
  const datedScans = ordered.filter(({ date }) => date)
  const visibleScans = datedScans
    .map(({ scan, date, index }) => ({ scan, date, eye: getObservationEye(scan), sourceIndex: index }))
    .filter(({ eye }) => eyeFilter === 'all' || eye === eyeFilter)

  const seriesGroups = []
  const groupById = new Map()
  for (const { scan, eye, sourceIndex } of visibleScans) {
    const version = typeof scan.model_version === 'string' && scan.model_version.trim()
      ? scan.model_version.trim()
      : null
    const groupId = eye === 'unknown' || !version
      ? `isolated:${sourceIndex}`
      : `${eye}:${version}`
    let group = groupById.get(groupId)
    if (!group) {
      group = {
        key: `probability${seriesGroups.length}`,
        eye,
        modelVersion: version,
        isolated: eye === 'unknown' || !version,
        sourceIndex,
      }
      groupById.set(groupId, group)
      seriesGroups.push(group)
    }
  }

  const chartData = visibleScans.map(({ scan, date, eye, sourceIndex }) => {
    const point = {
      scanId: scan.scan_id || 'Scan identifier unavailable',
      date,
      axisLabel: date,
      eye,
      prediction: scan.prediction || null,
      modelVersion: scan.model_version || null,
      amdProbability: getModelProbability(scan, 'AMD'),
    }
    const version = typeof scan.model_version === 'string' && scan.model_version.trim()
      ? scan.model_version.trim()
      : null
    for (const group of seriesGroups) {
      const matchesEye = group.eye === eye
      const matchesVersion = group.isolated
        ? group.sourceIndex === sourceIndex
        : group.modelVersion === version
      point[group.key] = matchesEye && matchesVersion ? point.amdProbability : null
    }
    return point
  })

  const visitsByEye = new Map()
  for (const { scan, date } of datedScans) {
    const eye = getObservationEye(scan)
    if (eye === 'unknown') continue
    const visits = visitsByEye.get(eye) || []
    visits.push({ scan, date })
    visitsByEye.set(eye, visits)
  }

  const comparisons = []
  for (const [eye, visits] of visitsByEye) {
    for (let index = 1; index < visits.length; index += 1) {
      const previous = visits[index - 1].scan
      const current = visits[index].scan
      const previousVersion = typeof previous.model_version === 'string' ? previous.model_version.trim() : ''
      const currentVersion = typeof current.model_version === 'string' ? current.model_version.trim() : ''
      const sameKnownVersion = previousVersion && currentVersion && previousVersion === currentVersion
      comparisons.push({
        eye,
        previous,
        current,
        comparable: Boolean(sameKnownVersion),
        reason: sameKnownVersion
          ? ''
          : previousVersion && currentVersion
            ? 'Model versions differ'
            : 'Model version is unavailable for one or both observations',
        amdChangePp: sameKnownVersion
          && getModelProbability(previous, 'AMD') !== null
          && getModelProbability(current, 'AMD') !== null
          ? (getModelProbability(current, 'AMD') - getModelProbability(previous, 'AMD')) * 100
          : null,
        nonAmdChangePp: sameKnownVersion
          && getModelProbability(previous, 'Non-AMD') !== null
          && getModelProbability(current, 'Non-AMD') !== null
          ? (getModelProbability(current, 'Non-AMD') - getModelProbability(previous, 'Non-AMD')) * 100
          : null,
        predictionChanged: sameKnownVersion
          && Boolean(previous.prediction)
          && Boolean(current.prediction)
          && previous.prediction !== current.prediction,
      })
    }
  }

  return {
    orderedScans: ordered.map(({ scan }) => scan),
    datedScans: datedScans.map(({ scan }) => scan),
    undatedCount: ordered.length - datedScans.length,
    chartData,
    seriesGroups,
    comparisons,
  }
}
