export function parseObservationDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
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
