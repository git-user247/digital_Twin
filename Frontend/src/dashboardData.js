function timestampValue(...values) {
  for (const value of values) {
    if (!value) continue
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function classifyPrediction(prediction) {
  const normalized = prediction?.toLowerCase()
  if (normalized === 'amd') return 'AMD'
  if (normalized === 'non-amd') return 'Non-AMD'
  return null
}

export function buildDashboardSummary(patients, savedScans, searchTerm = '') {
  const patientIds = new Set(patients.map((patient) => patient.patient_id))
  const scans = savedScans.filter((scan) => patientIds.has(scan.patient_id))
  const counts = scans.reduce((result, scan) => {
    const classification = classifyPrediction(scan.prediction)
    if (classification) result[classification] += 1
    return result
  }, { AMD: 0, 'Non-AMD': 0 })

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const matchingPatients = normalizedSearch
    ? patients.filter((patient) => (
      patient.patient_id.toLowerCase().includes(normalizedSearch)
      || patient.name?.toLowerCase().includes(normalizedSearch)
    ))
    : patients
  const recentScans = [...scans]
    .sort((first, second) => (
      (timestampValue(second.uploaded_at, second.scan_date) ?? -Infinity)
      - (timestampValue(first.uploaded_at, first.scan_date) ?? -Infinity)
    ))
    .slice(0, 6)
  const recentPatients = matchingPatients
    .map((patient) => {
      const patientScans = scans.filter((scan) => scan.patient_id === patient.patient_id)
      const scansWithTimestamp = patientScans.filter(
        (scan) => timestampValue(scan.uploaded_at, scan.scan_date) !== null,
      )
      const latestScan = scansWithTimestamp.reduce((latest, scan) => {
        if (!latest) return scan
        const scanTime = timestampValue(scan.uploaded_at, scan.scan_date)
        const latestTime = timestampValue(latest.uploaded_at, latest.scan_date)
        return (scanTime ?? -Infinity) > (latestTime ?? -Infinity) ? scan : latest
      }, null)
      const activityTime = timestampValue(latestScan?.uploaded_at, latestScan?.scan_date, patient.created_at)
      return { ...patient, latestScan, activityTime, savedScanCount: patientScans.length }
    })
    .sort((first, second) => (
      (second.activityTime ?? -Infinity) - (first.activityTime ?? -Infinity)
      || first.patient_id.localeCompare(second.patient_id)
    ))
    .slice(0, 6)

  return { matchingPatients, recentPatients, recentScans, predictionCounts: counts }
}
