import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  Activity,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  CloudUpload,
  Download,
  Eye,
  EyeOff,
  FileImage,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  Microscope,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { buildDashboardSummary, classifyPrediction } from './dashboardData.js'
import {
  buildAmdProgressAssessment,
  buildAmdProgressSummary,
  buildLongitudinalData,
  buildOverallAmdTimeline,
  getModelProbability,
  getObservationEye,
  parseObservationDate,
  STRUCTURAL_PROGRESS_STATUS,
} from './longitudinalData.js'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const SELECTED_PATIENT_KEY = 'ocutwin.selectedPatientId'
const AUTH_TOKEN_KEY = 'ocutwin.doctorAccessToken'
const navItems = [
  { label: 'Dashboard', view: 'dashboard', icon: LayoutDashboard },
  { label: 'Patient directory', view: 'directory', icon: Users },
]

async function readResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.detail || fallbackMessage)
  }
  return payload
}

function formatDate(value) {
  if (!value) return 'Not provided'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function latestSavedScan(records) {
  return records.reduce((latest, scan) => {
    if (!latest) return scan
    const parsedScanTime = Date.parse(scan.uploaded_at || scan.scan_date || '')
    const parsedLatestTime = Date.parse(latest.uploaded_at || latest.scan_date || '')
    const scanTime = Number.isFinite(parsedScanTime) ? parsedScanTime : 0
    const latestTime = Number.isFinite(parsedLatestTime) ? parsedLatestTime : 0
    return scanTime > latestTime ? scan : latest
  }, null)
}

function scanLabel(scan) {
  const date = scan.scan_date ? formatDate(scan.scan_date) : 'Date unavailable'
  return `${date} · ${scan.eye_side || 'Eye side unavailable'} · ${scan.prediction || 'Prediction unavailable'}`
}

function App() {
  const [currentView, setCurrentView] = useState('access')
  const [authToken, setAuthToken] = useState(() => {
    try {
      return window.localStorage.getItem(AUTH_TOKEN_KEY) || ''
    } catch {
      return ''
    }
  })
  const [authChecking, setAuthChecking] = useState(false)
  const [doctorIdentity, setDoctorIdentity] = useState('')
  const [doctorIdInput, setDoctorIdInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [patients, setPatients] = useState([])
  const [patientsBusy, setPatientsBusy] = useState(false)
  const [patientsError, setPatientsError] = useState('')
  const [dashboardScans, setDashboardScans] = useState(null)
  const [dashboardActivityBusy, setDashboardActivityBusy] = useState(false)
  const [dashboardActivityError, setDashboardActivityError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [patientForm, setPatientForm] = useState({
    patient_id: '',
    name: '',
    age: '',
    sex: '',
    contact: '',
    notes: '',
  })
  const [patientId, setPatientId] = useState('')
  const [patient, setPatient] = useState(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [scans, setScans] = useState([])
  const [historyBusy, setHistoryBusy] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [eyeSide, setEyeSide] = useState('left')
  const [scanDate, setScanDate] = useState('')
  const [visitNotes, setVisitNotes] = useState('')
  const [savedScan, setSavedScan] = useState(null)
  const [savedImageUrl, setSavedImageUrl] = useState('')
  const [savedImageError, setSavedImageError] = useState('')
  const [latestImageUrl, setLatestImageUrl] = useState('')
  const [latestImageError, setLatestImageError] = useState('')
  const [comparisonScanIds, setComparisonScanIds] = useState(['', ''])
  const [comparisonImages, setComparisonImages] = useState([])
  const [assessmentImages, setAssessmentImages] = useState([])
  const [assessmentImagesBusy, setAssessmentImagesBusy] = useState(false)
  const [assessmentImagesError, setAssessmentImagesError] = useState('')
  const [comparisonBusy, setComparisonBusy] = useState(false)
  const [comparisonError, setComparisonError] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState('')
  const reportRequestActive = useRef(false)
  const scanRequestId = useRef('')
  const [gradcamDataUrl, setGradcamDataUrl] = useState('')
  const [gradcamError, setGradcamError] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [modelInfo, setModelInfo] = useState(null)
  const [backendStatus, setBackendStatus] = useState('checking')

  const activeNav = useMemo(
    () => navItems.find((item) => item.view === currentView),
    [currentView],
  )
  const loadedPatientId = patient?.patient_id || ''
  const patientIsLoaded = Boolean(patient && patientId.trim() === loadedPatientId)
  const latestScan = useMemo(() => latestSavedScan(scans), [scans])
  const filteredPatients = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    if (!normalizedSearch) return patients
    return patients.filter((record) => (
      record.patient_id.toLowerCase().includes(normalizedSearch)
      || record.name?.toLowerCase().includes(normalizedSearch)
    ))
  }, [patients, searchTerm])

  const clearSession = (message = '') => {
    let storageError = ''
    try {
      window.localStorage.removeItem(AUTH_TOKEN_KEY)
      window.localStorage.removeItem(SELECTED_PATIENT_KEY)
    } catch {
      storageError = 'Unable to clear the saved browser session. Close this tab to end the local session.'
    }
    setAuthToken('')
    setAuthChecking(false)
    setCurrentView('access')
    setDoctorIdentity('')
    setPatients([])
    setDashboardScans(null)
    setDashboardActivityError('')
    setPatient(null)
    setPatientId('')
    setScans([])
    setSelectedFile(null)
    setPreviewUrl('')
    setEyeSide('left')
    setScanDate('')
    setVisitNotes('')
    setSavedScan(null)
    setSavedImageUrl('')
    setSavedImageError('')
    setLatestImageUrl('')
    setLatestImageError('')
    setComparisonImages([])
    setComparisonScanIds(['', ''])
    setComparisonError('')
    setReportError('')
    setGradcamDataUrl('')
    setGradcamError('')
    setError('')
    setLoginError(message || storageError)
  }

  const protectedFetch = async (url, options = {}, token = authToken) => {
    if (!token) {
      throw new Error('Sign in to the doctor demo before accessing patient records.')
    }
    const headers = new Headers(options.headers || {})
    headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(url, { ...options, headers })
    if (response.status === 401) {
      clearSession('Your session has expired or is invalid. Please sign in again.')
      throw new Error('Your session has expired or is invalid. Please sign in again.')
    }
    return response
  }

  useEffect(() => {
    let mounted = true
    fetch(`${API_BASE}/model-info`)
      .then((response) => readResponse(response, 'Unable to load model information.'))
      .then((info) => {
        if (!mounted) return
        setModelInfo(info)
        setBackendStatus(info.ready ? 'ready' : 'model-unavailable')
      })
      .catch(() => {
        if (!mounted) return
        setBackendStatus('offline')
      })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!authToken) return undefined
    let mounted = true
    setAuthChecking(true)
    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(async (response) => {
        if (response.status === 401) {
          clearSession('Your saved session has expired. Please sign in again.')
          return null
        }
        return readResponse(response, 'Unable to validate the saved doctor session.')
      })
      .then(async (doctor) => {
        if (!mounted || !doctor) return
        setDoctorIdentity(doctor.doctor_id || '')
        setCurrentView('dashboard')
        await loadDashboardData(authToken)

        let storedPatientId
        try {
          storedPatientId = window.localStorage.getItem(SELECTED_PATIENT_KEY)?.trim()
        } catch {
          storedPatientId = ''
        }
        if (!storedPatientId) return
        try {
          const patientResponse = await protectedFetch(
            `${API_BASE}/patients/${encodeURIComponent(storedPatientId)}`,
            {},
            authToken,
          )
          const patientPayload = await readResponse(patientResponse, 'Unable to restore the selected patient profile.')
          if (!mounted) return
          setPatient(patientPayload.patient)
          setPatientId(patientPayload.patient.patient_id)
          const historyResponse = await protectedFetch(
            `${API_BASE}/patients/${encodeURIComponent(storedPatientId)}/scans`,
            {},
            authToken,
          )
          const historyPayload = await readResponse(historyResponse, 'Unable to restore patient scan history.')
          const records = Array.isArray(historyPayload.scans) ? historyPayload.scans : []
          if (mounted) {
            setScans(records)
          }
        } catch {
          try {
            window.localStorage.removeItem(SELECTED_PATIENT_KEY)
          } catch {
            setProfileError('Unable to clear the remembered patient selection.')
          }
        }
      })
      .catch((requestError) => {
        if (!mounted) return
        setLoginError(requestError.message || 'Unable to validate the saved doctor session.')
      })
      .finally(() => {
        if (mounted) setAuthChecking(false)
      })
    return () => { mounted = false }
  }, [authToken])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => () => {
    if (savedImageUrl) URL.revokeObjectURL(savedImageUrl)
  }, [savedImageUrl])

  useEffect(() => () => {
    if (latestImageUrl) URL.revokeObjectURL(latestImageUrl)
  }, [latestImageUrl])

  useEffect(() => () => {
    comparisonImages.forEach((entry) => URL.revokeObjectURL(entry.url))
  }, [comparisonImages])

  useEffect(() => () => {
    assessmentImages.forEach((entry) => {
      if (entry.url) URL.revokeObjectURL(entry.url)
    })
  }, [assessmentImages])

  const loadPatientScans = async (id, token = authToken) => {
    setHistoryBusy(true)
    setHistoryError('')
    try {
      const response = await protectedFetch(`${API_BASE}/patients/${encodeURIComponent(id)}/scans`, {}, token)
      const payload = await readResponse(response, 'Unable to load this patient’s scan history.')
      const records = Array.isArray(payload.scans) ? payload.scans : []
      setScans(records)
      return records
    } catch (requestError) {
      setScans([])
      setHistoryError(requestError.message || 'Unable to load this patient’s scan history.')
      return null
    } finally {
      setHistoryBusy(false)
    }
  }

  const loadPatients = async (token = authToken) => {
    setPatientsBusy(true)
    setPatientsError('')
    try {
      const response = await protectedFetch(`${API_BASE}/patients`, {}, token)
      const payload = await readResponse(response, 'Unable to load the patient directory.')
      if (!Array.isArray(payload.patients)) {
        throw new Error('The backend returned an invalid patient directory response.')
      }
      setPatients(payload.patients)
      return payload.patients
    } catch (requestError) {
      setPatients([])
      setPatientsError(requestError.message || 'Unable to load the patient directory.')
      return null
    } finally {
      setPatientsBusy(false)
    }
  }

  const loadDashboardData = async (token = authToken) => {
    setDashboardScans(null)
    setDashboardActivityBusy(true)
    setDashboardActivityError('')
    try {
      const directory = await loadPatients(token)
      if (!directory) return

      const patientHistories = await Promise.all(directory.map(async (record) => {
        const response = await protectedFetch(
          `${API_BASE}/patients/${encodeURIComponent(record.patient_id)}/scans`,
          {},
          token,
        )
        const payload = await readResponse(response, `Unable to load saved scans for patient ${record.patient_id}.`)
        if (
          payload.patient_id !== record.patient_id
          || !Array.isArray(payload.scans)
          || payload.scans.some((scan) => scan.patient_id !== record.patient_id)
        ) {
          throw new Error(`The backend returned invalid scan history for patient ${record.patient_id}.`)
        }
        return payload.scans
      }))
      setDashboardScans(patientHistories.flat())
    } catch (requestError) {
      setDashboardScans(null)
      setDashboardActivityError(requestError.message || 'Unable to load saved scan activity.')
    } finally {
      setDashboardActivityBusy(false)
    }
  }

  const login = async (event) => {
    event.preventDefault()
    const doctorId = doctorIdInput.trim()
    if (!doctorId || !passwordInput) {
      setLoginError('Enter your doctor ID or email and password.')
      return
    }
    setLoginBusy(true)
    setLoginError('')
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctor_id: doctorId, password: passwordInput }),
      })
      const payload = await readResponse(response, 'Unable to sign in.')
      if (!payload.access_token || payload.token_type?.toLowerCase() !== 'bearer') {
        throw new Error('The backend returned an invalid login response.')
      }
      try {
        window.localStorage.setItem(AUTH_TOKEN_KEY, payload.access_token)
      } catch {
        throw new Error('This browser could not store the login session. Enable local storage and try again.')
      }
      setAuthToken(payload.access_token)
      setPasswordInput('')
      setShowPassword(false)
    } catch (requestError) {
      setLoginError(requestError.message || 'Unable to sign in. Check your credentials and backend connection.')
    } finally {
      setLoginBusy(false)
    }
  }

  const openPatient = async (id) => {
    const normalizedId = id.trim()
    if (!normalizedId) return
    if (normalizedId !== loadedPatientId) {
      setSelectedFile(null)
      setPreviewUrl('')
      setEyeSide('left')
      setScanDate('')
      setVisitNotes('')
    }
    setProfileBusy(true)
    scanRequestId.current = ''
    setProfileError('')
    setProfileMessage('')
    setPatient(null)
    setScans([])
    setSavedScan(null)
    setSavedImageUrl('')
    setSavedImageError('')
    setLatestImageUrl('')
    setLatestImageError('')
    setComparisonImages([])
    setComparisonScanIds(['', ''])
    setComparisonError('')
    setReportError('')
    setGradcamDataUrl('')
    setGradcamError('')
    setError('')
    try {
      const response = await protectedFetch(`${API_BASE}/patients/${encodeURIComponent(normalizedId)}`)
      const payload = await readResponse(response, 'Unable to load the patient profile.')
      setPatient(payload.patient)
      setPatientId(payload.patient.patient_id)
      try {
        window.localStorage.setItem(SELECTED_PATIENT_KEY, payload.patient.patient_id)
      } catch {
        setProfileMessage('Patient loaded, but this browser could not remember it after refresh.')
      }
      const records = await loadPatientScans(payload.patient.patient_id)
      setCurrentView('workspace')
      if (records?.length) {
        const latest = latestSavedScan(records)
        await loadLatestImage(records, payload.patient.patient_id)
        await selectSavedScan(latest, payload.patient.patient_id, records)
      }
      setCurrentView('workspace')
    } catch (requestError) {
      setProfileError(requestError.message || 'Unable to load the patient profile.')
    } finally {
      setProfileBusy(false)
    }
  }

  const createPatient = async (event) => {
    event.preventDefault()
    const form = {
      ...patientForm,
      patient_id: patientForm.patient_id.trim(),
      name: patientForm.name.trim(),
      contact: patientForm.contact.trim(),
      notes: patientForm.notes.trim(),
      age: Number(patientForm.age),
    }
    if (!form.patient_id || !form.name || !patientForm.age.trim()) {
      setProfileError('Patient ID, name or demo alias, and age are required.')
      return
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(form.patient_id)) {
      setProfileError('Patient ID must be 1–64 characters using letters, numbers, hyphens, or underscores.')
      return
    }
    if (!Number.isInteger(form.age) || form.age < 0 || form.age > 120) {
      setProfileError('Enter an age as a whole number from 0 to 120.')
      return
    }
    setProfileBusy(true)
    setProfileError('')
    setProfileMessage('')
    try {
      const response = await protectedFetch(`${API_BASE}/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          sex: form.sex || null,
          contact: form.contact || null,
          notes: form.notes || null,
        }),
      })
      const payload = await readResponse(response, 'Unable to create the patient profile.')
      setPatientForm({ patient_id: '', name: '', age: '', sex: '', contact: '', notes: '' })
      await loadDashboardData()
      await openPatient(payload.patient.patient_id)
      setProfileMessage('Patient profile created and opened.')
    } catch (requestError) {
      setProfileError(requestError.message || 'Unable to create the patient profile.')
      setProfileBusy(false)
    }

  }

  const generatePatientId = () => {
    const generated = `Demo_${window.crypto.randomUUID().replaceAll('-', '')}`
    setPatientForm((current) => ({ ...current, patient_id: generated }))
    setProfileError('')
  }

  const handleFile = (file) => {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Choose a JPEG or PNG image.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Image exceeds the 20 MB file limit.')
      return
    }
    setError('')
    scanRequestId.current = ''
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setSavedScan(null)
    setSavedImageUrl('')
    setGradcamDataUrl('')
    setGradcamError('')
  }

  const handleDrop = (event) => {
    event.preventDefault()
    handleFile(event.dataTransfer.files?.[0])
  }

  const analyzeAndSaveScan = async () => {
    if (!patientIsLoaded) {
      setError('Open a patient workspace before saving a scan.')
      return
    }
    if (!selectedFile) {
      setError('Select an OCT image before running inference.')
      return
    }

    setIsAnalyzing(true)
    setError('')
    setGradcamError('')
    setGradcamDataUrl('')
    setSavedScan(null)
    setSavedImageError('')

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('eye_side', eyeSide)
    if (scanDate) formData.append('scan_date', scanDate)
    if (visitNotes.trim()) formData.append('notes', visitNotes.trim())

    try {
      if (!scanRequestId.current) {
        scanRequestId.current = window.crypto.randomUUID()
      }
      const response = await protectedFetch(`${API_BASE}/patients/${encodeURIComponent(patientId.trim())}/scans`, {
        method: 'POST',
        headers: { 'Idempotency-Key': scanRequestId.current },
        body: formData,
      })
      const payload = await readResponse(response, 'Unable to analyze and save the scan.')
      if (!payload.scan?.scan_id || !payload.scan?.prediction || !payload.scan?.class_probabilities) {
        throw new Error('The backend returned an incomplete saved-scan response.')
      }
      scanRequestId.current = ''
      const records = await loadPatientScans(patientId.trim())
      if (records) {
        const latest = latestSavedScan(records)
        await loadLatestImage(records, patientId.trim())
        const savedRecord = records.find((record) => record.scan_id === payload.scan.scan_id)
        await selectSavedScan(savedRecord || latest, patientId.trim(), records)
      }
      await loadDashboardData()
    } catch (requestError) {
      setError(requestError.message || 'The backend could not process and save this scan.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const clearImage = () => {
    scanRequestId.current = ''
    setSelectedFile(null)
    setPreviewUrl('')
    setSavedScan(null)
    setSavedImageUrl('')
    setGradcamDataUrl('')
    setGradcamError('')
    setError('')
  }

  const fetchStoredScanImage = async (ownerPatientId, scan, records = scans, token = authToken) => {
    if (!ownerPatientId || scan.patient_id !== ownerPatientId) {
      throw new Error('The selected scan does not belong to the current patient.')
    }
    const storedScan = records.find((record) => record.scan_id === scan.scan_id)
    if (!storedScan || storedScan.patient_id !== ownerPatientId) {
      throw new Error('The selected scan is not part of this patient’s saved history.')
    }
    if (!storedScan.image_available) {
      throw new Error('The backend reports that this saved scan image is unavailable.')
    }
    const imagePath = `/patients/${encodeURIComponent(ownerPatientId)}/scans/${encodeURIComponent(scan.scan_id)}/image`
    const response = await protectedFetch(`${API_BASE}${imagePath}`, {}, token)
    if (!response.ok) {
      await readResponse(response, 'Unable to retrieve the saved scan image.')
    }
    return response.blob()
  }

  const fetchSavedScanGradcam = async (imageBlob) => {
    try {
      const formData = new FormData()
      const extension = imageBlob.type === 'image/png' ? 'png' : 'jpg'
      formData.append('file', imageBlob, `saved-scan.${extension}`)
      const response = await protectedFetch(`${API_BASE}/gradcam`, {
        method: 'POST',
        body: formData,
      })
      const explanation = await readResponse(response, 'Grad-CAM is unavailable for this saved scan.')
      if (!explanation.gradcam_base64) {
        return { dataUrl: '', error: 'Grad-CAM response did not include an image.' }
      }
      return { dataUrl: `data:image/png;base64,${explanation.gradcam_base64}`, error: '' }
    } catch (requestError) {
      if (/session has expired|sign in to the doctor demo/i.test(requestError.message || '')) {
        throw requestError
      }
      return { dataUrl: '', error: requestError.message || 'Grad-CAM is unavailable for this saved scan.' }
    }
  }

  const selectSavedScan = async (scan, ownerPatientId = patient?.patient_id, records = scans) => {
    const storedScan = records.find((record) => record.scan_id === scan.scan_id)
    if (
      !storedScan
      || storedScan.patient_id !== ownerPatientId
    ) {
      setSavedImageError('The selected scan does not belong to the current patient.')
      return
    }
    setSavedScan(storedScan)
    setSavedImageError('')
    setSavedImageUrl('')
    setGradcamDataUrl('')
    setGradcamError('')
    let imageBlob
    try {
      imageBlob = await fetchStoredScanImage(ownerPatientId, storedScan, records)
      setSavedImageUrl(URL.createObjectURL(imageBlob))
    } catch (requestError) {
      setSavedImageError(requestError.message || 'Unable to retrieve this saved scan image.')
      return
    }
    try {
      const explanation = await fetchSavedScanGradcam(imageBlob)
      setGradcamDataUrl(explanation.dataUrl)
      setGradcamError(explanation.error)
    } catch (requestError) {
      setGradcamError(requestError.message || 'Grad-CAM is unavailable for this saved scan.')
    }
  }

  const loadLatestImage = async (records, ownerPatientId) => {
    setLatestImageUrl('')
    setLatestImageError('')
    const latest = latestSavedScan(records)
    if (!latest || latest.patient_id !== ownerPatientId) return
    try {
      const blob = await fetchStoredScanImage(ownerPatientId, latest, records)
      setLatestImageUrl(URL.createObjectURL(blob))
    } catch (requestError) {
      setLatestImageError(requestError.message || 'Unable to retrieve the latest saved scan image.')
    }
  }

  const compareSelectedScans = async () => {
    const [firstId, secondId] = comparisonScanIds
    if (!patient?.patient_id || !firstId || !secondId) {
      setComparisonError('Select two saved scans to compare.')
      return
    }
    if (firstId === secondId) {
      setComparisonError('Choose two different saved scans.')
      return
    }
    const first = scans.find((scan) => scan.scan_id === firstId)
    const second = scans.find((scan) => scan.scan_id === secondId)
    if (!first || !second || first.patient_id !== patient.patient_id || second.patient_id !== patient.patient_id) {
      setComparisonError('Both scans must belong to the currently selected patient.')
      return
    }
    if (getObservationEye(first) === 'unknown' || getObservationEye(first) !== getObservationEye(second)) {
      setComparisonError('Choose two scans from the same known eye for visual comparison.')
      return
    }

    setComparisonBusy(true)
    setComparisonError('')
    setComparisonImages([])
    try {
      const [firstBlob, secondBlob] = await Promise.all([
        fetchStoredScanImage(patient.patient_id, first),
        fetchStoredScanImage(patient.patient_id, second),
      ])
      const [firstGradcam, secondGradcam] = await Promise.all([
        fetchSavedScanGradcam(firstBlob),
        fetchSavedScanGradcam(secondBlob),
      ])
      setComparisonImages([
        { scanId: first.scan_id, url: URL.createObjectURL(firstBlob), gradcam: firstGradcam },
        { scanId: second.scan_id, url: URL.createObjectURL(secondBlob), gradcam: secondGradcam },
      ])
    } catch (requestError) {
      setComparisonError(requestError.message || 'Unable to load the selected saved scans.')
    } finally {
      setComparisonBusy(false)
    }
  }

  const loadAmdAssessmentImages = async (assessment) => {
    if (!patientIsLoaded || !patient?.patient_id || assessment.status !== 'comparison') return
    const selectedScans = [assessment.previous?.scan, assessment.latest?.scan]
    const records = selectedScans.map((selectedScan) => scans.find((record) => (
      record.scan_id === selectedScan?.scan_id
      && record.patient_id === patient.patient_id
      && selectedScan.patient_id === patient.patient_id
    )))
    if (records.some((record) => !record) || records[0].scan_id === records[1].scan_id) {
      setAssessmentImagesError('The selected comparison scans could not be verified in this patient’s saved history.')
      return
    }

    setAssessmentImagesBusy(true)
    setAssessmentImagesError('')
    setAssessmentImages([])
    try {
      const imageResults = await Promise.allSettled(
        records.map((record) => fetchStoredScanImage(patient.patient_id, record)),
      )
      const imageEntries = await Promise.all(imageResults.map(async (imageResult, index) => {
        const record = records[index]
        if (imageResult.status === 'rejected') {
          return {
            scanId: record.scan_id,
            patientId: patient.patient_id,
            role: index === 0 ? 'previous' : 'latest',
            url: '',
            imageError: imageResult.reason?.message || 'Unable to retrieve this saved scan image.',
            gradcam: { dataUrl: '', error: 'Grad-CAM is unavailable because the original scan image could not be retrieved.' },
          }
        }
        const url = URL.createObjectURL(imageResult.value)
        const gradcam = await fetchSavedScanGradcam(imageResult.value).then(
          (result) => result,
          (requestError) => ({ dataUrl: '', error: requestError.message || 'Grad-CAM is unavailable for this scan.' }),
        )
        return {
          scanId: record.scan_id,
          patientId: patient.patient_id,
          role: index === 0 ? 'previous' : 'latest',
          url,
          imageError: '',
          gradcam,
        }
      }))
      setAssessmentImages(imageEntries)
    } catch (requestError) {
      setAssessmentImagesError(requestError.message || 'Unable to load the selected AMD assessment scans.')
    } finally {
      setAssessmentImagesBusy(false)
    }
  }

  const exportRetinalTwinReport = async () => {
    if (!patientIsLoaded || reportRequestActive.current) return
    reportRequestActive.current = true
    setReportBusy(true)
    setReportError('')
    try {
      const query = new URLSearchParams()
      const [firstId, secondId] = comparisonScanIds
      const first = scans.find((scan) => scan.scan_id === firstId && scan.patient_id === patient.patient_id)
      const second = scans.find((scan) => scan.scan_id === secondId && scan.patient_id === patient.patient_id)
      if (first && second && first.scan_id !== second.scan_id) {
        query.set('first_scan_id', first.scan_id)
        query.set('second_scan_id', second.scan_id)
      }
      const comparisonQuery = query.toString()
      const queryString = comparisonQuery ? `?${comparisonQuery}` : ''
      const response = await protectedFetch(
        `${API_BASE}/patients/${encodeURIComponent(patient.patient_id)}/report${queryString}`,
      )
      if (!response.ok) {
        await readResponse(response, 'Unable to generate the Retinal Twin report.')
      }
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/pdf')) {
        throw new Error('The backend returned an invalid report file.')
      }
      const reportBlob = await response.blob()
      if (!reportBlob.size) throw new Error('The generated report file is empty.')
      const downloadUrl = URL.createObjectURL(reportBlob)
      const downloadLink = document.createElement('a')
      downloadLink.href = downloadUrl
      downloadLink.download = `ocutwin-retinal-twin-${patient.patient_id}.pdf`
      document.body.appendChild(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
    } catch (requestError) {
      setReportError(requestError.message || 'Unable to generate the Retinal Twin report.')
    } finally {
      reportRequestActive.current = false
      setReportBusy(false)
    }
  }

  const logout = () => {
    clearSession('')
    setPasswordInput('')
    setDoctorIdInput('')
    setShowPassword(false)
  }

  const returnToDirectory = () => {
    setCurrentView('directory')
    setIsSidebarOpen(false)
    setProfileError('')
    setError('')
  }

  if (currentView === 'access') {
    return (
      <main className="demo-access-shell">
        <section className="demo-access-card">
          <div className="brand-mark"><EyeMark /></div>
          <p className="eyebrow">OcuTwin · Academic prototype</p>
          <h1>Doctor sign in</h1>
          <p className="demo-access-copy">Sign in to the local research prototype to review registered demo patients and their saved OCT observations.</p>
          <div className="demo-access-notice">
            <CircleHelp size={18} />
            <span>Local research/demo authentication only. This prototype is not a production clinical system; do not use identifiable clinical data.</span>
          </div>
          {authChecking ? <p className="empty-state">Checking saved doctor session…</p> : (
            <form className="login-form" onSubmit={login}>
              <label htmlFor="doctor-id">Doctor ID or email</label>
              <input
                id="doctor-id"
                type="text"
                autoComplete="username"
                value={doctorIdInput}
                onChange={(event) => setDoctorIdInput(event.target.value)}
                maxLength={254}
                required
              />
              <label htmlFor="doctor-password">Password</label>
              <div className="password-input-wrap">
                <input
                  id="doctor-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                  maxLength={1024}
                  required
                />
                <button type="button" className="password-visibility" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {loginError && <div className="error-box" role="alert">{loginError}</div>}
              <button type="submit" className="primary-action demo-access-button" disabled={loginBusy}>
                {loginBusy ? 'Signing in…' : 'Login'}<ChevronRight size={17} />
              </button>
            </form>
          )}
          <BackendStatus status={backendStatus} />
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isSidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><EyeMark /></div>
          <div><p className="brand-name">OcuTwin</p><p className="brand-caption">Doctor demo workspace</p></div>
          <button className="mobile-close" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="sidebar-label">Workspace</div>
        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map(({ label, view, icon: Icon }) => (
            <button key={view} className={`nav-item ${currentView === view ? 'nav-item-active' : ''}`} onClick={() => { setCurrentView(view); setIsSidebarOpen(false) }}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {currentView === view && <ChevronRight className="nav-chevron" size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><CircleHelp size={17} /><div><strong>Local research prototype</strong><span>Demo authentication only</span></div></div>
          <div className="profile-row">
            <div className="avatar"><UserRound size={15} /></div>
            <div><strong>Demo workspace</strong><span>{patientIsLoaded ? patient.patient_id : 'Local access'}</span></div>
            <button type="button" aria-label="Logout" title="Logout" onClick={logout}><LogOut size={15} /></button>
          </div>
        </div>
      </aside>

      {isSidebarOpen && <button className="sidebar-scrim" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation overlay" />}

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setIsSidebarOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="breadcrumb"><span>Doctor workspace</span><ChevronRight size={14} /><strong>{currentView === 'workspace' ? patient?.patient_id || 'Patient workspace' : activeNav?.label || 'Dashboard'}</strong></div>
          <div className="topbar-actions"><BackendStatus status={backendStatus} /></div>
        </header>

        <div className="page-wrap doctor-page-wrap">
          {currentView === 'dashboard' && (
            <DoctorDashboard
              doctorIdentity={doctorIdentity}
              patients={patients}
              scans={dashboardScans}
              isLoading={patientsBusy || dashboardActivityBusy}
              error={patientsError}
              activityError={dashboardActivityError}
              modelInfo={modelInfo}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onRetry={loadDashboardData}
              onOpenDirectory={() => setCurrentView('directory')}
              onCreatePatient={() => setCurrentView('directory')}
              onLogout={logout}
              onOpenPatient={openPatient}
            />
          )}

          {currentView === 'directory' && (
            <PatientDirectory
              patients={filteredPatients}
              totalPatients={patients.length}
              isLoading={patientsBusy}
              error={patientsError}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              patientForm={patientForm}
              onPatientFormChange={(field, value) => setPatientForm((current) => ({ ...current, [field]: value }))}
              onGeneratePatientId={generatePatientId}
              profileBusy={profileBusy}
              profileError={profileError}
              onRetry={loadPatients}
              onCreatePatient={createPatient}
              onOpenPatient={openPatient}
            />
          )}

          {currentView === 'workspace' && (
            <PatientWorkspace
              patient={patient}
              patientIsLoaded={patientIsLoaded}
              scans={scans}
              profileBusy={profileBusy}
              profileMessage={profileMessage}
              profileError={profileError}
              historyBusy={historyBusy}
              historyError={historyError}
              selectedFile={selectedFile}
              previewUrl={previewUrl}
              eyeSide={eyeSide}
              scanDate={scanDate}
              visitNotes={visitNotes}
              savedScan={savedScan}
              latestScan={latestScan}
              latestImageUrl={latestImageUrl}
              latestImageError={latestImageError}
              savedImageError={savedImageError}
              gradcamDataUrl={gradcamDataUrl}
              gradcamError={gradcamError}
              isAnalyzing={isAnalyzing}
              error={error}
              onBack={returnToDirectory}
              onEyeSideChange={(value) => {
                scanRequestId.current = ''
                setEyeSide(value)
              }}
              onScanDateChange={(value) => {
                scanRequestId.current = ''
                setScanDate(value)
              }}
              onVisitNotesChange={(value) => {
                scanRequestId.current = ''
                setVisitNotes(value)
              }}
              onDrop={handleDrop}
              onFileChange={(event) => handleFile(event.target.files?.[0])}
              onClearImage={clearImage}
              onAnalyze={analyzeAndSaveScan}
              onSelectSavedScan={selectSavedScan}
              savedImageUrl={savedImageUrl}
              onSavedImageError={() => setSavedImageError('Unable to retrieve this saved image from the backend.')}
              comparisonScanIds={comparisonScanIds}
              onComparisonScanChange={(index, value) => {
                setComparisonScanIds((current) => current.map((id, slot) => slot === index ? value : id))
                setComparisonImages([])
                setComparisonError('')
              }}
              comparisonImages={comparisonImages}
              comparisonBusy={comparisonBusy}
              comparisonError={comparisonError}
              onCompareScans={compareSelectedScans}
              assessmentImages={assessmentImages}
              assessmentImagesBusy={assessmentImagesBusy}
              assessmentImagesError={assessmentImagesError}
              onLoadAmdAssessmentImages={loadAmdAssessmentImages}
              reportBusy={reportBusy}
              reportError={reportError}
              onExportReport={exportRetinalTwinReport}
            />
          )}
        </div>
      </main>
    </div>
  )
}

function DoctorDashboard({
  doctorIdentity,
  patients,
  scans,
  isLoading,
  error,
  activityError,
  modelInfo,
  searchTerm,
  onSearchChange,
  onRetry,
  onOpenDirectory,
  onCreatePatient,
  onLogout,
  onOpenPatient,
}) {
  const activityScans = Array.isArray(scans) ? scans : []
  const {
    matchingPatients,
    recentPatients,
    recentScans,
    predictionCounts,
  } = buildDashboardSummary(patients, activityScans, searchTerm)
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const dataReady = !isLoading && !error && !activityError && Array.isArray(scans)

  return (
    <>
      <section className="doctor-page-heading">
        <div>
          <p className="eyebrow">Experimental retinal digital-twin prototype</p>
          <h1>{doctorIdentity ? `Welcome, ${doctorIdentity}` : 'Doctor overview'}</h1>
          <p className="hero-copy">Overview of your recorded retinal observations. Counts summarize saved records only; they are not clinical outcomes or prevalence estimates.</p>
        </div>
        <div className="dashboard-actions">
          <button type="button" className="primary-action" onClick={onCreatePatient}><UserRound size={16} /> New patient</button>
          <button type="button" className="secondary-action" onClick={onOpenDirectory}><Users size={16} /> Patient directory</button>
          <button type="button" className="dashboard-logout" onClick={onLogout}><LogOut size={15} /> Logout</button>
        </div>
      </section>

      <section className="overview-grid doctor-overview-grid" aria-label="Saved record counts">
        <SummaryCard label="Total patients" value={isLoading ? '…' : error ? 'Unavailable' : String(patients.length)} note="Registered local profiles" icon={<Users size={19} />} />
        <SummaryCard label="Total recorded scans" value={isLoading ? '…' : dataReady ? String(scans.length) : 'Unavailable'} note="Saved OCT records" icon={<ScanLine size={19} />} />
        <SummaryCard label="AMD predictions" value={isLoading ? '…' : dataReady ? String(predictionCounts.AMD) : 'Unavailable'} note="Saved model predictions" icon={<Sparkles size={19} />} />
        <SummaryCard label="Non-AMD predictions" value={isLoading ? '…' : dataReady ? String(predictionCounts['Non-AMD']) : 'Unavailable'} note="Saved model predictions" icon={<ShieldCheck size={19} />} />
      </section>

      {modelInfo && <p className="dashboard-model-status"><Microscope size={15} /> Current model service: {modelInfo.ready ? 'Ready' : 'Unavailable'}{modelInfo.model?.architecture ? ` · ${modelInfo.model.architecture}` : ''}</p>}
      {error && <div className="error-box directory-error" role="alert">{error}<button type="button" onClick={onRetry}>Retry</button></div>}
      {activityError && <div className="error-box directory-error" role="alert">{activityError}<button type="button" onClick={onRetry}>Retry scan activity</button></div>}
      {isLoading && <p className="empty-state">Loading registered patients and saved scan records…</p>}
      {!isLoading && !error && patients.length === 0 && (
        <div className="panel directory-empty-panel">
          <h2>No registered patients yet</h2>
          <p className="empty-state">Create a local patient profile to begin recording OCT observations.</p>
          <button type="button" className="primary-action" onClick={onCreatePatient}>Register first patient</button>
        </div>
      )}

      {!isLoading && !error && patients.length > 0 && (
        <div className="dashboard-activity-grid">
          <section className="panel recent-activity-panel">
            <div className="panel-header">
              <div><span className="eyebrow-small">Patient records</span><h2>Recent patient activity</h2></div>
              <button type="button" className="text-action" onClick={onOpenDirectory}>Full directory<ChevronRight size={15} /></button>
            </div>
            <label className="dashboard-search"><Search size={16} /><input value={searchTerm} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search patient ID or name" aria-label="Search patients by ID or name" /></label>
            {activityError ? <p className="empty-state">Patient list is available, but scan-based activity could not be loaded.</p>
              : recentPatients.length === 0 ? <p className="empty-state">{normalizedSearch ? 'No patients match this search.' : 'No patient activity is available.'}</p>
                : (
                  <div className="recent-patient-list">
                    <div className="recent-patient-row recent-patient-header"><span>Patient</span><span>Scans</span><span>Latest scan date</span><span>Prediction</span><span /></div>
                    {recentPatients.map((record) => (
                      <div className="recent-patient-row" key={record.patient_id}>
                        <div className="dashboard-patient-cell"><strong>{record.name || record.patient_id}</strong>{record.name && <small>ID {record.patient_id}</small>}</div>
                        <span>{record.savedScanCount}</span>
                        <span>{formatDate(record.latestScan?.scan_date)}</span>
                        <PredictionBadge prediction={record.latestScan?.prediction} />
                        <button type="button" className="text-action" onClick={() => onOpenPatient(record.patient_id)}>Open twin<ChevronRight size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
            <p className="data-caveat">Ordering uses latest scan upload timestamp, then recorded scan date; patients without scans use profile creation time. Upload time is not scan acquisition time.</p>
          </section>

          <section className="panel recent-scan-panel">
            <div className="panel-header">
              <div><span className="eyebrow-small">Saved OCT records</span><h2>Recent scan activity</h2></div>
            </div>
            {activityError ? <p className="empty-state">Saved scan activity could not be loaded.</p>
              : !dataReady ? <p className="empty-state">Loading saved OCT records…</p>
                : recentScans.length === 0 ? <p className="empty-state">Patients are registered, but no scans have been saved yet.</p>
                  : <div className="recent-scan-list">
                    {recentScans.map((scan) => {
                      const owner = patients.find((record) => record.patient_id === scan.patient_id)
                      if (!owner || scan.patient_id !== owner.patient_id) return null
                      return (
                        <article className="recent-scan-item" key={`${scan.patient_id}-${scan.scan_id}`}>
                          <div className="recent-scan-top">
                            <div><strong>{owner.name || owner.patient_id}</strong>{owner.name && <small>ID {owner.patient_id}</small>}</div>
                            <PredictionBadge prediction={scan.prediction} />
                          </div>
                          <div className="recent-scan-details">
                            <span>{scan.scan_date ? `Scan date ${formatDate(scan.scan_date)}` : `Scan date not provided · Uploaded ${formatDate(scan.uploaded_at)}`}</span>
                            <span>{scan.eye_side ? `${scan.eye_side} eye` : 'Eye side not provided'}</span>
                            <span>AMD {formatProbability(scan.class_probabilities?.AMD ?? scan.amd_probability)} · Non-AMD {formatProbability(scan.class_probabilities?.['Non-AMD'])}</span>
                          </div>
                          <button type="button" className="text-action" onClick={() => onOpenPatient(owner.patient_id)}>Open Retinal Twin Profile<ChevronRight size={14} /></button>
                        </article>
                      )
                    })}
                  </div>}
            <p className="data-caveat">Activity is ordered by saved upload timestamp, with recorded scan date used only when upload time is unavailable.</p>
          </section>
        </div>
      )}
    </>
  )
}

function PredictionBadge({ prediction }) {
  const classification = classifyPrediction(prediction)
  return classification
    ? <span className={`prediction-badge prediction-badge-${classification === 'AMD' ? 'amd' : 'non-amd'}`}>{classification}</span>
    : <span className="prediction-badge prediction-badge-unavailable">Unavailable</span>
}

function PatientDirectory({
  patients,
  totalPatients,
  isLoading,
  error,
  searchTerm,
  onSearchChange,
  patientForm,
  onPatientFormChange,
  onGeneratePatientId,
  profileBusy,
  profileError,
  onRetry,
  onCreatePatient,
  onOpenPatient,
}) {
  return (
    <>
      <section className="doctor-page-heading">
        <div><p className="eyebrow">Local patient records</p><h1>Patient directory</h1><p className="hero-copy">Search real profiles stored by the local backend or create a de-identified demo profile.</p></div>
      </section>
      <section className="panel registration-panel">
        <div className="panel-header">
          <div><span className="eyebrow-small">New local profile</span><h2>Register a patient</h2></div>
          <span className="panel-action">Use a demo alias; avoid real personal data</span>
        </div>
        <form className="patient-registration-form" onSubmit={onCreatePatient}>
          <div className="registration-grid">
            <label>Patient ID <span className="required-label">Required</span>
              <div className="patient-id-entry">
                <input
                  value={patientForm.patient_id}
                  onChange={(event) => onPatientFormChange('patient_id', event.target.value)}
                  maxLength={64}
                  pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}"
                  placeholder="e.g. Demo_001"
                  required
                  aria-label="Patient ID"
                />
                <button type="button" className="secondary-action" onClick={onGeneratePatientId}>Generate ID</button>
              </div>
            </label>
            <label>Patient name or demo alias <span className="required-label">Required</span>
              <input
                value={patientForm.name}
                onChange={(event) => onPatientFormChange('name', event.target.value)}
                maxLength={120}
                autoComplete="off"
                placeholder="e.g. Demo participant A"
                required
              />
            </label>
            <label>Age <span className="required-label">Required</span>
              <input
                type="number"
                value={patientForm.age}
                onChange={(event) => onPatientFormChange('age', event.target.value)}
                min="0"
                max="120"
                step="1"
                placeholder="0–120"
                required
              />
            </label>
            <label>Sex <span className="optional-label">(optional)</span>
              <select value={patientForm.sex} onChange={(event) => onPatientFormChange('sex', event.target.value)}>
                <option value="">Not provided</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="intersex">Intersex</option>
                <option value="another">Another identity</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </label>
            <label>Contact or reference details <span className="optional-label">(optional; demo-safe only)</span>
              <input
                value={patientForm.contact}
                onChange={(event) => onPatientFormChange('contact', event.target.value)}
                maxLength={200}
                autoComplete="off"
                placeholder="Non-identifying reference"
              />
            </label>
            <label className="registration-notes">Relevant medical notes <span className="optional-label">(optional; avoid identifiable details)</span>
              <textarea
                value={patientForm.notes}
                onChange={(event) => onPatientFormChange('notes', event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Enter only relevant, non-identifying demo notes"
              />
            </label>
          </div>
          <button type="submit" className="primary-action" disabled={profileBusy}>
            {profileBusy ? 'Saving profile…' : 'Save and open patient'}<ChevronRight size={16} />
          </button>
        </form>
      </section>
      <section className="directory-toolbar">
        <label className="directory-search">
          <Search size={18} />
          <input type="search" value={searchTerm} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search by patient ID" aria-label="Search patients by ID" />
        </label>
      </section>
      {profileError && <div className="error-box directory-error" role="alert">{profileError}</div>}
      {isLoading && <p className="empty-state">Loading the patient directory…</p>}
      {error && <div className="error-box directory-error" role="alert">{error}<button type="button" onClick={onRetry}>Retry</button></div>}
      {!isLoading && !error && totalPatients === 0 && (
        <div className="panel directory-empty-panel">
          <h2>No registered patients yet</h2>
          <p className="empty-state">Use the registration form above to create the first local demo record.</p>
        </div>
      )}
      {!isLoading && !error && totalPatients > 0 && patients.length === 0 && <p className="empty-state">No patients match “{searchTerm}”.</p>}
      {!isLoading && !error && patients.length > 0 && (
        <section className="patient-directory-grid" aria-label={`Patient records, ${patients.length} shown`}>
          {patients.map((patient) => (
            <article className="patient-directory-card" key={patient.patient_id}>
              <div className="directory-card-top">
                <span className="directory-patient-icon"><UserRound size={19} /></span>
                <span className="visit-count">{patient.scan_count} {patient.scan_count === 1 ? 'scan' : 'scans'}</span>
              </div>
              <h2>{patient.name || patient.patient_id}</h2>
              {patient.name && <p className="directory-patient-id">Patient ID: {patient.patient_id}</p>}
              <p>{patient.age != null ? `Age ${patient.age}` : 'Age not provided'}{patient.sex ? ` · ${patient.sex}` : ''}</p>
              <p>Profile created {formatDate(patient.created_at)}</p>
              {patient.latest_scan ? (
                <div className="directory-last-activity">
                  <strong>Latest saved scan · {patient.latest_scan.eye_side} eye</strong>
                  <span>{patient.latest_scan.prediction} · AMD probability {formatProbability(patient.latest_scan.amd_probability)}</span>
                  <small>Uploaded {formatDate(patient.latest_scan.uploaded_at)}</small>
                </div>
              ) : <div className="directory-no-scans">No saved scans</div>}
              <button type="button" className="secondary-action" onClick={() => onOpenPatient(patient.patient_id)}>Open patient workspace<ChevronRight size={16} /></button>
            </article>
          ))}
        </section>
      )}
    </>
  )
}

function PatientWorkspace({
  patient,
  patientIsLoaded,
  scans,
  profileBusy,
  profileMessage,
  profileError,
  historyBusy,
  historyError,
  selectedFile,
  previewUrl,
  eyeSide,
  scanDate,
  visitNotes,
  savedScan,
  latestScan,
  latestImageUrl,
  latestImageError,
  savedImageUrl,
  savedImageError,
  gradcamDataUrl,
  gradcamError,
  isAnalyzing,
  error,
  onBack,
  onEyeSideChange,
  onScanDateChange,
  onVisitNotesChange,
  onDrop,
  onFileChange,
  onClearImage,
  onAnalyze,
  onSelectSavedScan,
  onSavedImageError,
  comparisonScanIds,
  onComparisonScanChange,
  comparisonImages,
  comparisonBusy,
  comparisonError,
  onCompareScans,
  assessmentImages,
  assessmentImagesBusy,
  assessmentImagesError,
  onLoadAmdAssessmentImages,
  reportBusy,
  reportError,
  onExportReport,
}) {
  if (profileBusy && !patient) return <p className="empty-state">Loading patient workspace…</p>
  if (!patient) return (
    <div className="panel directory-empty-panel">
      <div className="error-box" role="alert">{profileError || 'No patient is selected.'}</div>
      <button type="button" className="primary-action" onClick={onBack}>Return to patient directory</button>
    </div>
  )

  return (
    <>
      <section className="workspace-heading">
        <button type="button" className="text-action back-action" onClick={onBack}><ArrowLeft size={16} /> Patient directory</button>
        <div className="workspace-title-row">
          <div><p className="eyebrow">Experimental retinal digital twin</p><h1>Retinal Twin Profile</h1><p className="hero-copy">{patient.name || patient.patient_id} · ID {patient.patient_id} · {scans.length} actual saved {scans.length === 1 ? 'OCT observation' : 'OCT observations'}</p></div>
          <div className="workspace-actions">
            <button type="button" className="secondary-action" onClick={onExportReport} disabled={reportBusy || !patientIsLoaded}>
              <Download size={16} /> {reportBusy ? 'Generating report…' : 'Export Retinal Twin Report'}
            </button>
            <button type="button" className="primary-action" onClick={() => document.getElementById('scan-upload')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><Upload size={16} /> Upload OCT scan</button>
          </div>
        </div>
      </section>

      {profileMessage && <div className="success-box directory-error" role="status">{profileMessage}</div>}
      {profileError && <div className="error-box directory-error" role="alert">{profileError}</div>}
      {reportError && <div className="error-box directory-error" role="alert">{reportError}</div>}

      <section className="panel twin-summary-panel">
        <div className="twin-summary-identity">
          <span className="directory-patient-icon"><UserRound size={19} /></span>
          <div><span className="eyebrow-small">Patient-specific record</span><h2>{patient.name || 'Name / alias not provided'}</h2><p>{patient.patient_id} · Age {patient.age ?? 'not provided'}{patient.sex ? ` · ${patient.sex}` : ''}</p></div>
        </div>
        <div className="twin-summary-meta">
          <div><span>Saved OCT observations</span><strong>{scans.length}</strong></div>
          <div><span>Profile created</span><strong>{formatDate(patient.created_at)}</strong></div>
        </div>
      </section>

      <section className="panel latest-observation-panel">
        <PanelHeader eyebrow="Latest saved observation" title="Latest OCT scan and model output" action={latestScan ? `Saved ${formatDate(latestScan.uploaded_at)}` : 'No saved observations'} />
        {!historyBusy && !historyError && !latestScan ? (
          <div className="twin-empty-state">
            <ScanLine size={22} />
            <div><strong>No OCT observations saved yet</strong><p>Upload the patient’s first OCT scan to begin this experimental retinal twin profile.</p></div>
          </div>
        ) : historyBusy ? <p className="empty-state">Loading saved observations from the backend…</p>
          : historyError ? <div className="error-box" role="alert">{historyError}</div>
            : (
              <div className="latest-observation-grid">
                <div className="latest-image-panel">
                  {latestScan.image_available === false || latestImageError
                    ? <p className="empty-state">{latestImageError || 'The latest saved image is unavailable.'}</p>
                    : latestImageUrl
                      ? <img src={latestImageUrl} alt={`Latest saved OCT scan ${latestScan.scan_id}`} />
                      : <p className="empty-state">Loading latest saved OCT image…</p>}
                </div>
                <div className="latest-observation-details">
                  <div className="latest-prediction"><span>Saved prediction</span><strong>{latestScan.prediction || 'Not available'}</strong></div>
                  <div className="latest-facts">
                    <div><span>Scan date</span><strong>{formatDate(latestScan.scan_date)}</strong></div>
                    <div><span>Eye side</span><strong>{latestScan.eye_side || 'Not provided'}</strong></div>
                    <div><span>Model version</span><strong>{latestScan.model_version || 'Not reported'}</strong></div>
                    <div><span>Uploaded</span><strong>{formatDate(latestScan.uploaded_at)}</strong></div>
                  </div>
                  <div className="latest-probabilities">
                    <SummaryCard label="AMD probability" value={formatProbability(latestScan.class_probabilities?.AMD ?? latestScan.amd_probability)} note="Stored classifier output" icon={<Sparkles size={18} />} />
                    <SummaryCard label="Non-AMD probability" value={formatProbability(latestScan.class_probabilities?.['Non-AMD'])} note="Stored classifier output" icon={<ShieldCheck size={18} />} />
                  </div>
                  <p className="data-caveat">Model-generated probabilities are not a confirmed diagnosis or calibrated clinical risk.</p>
                </div>
              </div>
            )}
      </section>

      <AmdProgressAssessment
        patientId={patient.patient_id}
        scans={scans}
        historyBusy={historyBusy}
        historyError={historyError}
        images={assessmentImages}
        imagesBusy={assessmentImagesBusy}
        imagesError={assessmentImagesError}
        onLoadImages={onLoadAmdAssessmentImages}
        onSelectSavedScan={onSelectSavedScan}
      />

      <ProgressTracking
        scans={scans}
        historyBusy={historyBusy}
        historyError={historyError}
        patientId={patient.patient_id}
        comparisonScanIds={comparisonScanIds}
        onComparisonScanChange={onComparisonScanChange}
        comparisonImages={comparisonImages}
        comparisonBusy={comparisonBusy}
        comparisonError={comparisonError}
        onCompareScans={onCompareScans}
      />

      <section className="workspace-content-grid">
        <div className="workspace-main-column">
          <div className="panel upload-panel" id="scan-upload">
            <PanelHeader eyebrow="OCT imaging" title="Upload and analyze scan" action="Saved to this patient" />
            <div className="visit-fields">
              <label>Eye side
                <select value={eyeSide} onChange={(event) => onEyeSideChange(event.target.value)}>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label>Scan date <span className="optional-label">(optional)</span>
                <input type="date" value={scanDate} onChange={(event) => onScanDateChange(event.target.value)} />
              </label>
              <label className="visit-notes-field">Visit notes <span className="optional-label">(optional)</span>
                <textarea maxLength={2000} rows={2} value={visitNotes} onChange={(event) => onVisitNotesChange(event.target.value)} placeholder="Non-identifying notes for this scan" />
              </label>
            </div>

            <div className="upload-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
              {previewUrl ? (
                <div className="image-preview-wrap"><img src={previewUrl} alt="Selected OCT scan preview" /><button className="remove-image" onClick={onClearImage} aria-label="Remove image"><X size={14} /></button></div>
              ) : (
                <>
                  <div className="upload-icon"><CloudUpload size={22} /></div>
                  <strong>Drop an OCT image here</strong><span>or browse from your device</span>
                  <label className="browse-button"><Upload size={15} /> Choose image<input type="file" accept="image/jpeg,image/png" onChange={onFileChange} /></label>
                  <small>JPEG or PNG · up to 20 MB</small>
                </>
              )}
            </div>

            {previewUrl && (
              <div className="selected-file">
                <div><FileImage size={16} /><div><b>{selectedFile?.name}</b><span>{patientIsLoaded ? `Ready to save to ${patient.patient_id}` : 'Patient profile is not loaded'}</span></div></div>
                <button onClick={onAnalyze} className="analyze-button" disabled={isAnalyzing || !patientIsLoaded}>
                  {isAnalyzing ? 'Analyzing and saving…' : 'Analyze / Save'}<ArrowUpRight size={16} />
                </button>
              </div>
            )}
            {error && <div className="error-box" role="alert">{error}</div>}
            {savedScan && <SavedScanSummary scan={savedScan} />}
          </div>

          <section className="section-anchor workspace-results">
            <div className="section-heading"><div><p className="eyebrow">Selected saved observation</p><h2>Prediction and explainability</h2></div><span className="section-note"><Sparkles size={15} /> No clinical risk estimate</span></div>
            {savedScan ? <div className="model-output-grid">
              <SummaryCard label="Prediction" value={savedScan.prediction} note={`Eye: ${savedScan.eye_side}`} icon={<ScanLine size={19} />} />
              <SummaryCard label="AMD probability" value={formatProbability(savedScan.amd_probability)} note="Classifier output; not calibrated clinical risk" icon={<Sparkles size={19} />} />
              <SummaryCard label="Non-AMD probability" value={formatProbability(savedScan.class_probabilities?.['Non-AMD'])} note="Returned by the model endpoint" icon={<ShieldCheck size={19} />} />
              <SummaryCard label="Model version" value={savedScan.model_version || 'Not reported'} note={`Scan ID ${savedScan.scan_id}`} icon={<Microscope size={19} />} />
            </div> : <p className="empty-state">Select a saved scan below or upload an OCT image to display model output.</p>}
            {gradcamError && <div className="info-box">{gradcamError}</div>}
            {gradcamDataUrl && <div className="gradcam-panel"><img src={gradcamDataUrl} alt={`Grad-CAM visualization for saved scan ${savedScan?.scan_id || ''}`} /><div className="gradcam-caption">Grad-CAM is an explanation aid only; it does not establish disease location.</div></div>}
            <p className="data-caveat">Classifier probabilities are not a confirmed diagnosis or calibrated clinical risk. Scan history alone does not establish disease progression.</p>
          </section>

        </div>

        <aside className="workspace-side-column">
          <section className="panel patient-details-panel">
            <PanelHeader eyebrow="Patient record" title="Profile details" />
            <div className="patient-detail-row"><span>Patient ID</span><strong>{patient.patient_id}</strong></div>
            <div className="patient-detail-row"><span>Name / alias</span><strong>{patient.name || 'Not provided (legacy profile)'}</strong></div>
            <div className="patient-detail-row"><span>Age</span><strong>{patient.age ?? 'Not provided (legacy profile)'}</strong></div>
            <div className="patient-detail-row"><span>Sex</span><strong>{patient.sex || 'Not provided'}</strong></div>
            {patient.contact && <div className="patient-detail-row"><span>Contact / reference</span><strong>{patient.contact}</strong></div>}
            <div className="patient-detail-row"><span>Profile created</span><strong>{formatDate(patient.created_at)}</strong></div>
            <div className="patient-detail-row"><span>Saved scans</span><strong>{scans.length}</strong></div>
            {patient.notes && <div className="patient-notes"><span>Profile notes</span><p>{patient.notes}</p></div>}
            <p className="prototype-warning light-warning">Local demo record only. Do not store identifiable clinical information.</p>
          </section>

          <section className="panel history-panel">
            <PanelHeader eyebrow="Patient-specific records" title="Scan history" action={`${scans.length} scans`} />
            <p className="timeline-caption">Chronology uses recorded scan dates only. Upload timestamps are not used as scan dates.</p>
            {historyBusy ? <p className="empty-state">Loading saved scan history…</p>
              : historyError ? <div className="error-box" role="alert">{historyError}</div>
                : scans.length === 0 ? <p className="empty-state">No saved scans for this patient yet.</p>
                  : <div className="scan-history-list">
                    {scans.map((scan) => (
                      <article className={`scan-history-item ${savedScan?.scan_id === scan.scan_id ? 'scan-history-item-active' : ''}`} key={scan.scan_id}>
                        <div className="scan-history-summary">
                          <div><strong>{scan.prediction || 'Prediction unavailable'} <span>· {scan.eye_side || 'Eye side unavailable'}</span></strong><small>Scan date: {formatDate(scan.scan_date)} · Uploaded: {formatDate(scan.uploaded_at)}</small><small>AMD probability: {formatProbability(scan.class_probabilities?.AMD ?? scan.amd_probability)}</small></div>
                          <button type="button" onClick={() => onSelectSavedScan(scan)} disabled={!scan.image_available}>{scan.image_available ? 'Inspect saved scan' : 'Image unavailable'}</button>
                        </div>
                      </article>
                    ))}
                  </div>}
            {savedScan && (
              <div className="saved-scan-view">
                <h3>Saved OCT image and result</h3>
                {savedScan.image_available === false || savedImageError ? <p className="empty-state">{savedImageError || 'The backend reports that this scan image is unavailable.'}</p>
                  : savedImageUrl ? <img src={savedImageUrl} alt={`Saved OCT scan ${savedScan.scan_id}`} onError={onSavedImageError} />
                    : <p className="empty-state">Loading saved OCT image…</p>}
                <small>Scan ID: {savedScan.scan_id}</small>
              </div>
            )}
          </section>
        </aside>
      </section>
    </>
  )
}

function ProgressTracking({
  scans,
  historyBusy,
  historyError,
  patientId,
  comparisonScanIds,
  onComparisonScanChange,
  comparisonImages,
  comparisonBusy,
  comparisonError,
  onCompareScans,
}) {
  const [eyeFilter, setEyeFilter] = useState('all')
  const longitudinal = useMemo(
    () => buildLongitudinalData(scans, eyeFilter),
    [scans, eyeFilter],
  )
  const hasChartValues = longitudinal.chartData.some((point) => (
    longitudinal.seriesGroups.some((group) => point[group.key] !== null)
  ))
  const chartEyes = eyeFilter === 'all'
    ? ['left', 'right', 'unknown'].filter((eye) => longitudinal.chartData.some((point) => point.eye === eye))
    : [eyeFilter]
  const chartPanels = chartEyes.map((eye) => {
    const data = longitudinal.chartData.filter((point) => point.eye === eye)
    const groups = longitudinal.seriesGroups.filter((group) => group.eye === eye)
    return {
      eye,
      data,
      groups,
      hasValues: data.some((point) => groups.some((group) => point[group.key] !== null)),
    }
  })
  const availableEyes = [...new Set(scans.map(getObservationEye))]
  const datedVersions = scans
    .filter((scan) => parseObservationDate(scan.scan_date))
    .map((scan) => (typeof scan.model_version === 'string' ? scan.model_version.trim() : ''))
  const knownVersions = [...new Set(datedVersions.filter(Boolean))]
  const missingVersionCount = datedVersions.filter((version) => !version).length
  const hasVersionCaveat = knownVersions.length > 1 || missingVersionCount > 0

  return (
    <section className="panel longitudinal-panel" id="progress-tracking">
      <PanelHeader eyebrow="Saved observation review" title="Longitudinal observation overview" action={`${scans.length} saved observations`} />
      <p className="longitudinal-intro">This view organizes recorded OCT observations over time. It summarizes saved model outputs and does not assess disease progression.</p>

      {historyBusy ? <p className="empty-state">Loading saved scan history…</p>
        : historyError ? <div className="error-box" role="alert">{historyError}</div>
          : scans.length === 0 ? <p className="empty-state">No OCT scans recorded for this patient.</p>
            : (
              <>
                <div className="longitudinal-chart-heading">
                  <div><h3><Activity size={17} /> Stored AMD probability by recorded scan date</h3><p>Values are saved classifier outputs, shown separately by eye and model version.</p></div>
                  <label>Eye
                    <select value={eyeFilter} onChange={(event) => setEyeFilter(event.target.value)}>
                      <option value="all">All eye sides</option>
                      {availableEyes.includes('left') && <option value="left">Left eye</option>}
                      {availableEyes.includes('right') && <option value="right">Right eye</option>}
                      {availableEyes.includes('unknown') && <option value="unknown">Eye side unavailable</option>}
                    </select>
                  </label>
                </div>
                {longitudinal.chartData.length > 0 && hasChartValues ? (
                  <>
                    <div className="longitudinal-chart-panels">
                      {chartPanels.map(({ eye, data, groups, hasValues: panelHasValues }) => (
                        <article className="longitudinal-chart-panel" key={eye}>
                          <h4>{eye === 'unknown' ? 'Eye side unavailable · isolated observations' : `${eye} eye`}</h4>
                          {panelHasValues ? (
                            <div className="longitudinal-chart" role="img" aria-label={`${eye} eye AMD probability by recorded scan date, separated by model version`}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 12 }}>
                                  <CartesianGrid stroke="#e9eef5" strokeDasharray="3 3" />
                                  <XAxis dataKey="axisLabel" tick={{ fill: '#8290a2', fontSize: 10 }} minTickGap={24} />
                                  <YAxis domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} tick={{ fill: '#8290a2', fontSize: 10 }} width={48} />
                                  <Tooltip content={<LongitudinalTooltip />} />
                                  {groups.map((group) => (
                                    <Line
                                      key={group.key}
                                      type="linear"
                                      dataKey={group.key}
                                      name={`${group.eye === 'unknown' ? 'Eye unavailable' : `${group.eye} eye`} · ${group.modelVersion || 'model version unavailable'}`}
                                      stroke={group.isolated ? 'transparent' : group.eye === 'left' ? '#5875ba' : '#24a58d'}
                                      strokeDasharray={group.eye === 'right' ? '5 4' : undefined}
                                      strokeWidth={2}
                                      dot={{ r: 4, fill: group.eye === 'unknown' ? '#8a98aa' : group.eye === 'left' ? '#5875ba' : '#24a58d' }}
                                      activeDot={{ r: 6 }}
                                      connectNulls={false}
                                      isAnimationActive={false}
                                    />
                                  ))}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : <p className="empty-state">No valid saved AMD probabilities are available for this eye.</p>}
                        </article>
                      ))}
                    </div>
                    <div className="longitudinal-chart-key">
                      {longitudinal.seriesGroups.map((group) => (
                        <span key={group.key}><i className={`trend-key-${group.eye}`} />{group.eye === 'unknown' ? 'Eye unavailable' : `${group.eye} eye`} · {group.modelVersion || 'model version unavailable'}</span>
                      ))}
                    </div>
                  </>
                ) : <p className="empty-state">
                  {longitudinal.chartData.length
                    ? 'Recorded dates are available, but no valid saved AMD probabilities can be charted.'
                    : 'No valid recorded scan dates are available for the chart. Upload timestamps are not substituted.'}
                </p>}

                {hasVersionCaveat && (
                  <p className="info-box longitudinal-warning" role="note">
                    <Info size={16} /> {knownVersions.length > 1 ? 'Multiple model versions are present.' : ''}
                    {knownVersions.length > 1 && missingVersionCount > 0 ? ' ' : ''}
                    {missingVersionCount > 0 ? `${missingVersionCount} dated observation(s) have no model version.` : ''}
                    {' '}Outputs from different or unknown model versions may not be directly comparable; chart lines are kept separate.
                  </p>
                )}

                <div className="longitudinal-subsection">
                  <h3>Prediction changes between dated observations</h3>
                  <p>Only adjacent dated observations for the same known eye and the same reported model version are numerically compared.</p>
                  {longitudinal.comparisons.length === 0 ? <p className="empty-state">No same-eye, dated observation pairs are available.</p>
                    : <div className="prediction-change-list">
                      {longitudinal.comparisons.map((comparison) => (
                        <article className="prediction-change-item" key={`${comparison.previous.scan_id}-${comparison.current.scan_id}`}>
                          <div className="prediction-change-heading">
                            <strong>{comparison.eye} eye · {comparison.previous.scan_date} → {comparison.current.scan_date}</strong>
                            <span>{comparison.previous.scan_id || 'ID unavailable'} → {comparison.current.scan_id || 'ID unavailable'}</span>
                          </div>
                          {comparison.comparable ? (
                            <div className="prediction-change-values">
                              <span>Saved class: {comparison.previous.prediction || 'Not available'} → {comparison.current.prediction || 'Not available'}{comparison.predictionChanged ? ' (changed)' : ''}</span>
                              <span>AMD probability: {formatPercentagePointChange(comparison.amdChangePp)}</span>
                              <span>Non-AMD probability: {formatPercentagePointChange(comparison.nonAmdChangePp)}</span>
                              <small>Numerical model-output differences only; not a progression measure.</small>
                            </div>
                          ) : <p className="comparison-not-available">Not compared: {comparison.reason}.</p>}
                        </article>
                      ))}
                    </div>}
                </div>

                <div className="longitudinal-subsection">
                  <h3>Chronological saved observations</h3>
                  <p>{longitudinal.undatedCount > 0 ? `${longitudinal.undatedCount} observation(s) lack a valid recorded date and are listed separately.` : 'Ordered by valid recorded scan date.'}</p>
                  <div className="observation-table-wrap">
                    <table className="observation-table">
                      <thead><tr><th>Recorded date</th><th>Scan ID</th><th>Eye</th><th>Saved class</th><th>AMD</th><th>Non-AMD</th><th>Model</th></tr></thead>
                      <tbody>
                        {longitudinal.orderedScans.map((scan) => {
                          const validDate = parseObservationDate(scan.scan_date)
                          return (
                            <tr key={scan.scan_id || `${scan.scan_date}-${scan.uploaded_at}`}>
                              <td>{validDate || 'Date unavailable'}</td>
                              <td>{scan.scan_id || 'Not available'}</td>
                              <td>{getObservationEye(scan) === 'unknown' ? 'Not available' : getObservationEye(scan)}</td>
                              <td>{scan.prediction || 'Not available'}</td>
                              <td>{formatProbability(getModelProbability(scan, 'AMD'))}</td>
                              <td>{formatProbability(getModelProbability(scan, 'Non-AMD'))}</td>
                              <td>{scan.model_version || 'Not available'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

      <div className="interpretation-note">
        <h3><Info size={17} /> How to interpret this display</h3>
        <ul>
          <li>These entries are model-generated classifications and probabilities tied to saved OCT records, not independently verified clinical findings.</li>
          <li>Left, right, and unknown-eye observations are not combined. Only valid recorded scan dates are used for ordering and charting; upload time is not treated as acquisition time.</li>
          <li>Percentage-point differences compare stored classifier outputs only when adjacent dated observations have the same known eye and model version.</li>
          <li>Side-by-side images are not image-registered and do not provide anatomical measurements, lesion annotations, or evidence of structural change.</li>
        </ul>
      </div>

      <section className="comparison-panel longitudinal-comparison">
        <PanelHeader eyebrow="Same-patient saved records" title="Compare two OCT observations" />
        <p className="timeline-caption">Choose two different saved scans from the same known eye. Detailed image and Grad-CAM views compare those selected records only.</p>
        <div className="comparison-controls">
          {[0, 1].map((index) => (
            <label key={index}>{index === 0 ? 'First scan' : 'Second scan'}
              <select
                value={comparisonScanIds[index]}
                onChange={(event) => onComparisonScanChange(index, event.target.value)}
                disabled={scans.length < 2}
              >
                <option value="">Select a saved scan</option>
                {scans.map((scan) => (
                  <option key={scan.scan_id} value={scan.scan_id}>{scanLabel(scan)}</option>
                ))}
              </select>
            </label>
          ))}
          <button type="button" className="primary-action" onClick={onCompareScans} disabled={comparisonBusy || scans.length < 2}>
            {comparisonBusy ? 'Loading scans and explanations…' : 'Compare scans'}
          </button>
        </div>
        {scans.length < 2 && <p className="empty-state">At least two saved scans for this patient are needed for comparison.</p>}
        {comparisonError && <div className="error-box" role="alert">{comparisonError}</div>}
        {comparisonImages.length === 2 && (
          <div className="scan-comparison-grid">
            {comparisonImages.map(({ scanId, url, gradcam }) => {
              const scan = scans.find((record) => record.scan_id === scanId && record.patient_id === patientId)
              if (!scan) return null
              return (
                <article className="scan-comparison-card" key={scanId}>
                  <h3>{scan.prediction || 'Prediction unavailable'}</h3>
                  <div className="comparison-facts">
                    <div><span>Scan ID</span><strong>{scan.scan_id || 'Not available'}</strong></div>
                    <div><span>Recorded date</span><strong>{parseObservationDate(scan.scan_date) || 'Not available'}</strong></div>
                    <div><span>Eye side</span><strong>{scan.eye_side || 'Not available'}</strong></div>
                    <div><span>AMD probability</span><strong>{formatProbability(getModelProbability(scan, 'AMD'))}</strong></div>
                    <div><span>Non-AMD probability</span><strong>{formatProbability(getModelProbability(scan, 'Non-AMD'))}</strong></div>
                    <div><span>Model version</span><strong>{scan.model_version || 'Not available'}</strong></div>
                  </div>
                  <div className="comparison-image"><img src={url} alt={`Saved OCT scan ${scan.scan_id}`} /></div>
                  <div className="comparison-gradcam">
                    <strong>Model-explanation visualization (Grad-CAM)</strong>
                    {gradcam?.dataUrl
                      ? <img src={gradcam.dataUrl} alt={`Grad-CAM explanation for scan ${scan.scan_id}`} />
                      : <p className="empty-state">{gradcam?.error || 'Grad-CAM is unavailable for this scan.'}</p>}
                  </div>
                </article>
              )
            })}
          </div>
        )}
        <p className="data-caveat">This comparison shows the two selected saved records only. Images are not aligned or anatomically measured; differences do not establish clinically validated disease progression or treatment response. Grad-CAM is a model-explanation visualization, not a verified lesion or clinical finding.</p>
      </section>
    </section>
  )
}

function AmdProgressAssessment({
  patientId,
  scans,
  historyBusy,
  historyError,
  images,
  imagesBusy,
  imagesError,
  onLoadImages,
  onSelectSavedScan,
}) {
  const patientScans = scans.filter((scan) => scan.patient_id === patientId)
  const availableEyes = [...new Set(patientScans.map(getObservationEye).filter((eye) => eye !== 'unknown'))]
  const [selectedEye, setSelectedEye] = useState('left')
  const eye = availableEyes.includes(selectedEye) ? selectedEye : availableEyes[0] || 'left'
  const assessment = useMemo(
    () => buildAmdProgressAssessment(patientScans, patientId, eye),
    [patientScans, patientId, eye],
  )
  const unrecordedDateCount = patientScans.filter((scan) => (
    getObservationEye(scan) === eye && !parseObservationDate(scan.scan_date)
  )).length
  const latestProbabilityAvailable = assessment.latest?.probability !== null
    && assessment.latest?.probability !== undefined
  const previousProbabilityAvailable = assessment.previous?.probability !== null
    && assessment.previous?.probability !== undefined
  const modelWarning = assessment.modelVersionStatus === 'different'
    ? 'The two scans report different model versions. The arithmetic difference is shown for reference, but outputs may not be directly equivalent.'
    : assessment.modelVersionStatus === 'unavailable'
      ? 'A model version is missing for at least one scan. Output comparability cannot be verified.'
      : ''
  const pairMatches = images.length === 2
    && images[0].patientId === patientId
    && images[1].patientId === patientId
    && images[0].scanId === assessment.previous?.scan?.scan_id
    && images[1].scanId === assessment.latest?.scan?.scan_id

  return (
    <>
    <section className="panel amd-progress-assessment" id="amd-progress-assessment">
      <PanelHeader eyebrow="Stored model output comparison" title="AMD Progress Assessment" action="Research observation only" />
      <div className="assessment-eye-selector">
        <label>Eye for assessment
          <select
            value={eye}
            onChange={(event) => setSelectedEye(event.target.value)}
            disabled={!availableEyes.length || historyBusy}
          >
            {availableEyes.length
              ? availableEyes.map((availableEye) => <option key={availableEye} value={availableEye}>{availableEye === 'left' ? 'Left eye' : 'Right eye'}</option>)
              : <option value="left">Left eye</option>}
          </select>
        </label>
        {historyBusy && <span>Loading saved observations…</span>}
      </div>

      {historyError ? <div className="error-box" role="alert">{historyError}</div>
        : assessment.status === 'no-observations' ? (
          <p className="empty-state">No dated {eye}-eye scans are available. Scan history without a valid recorded date cannot be used to establish this comparison.</p>
        ) : assessment.status === 'insufficient-history' ? (
          <div className="assessment-insufficient">
            <div><span>Latest eligible observation</span><strong>{assessment.latest.date}</strong><small>{assessment.latest.scan.scan_id} · AMD probability {formatProbability(assessment.latest.probability)}</small></div>
            <p>Only one dated {eye}-eye scan is available. There is insufficient history for a scan-to-scan comparison.</p>
          </div>
        ) : (
          <>
            <div className="assessment-observation-cards">
              <article>
                <span>Previous observation · {eye} eye</span>
                <strong>{assessment.previous.date}</strong>
                <small>Scan ID: {assessment.previous.scan.scan_id || 'Not available'}</small>
                <small>Prediction: {assessment.previous.scan.prediction || 'Not available'}</small>
                <small>AMD model probability: {formatProbability(assessment.previous.probability)}</small>
                <small>Model version: {assessment.previous.scan.model_version || 'Not available'}</small>
              </article>
              <article>
                <span>Latest observation · {eye} eye</span>
                <strong>{assessment.latest.date}</strong>
                <small>Scan ID: {assessment.latest.scan.scan_id || 'Not available'}</small>
                <small>Prediction: {assessment.latest.scan.prediction || 'Not available'}</small>
                <small>AMD model probability: {formatProbability(assessment.latest.probability)}</small>
                <small>Model version: {assessment.latest.scan.model_version || 'Not available'}</small>
              </article>
            </div>

            <div className={`assessment-change assessment-change-${assessment.direction || 'unavailable'}`}>
              <div><span>Change in AMD model probability</span><strong>{formatPercentagePointChange(assessment.changePp)}</strong></div>
              <div><span>Direction</span><strong>{assessment.direction || 'Unavailable'}</strong></div>
              <div><span>Elapsed recorded time</span><strong>{assessment.elapsedDays} {assessment.elapsedDays === 1 ? 'day' : 'days'}</strong></div>
            </div>

            <p className="assessment-summary" role="status">{buildAmdProgressSummary(assessment)}</p>

            {unrecordedDateCount > 0 && (
              <p className="info-box assessment-warning">
                {unrecordedDateCount} {eye}-eye observation(s) without a valid recorded scan date were excluded; upload timestamps were not used as scan dates.
              </p>
            )}
            {(!previousProbabilityAvailable || !latestProbabilityAvailable) && (
              <p className="info-box assessment-warning">
                At least one AMD probability is missing or outside the valid 0–1 range. No zero or substitute value is used.
              </p>
            )}
            {modelWarning && <p className="info-box assessment-warning">{modelWarning}</p>}
            <p className="info-box assessment-warning">
              Per-scan preprocessing metadata is not stored, so preprocessing equivalence cannot be checked. Model probabilities are sigmoid classifier outputs; no probability-calibration step or metadata was found, so calibration has not been established.
            </p>

            <div className="assessment-scan-section">
              <div className="assessment-scan-heading">
                <div><h3>Actual OCT scan comparison</h3><p>Only the previous and latest eligible saved scans for the selected eye are shown.</p></div>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => onLoadImages(assessment)}
                  disabled={imagesBusy || historyBusy}
                >
                  {imagesBusy ? 'Loading scans and explanations…' : pairMatches ? 'Reload scan comparison' : 'Load scan comparison'}
                </button>
              </div>
              {imagesError && <div className="error-box" role="alert">{imagesError}</div>}
              <div className="assessment-image-grid">
                {[assessment.previous, assessment.latest].map((observation, index) => {
                  const role = index === 0 ? 'previous' : 'latest'
                  const image = pairMatches ? images[index] : null
                  return (
                    <article className="assessment-image-card" key={observation.scan.scan_id}>
                      <h4>{role === 'previous' ? 'Previous' : 'Latest'} · {observation.date}</h4>
                      <div className="comparison-image">
                        {image?.url
                          ? <img src={image.url} alt={`${role} saved OCT scan ${observation.scan.scan_id}`} />
                          : <p className="empty-state">{image?.imageError || 'Load the authenticated saved image for this observation.'}</p>}
                      </div>
                      <p className="assessment-scan-prediction">{observation.scan.prediction || 'Prediction not available'} · AMD probability {formatProbability(observation.probability)}</p>
                      <div className="assessment-gradcam">
                        <strong>Grad-CAM model attention visualization</strong>
                        {image?.gradcam?.dataUrl
                          ? <img src={image.gradcam.dataUrl} alt={`Grad-CAM model attention visualization for scan ${observation.scan.scan_id}`} />
                          : <p className="empty-state">{image?.gradcam?.error || 'Grad-CAM has not been loaded for this observation.'}</p>}
                        <small>Model attention visualization only; not a verified lesion or structural measurement.</small>
                      </div>
                    </article>
                  )
                })}
              </div>
              <p className="data-caveat">The images are displayed side by side without registration or anatomical measurement. Visual differences alone do not establish clinical progression.</p>
            </div>
          </>
        )}
      <div className="structural-progress-note">
        <strong>{STRUCTURAL_PROGRESS_STATUS}</strong>
        <p>No validated retinal segmentation or comparable structural biomarker measurement method is available in this project. Classification probabilities and Grad-CAM cannot establish retinal thickness, lesion area, drusen volume, atrophy, or anatomical progression.</p>
      </div>
      <p className="assessment-disclaimer">AMD probability change is a difference in saved model outputs, not a percentage of disease progression, confirmed change in disease severity, or evidence of retinal improvement. This experimental prototype does not provide a clinical diagnosis or treatment recommendation.</p>
    </section>
    <OverallAmdProgressTimeline
      scans={patientScans}
      patientId={patientId}
      eye={eye}
      historyBusy={historyBusy}
      historyError={historyError}
      onSelectSavedScan={onSelectSavedScan}
    />
    </>
  )
}

function OverallAmdProgressTimeline({ scans, patientId, eye, historyBusy, historyError, onSelectSavedScan }) {
  const timeline = useMemo(
    () => buildOverallAmdTimeline(scans, patientId, eye),
    [scans, patientId, eye],
  )
  const hasProbabilityPoints = timeline.rows.some((row) => row.probability !== null)
  const hasVersionDifferences = timeline.rows.some((row) => (
    row.modelVersionStatus === 'different' || row.modelVersionStatus === 'unavailable'
  ))
  const modelSummaryWarning = timeline.first
    && timeline.latest
    && timeline.first.scan.scan_id !== timeline.latest.scan.scan_id
    && (
      !timeline.first.modelVersion
      || !timeline.latest.modelVersion
      || timeline.first.modelVersion !== timeline.latest.modelVersion
    )

  return (
    <section className="panel overall-amd-timeline" id="overall-amd-progress-timeline">
      <PanelHeader eyebrow="Complete recorded history" title="Overall AMD Progress Timeline" action={`${timeline.observationCount} eligible observations`} />
      <p className="timeline-intro">Every dated saved observation for {eye} eye is listed and graphed below. Only recorded scan dates are used; upload timestamps are shown as upload metadata and are not treated as scan times.</p>

      {historyBusy ? <p className="empty-state">Loading all saved patient observations…</p>
        : historyError ? <div className="error-box" role="alert">{historyError}</div>
        : timeline.observationCount === 0 ? (
          <div className="timeline-empty">
            <p className="empty-state">No eligible dated {eye}-eye observations are available for the overall timeline.</p>
            {timeline.excludedUndatedCount > 0 && <p>{timeline.excludedUndatedCount} observation(s) were excluded because a valid recorded scan date is unavailable.</p>}
          </div>
        ) : (
          <>
            <div className="overall-timeline-summary-grid">
              <div><span>Recorded observations</span><strong>{timeline.observationCount}</strong></div>
              <div><span>Distinct observation dates</span><strong>{timeline.distinctDateCount}</strong></div>
              <div><span>Earliest AMD probability</span><strong>{formatProbability(timeline.first.probability)}</strong><small>{timeline.first.date} · {timeline.first.shortScanId}</small></div>
              <div><span>Latest AMD probability</span><strong>{formatProbability(timeline.latest.probability)}</strong><small>{timeline.latest.date} · {timeline.latest.shortScanId}</small></div>
              <div><span>Earliest-to-latest difference</span><strong>{formatPercentagePointChange(timeline.overallChangePp)}</strong><small>{timeline.overallDirection || 'Unavailable'}</small></div>
              <div><span>Elapsed recorded time</span><strong>{timeline.elapsedDays === null ? 'Not available' : `${timeline.elapsedDays} ${timeline.elapsedDays === 1 ? 'day' : 'days'}`}</strong><small>{timeline.distinctDateCount > 1 ? 'Across distinct recorded dates' : 'Same recorded date; not a long-term interval'}</small></div>
            </div>

            <p className="assessment-summary overall-timeline-wording">
              {timeline.observationCount < 2
                ? 'Only one eligible observation is recorded. A change over time cannot yet be calculated.'
                : timeline.distinctDateCount < 2
                  ? timeline.overallChangePp === null
                    ? 'Multiple observations share one recorded date, but one or more endpoint probabilities are unavailable; an overall difference cannot be calculated.'
                    : `The recorded observations share one date. The earliest-to-latest model-output difference is ${formatPercentagePointChange(timeline.overallChangePp)} over 0 days; this is a same-day output difference, not a long-term trend.`
                  : timeline.overallChangePp === null
                    ? 'The earliest-to-latest model-output difference is unavailable because an endpoint AMD probability is missing or invalid.'
                    : `The model's AMD prediction probability ${timeline.overallDirection} from ${formatProbability(timeline.first.probability)} to ${formatProbability(timeline.latest.probability)}, a change of ${Math.abs(timeline.overallChangePp).toFixed(2)} percentage points across ${timeline.elapsedDays} ${timeline.elapsedDays === 1 ? 'day' : 'days'}. This describes stored model outputs and does not independently establish AMD progression, retinal improvement, disease severity, or treatment response.`}
            </p>

            {timeline.excludedUndatedCount > 0 && (
              <p className="info-box assessment-warning">
                {timeline.excludedUndatedCount} {eye}-eye scan(s) with missing or invalid recorded dates are excluded from chronological graph and summary calculations.
              </p>
            )}
            {hasVersionDifferences && (
              <p className="info-box assessment-warning">
                Model versions differ or are missing among consecutive observations. The chart uses separate series for reported versions; table differences across unknown or different versions are marked potentially non-comparable.
              </p>
            )}
            {modelSummaryWarning && (
              <p className="info-box assessment-warning">
                The earliest and latest observations have different or missing model-version metadata. Their endpoint arithmetic difference is shown for reference and may not be directly comparable.
              </p>
            )}
            {timeline.rows.some((row) => row.probability === null) && (
              <p className="info-box assessment-warning">
                One or more observations have missing or invalid AMD probabilities. They remain in the history table but are not plotted as numeric points.
              </p>
            )}
            {timeline.distinctDateCount < 2 && timeline.observationCount > 1 && (
              <p className="info-box assessment-warning">
                Multiple observations have the same recorded date. Their markers and rows are retained separately; no distinct-day interval can be inferred.
              </p>
            )}

            <div className="overall-timeline-chart-section">
              <div><h3>Full-history AMD model probability</h3><p>{timeline.observationCount === 1 ? 'One saved point is shown; a trend cannot yet be established.' : 'All eligible dated observations are plotted in chronological order; model versions are visually separated.'}</p></div>
              {hasProbabilityPoints ? (
                <div className="overall-timeline-chart" role="img" aria-label={`AMD model probability for all ${timeline.observationCount} eligible ${eye}-eye observations`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeline.chartData} margin={{ top: 12, right: 24, left: 6, bottom: 22 }}>
                      <CartesianGrid stroke="#e9eef5" strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="axisTimestamp"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={formatTimelineAxisDate}
                        tick={{ fill: '#8290a2', fontSize: 10 }}
                        minTickGap={22}
                        label={{ value: 'Recorded scan date (time is not stored)', position: 'insideBottom', offset: -12, fill: '#8290a2', fontSize: 10 }}
                      />
                      <YAxis domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} tick={{ fill: '#8290a2', fontSize: 10 }} width={48} />
                      <Tooltip content={<OverallTimelineTooltip />} />
                      {timeline.groups.map((group, index) => (
                        <Line
                          key={group.key}
                          type="linear"
                          dataKey={group.key}
                          name={group.modelVersion || 'Model version unavailable (isolated)'}
                          stroke={timelineSeriesColor(index)}
                          strokeDasharray={group.isolated ? '3 3' : undefined}
                          strokeWidth={2}
                          dot={<OverallTimelineDot color={timelineSeriesColor(index)} />}
                          activeDot={{ r: 7 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="empty-state">No valid saved AMD probabilities can be plotted; observations remain listed below.</p>}
              <div className="longitudinal-chart-key">
                {timeline.groups.map((group, index) => (
                  <span key={group.key}><i style={{ backgroundColor: timelineSeriesColor(index) }} />{group.modelVersion || 'Model version unavailable (isolated)'}</span>
                ))}
              </div>
              <p className="same-date-marker-note">Markers from observations sharing a date are offset slightly horizontally only to make individual points visible; their recorded dates are unchanged. Exact scan identifiers and probabilities are in the tooltip and table.</p>
            </div>

            <div className="longitudinal-subsection">
              <h3>Complete chronological observation history</h3>
              <p>Scan date is stored as a calendar date only. Where available, the server upload timestamp is shown separately and is not an acquisition time.</p>
              <div className="observation-table-wrap">
                <table className="observation-table overall-timeline-table">
                  <thead><tr><th>#</th><th>Scan ID</th><th>Date / time</th><th>Eye</th><th>Prediction</th><th>AMD probability</th><th>Change from preceding</th><th>Model version</th><th>Scan</th></tr></thead>
                  <tbody>
                    {timeline.rows.map((row) => (
                      <tr key={`${row.scanId}-${row.observationNumber}`}>
                        <td>{row.observationNumber}</td>
                        <td>{row.scanId}</td>
                        <td>{row.date}<small>Scan time not stored{row.uploadTimestamp ? ` · Uploaded ${formatDate(row.uploadTimestamp)}` : ''}</small></td>
                        <td>{row.eye}</td>
                        <td>{row.prediction}</td>
                        <td>{formatProbability(row.probability)}<small>Stored value: {row.probability ?? 'Not available'}</small></td>
                        <td>
                          {row.observationNumber === 1
                            ? '—'
                            : row.changePp === null
                              ? 'Not available'
                              : `${formatPercentagePointChange(row.changePp)}${row.changeComparable ? '' : ' · potentially non-comparable'}`}
                        </td>
                        <td>{row.modelVersion || 'Not available'}</td>
                        <td><button type="button" className="timeline-view-action" onClick={() => onSelectSavedScan(row.scan, patientId, scans)} disabled={historyBusy || row.scan.image_available === false}>Inspect scan</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      <p className="assessment-disclaimer">This timeline summarizes recorded classifier outputs only. Probability differences do not represent a percentage of disease progression and do not independently establish AMD progression, retinal improvement, disease severity, or treatment response.</p>
    </section>
  )
}

function timelineSeriesColor(index) {
  const colors = ['#5875ba', '#24a58d', '#c18045', '#8b68b1', '#d16b77', '#4d8c9a']
  return colors[index % colors.length]
}

function formatTimelineAxisDate(value) {
  return Number.isFinite(value) ? new Date(value).toISOString().slice(0, 10) : ''
}

function OverallTimelineDot({ cx, cy, payload, color }) {
  const count = payload?.sameDateCount || 1
  const ordinal = payload?.sameDateOrdinal || 0
  const offset = (ordinal - (count - 1) / 2) * Math.min(6, 24 / count)
  return <circle cx={cx + offset} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />
}

function OverallTimelineTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload.map((entry) => entry.payload).find((candidate) => candidate?.scanId)
  if (!point) return null
  return (
    <div className="longitudinal-tooltip">
      <strong>{point.date} · Scan time not recorded</strong>
      <span>AMD probability: {formatProbability(point.probability)} (stored value: {point.probability ?? 'Not available'})</span>
      <span>Prediction: {point.prediction}</span>
      <span>Scan ID: {point.scanId}</span>
      <span>Eye: {point.eye}</span>
      <span>Model version: {point.modelVersion || 'Not available'}</span>
    </div>
  )
}

function LongitudinalTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="longitudinal-tooltip">
      <strong>{point.date}</strong>
      <span>Scan ID: {point.scanId}</span>
      <span>Eye: {point.eye === 'unknown' ? 'Not available' : point.eye}</span>
      <span>Saved class: {point.prediction || 'Not available'}</span>
      <span>AMD probability: {formatProbability(point.amdProbability)}</span>
      <span>Model: {point.modelVersion || 'Not available'}</span>
    </div>
  )
}

function formatPercentagePointChange(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not available'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} percentage points`
}

function SummaryCard({ label, value, note, icon }) {
  return <article className="overview-card"><div className="metric-icon icon-blue">{icon}</div><p>{label}</p><strong>{value}</strong><span className="metric-badge badge-blue">{note}</span></article>
}

function SavedScanSummary({ scan }) {
  return (
    <div className="prediction-result saved-scan-result">
      <div className="result-symbol"><ScanLine size={22} /></div>
      <div className="result-copy">
        <span>Backend-confirmed saved visit</span>
        <strong>{scan.prediction}</strong>
        <div className="probability-comparison">
          {[
            { label: 'AMD', value: scan.class_probabilities?.AMD },
            { label: 'Non-AMD', value: scan.class_probabilities?.['Non-AMD'] },
          ].map(({ label, value }) => (
            <div className="probability-item" key={label}>
              <div className="probability-label"><span>{label}</span><b>{formatProbability(value)}</b></div>
              <div className="probability-track" role="progressbar" aria-label={`${label} model-generated probability`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={probabilityWidth(value)}>
                <div className={`probability-fill probability-fill-${label.toLowerCase()}`} style={{ width: `${probabilityWidth(value)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <small className="probability-note">These are model-generated probabilities, not a confirmed diagnosis or calibrated clinical risk.</small>
        <small>Scan ID: {scan.scan_id}</small>
        <small>Scan date: {formatDate(scan.scan_date)} · Uploaded: {formatDate(scan.uploaded_at)}</small>
      </div>
    </div>
  )
}

function PanelHeader({ eyebrow, title, action }) {
  return <div className="panel-header"><div><span className="eyebrow-small">{eyebrow}</span><h2>{title}</h2></div>{action && <span className="panel-action">{action}</span>}</div>
}

function BackendStatus({ status }) {
  const label = status === 'ready' ? 'Model ready' : status === 'model-unavailable' ? 'Model unavailable' : status === 'offline' ? 'Backend unavailable' : 'Checking backend'
  return <span className={`live-dot backend-status-${status}`}><i />{label}</span>
}

function formatProbability(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'Not available'
}

function probabilityWidth(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value * 100))
}

function EyeMark() {
  return <svg viewBox="0 0 44 28" aria-hidden="true"><path d="M2 14S10 2 22 2s20 12 20 12-8 12-20 12S2 14 2 14Z" fill="none" stroke="currentColor" strokeWidth="2.2" /><circle cx="22" cy="14" r="6" fill="none" stroke="currentColor" strokeWidth="2.2" /><circle cx="22" cy="14" r="2.5" fill="currentColor" /></svg>
}

export default App
