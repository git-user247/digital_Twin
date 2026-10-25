import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  CloudUpload,
  Eye,
  EyeOff,
  FileImage,
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
  const [doctorIdInput, setDoctorIdInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [patients, setPatients] = useState([])
  const [patientsBusy, setPatientsBusy] = useState(false)
  const [patientsError, setPatientsError] = useState('')
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
  const filteredPatients = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    if (!normalizedSearch) return patients
    return patients.filter((record) => record.patient_id.toLowerCase().includes(normalizedSearch))
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
    setPatients([])
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
        setCurrentView('dashboard')
        try {
          const directoryResponse = await protectedFetch(`${API_BASE}/patients`, {}, authToken)
          const directory = await readResponse(directoryResponse, 'Unable to load the patient directory.')
          setPatients(Array.isArray(directory.patients) ? directory.patients : [])
        } catch (requestError) {
          if (mounted) setPatientsError(requestError.message || 'Unable to load the patient directory.')
        }

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
          if (mounted) setScans(Array.isArray(historyPayload.scans) ? historyPayload.scans : [])
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

  const loadPatientScans = async (id, token = authToken) => {
    setHistoryBusy(true)
    setHistoryError('')
    try {
      const response = await protectedFetch(`${API_BASE}/patients/${encodeURIComponent(id)}/scans`, {}, token)
      const payload = await readResponse(response, 'Unable to load this patient’s scan history.')
      setScans(Array.isArray(payload.scans) ? payload.scans : [])
    } catch (requestError) {
      setScans([])
      setHistoryError(requestError.message || 'Unable to load this patient’s scan history.')
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
    setProfileError('')
    setProfileMessage('')
    setPatient(null)
    setScans([])
    setSavedScan(null)
    setSavedImageUrl('')
    setSavedImageError('')
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
      await loadPatientScans(payload.patient.patient_id)
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
      await loadPatients()
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
      const response = await protectedFetch(`${API_BASE}/patients/${encodeURIComponent(patientId.trim())}/scans`, {
        method: 'POST',
        body: formData,
      })
      const payload = await readResponse(response, 'Unable to analyze and save the scan.')
      if (!payload.scan?.scan_id || !payload.scan?.prediction || !payload.scan?.class_probabilities) {
        throw new Error('The backend returned an incomplete saved-scan response.')
      }
      setSavedScan(payload.scan)
      await loadSavedImage(payload.scan)
      await loadPatientScans(patientId.trim())
      await loadPatients()

      const explanationForm = new FormData()
      explanationForm.append('file', selectedFile)
      try {
        const explanationResponse = await protectedFetch(`${API_BASE}/gradcam`, {
          method: 'POST',
          body: explanationForm,
        })
        const explanation = await readResponse(explanationResponse, 'Grad-CAM is unavailable for this scan.')
        if (explanation.gradcam_base64) {
          setGradcamDataUrl(`data:image/png;base64,${explanation.gradcam_base64}`)
        } else {
          setGradcamError('Grad-CAM response did not include an image.')
        }
      } catch (explanationError) {
        setGradcamError(explanationError.message || 'Grad-CAM is unavailable for this scan.')
      }
    } catch (requestError) {
      setError(requestError.message || 'The backend could not process and save this scan.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const clearImage = () => {
    setSelectedFile(null)
    setPreviewUrl('')
    setSavedScan(null)
    setSavedImageUrl('')
    setGradcamDataUrl('')
    setGradcamError('')
    setError('')
  }

  const loadSavedImage = async (scan, token = authToken) => {
    setSavedImageUrl('')
    setSavedImageError('')
    try {
      const response = await protectedFetch(`${API_BASE}${scan.image_url}`, {}, token)
      const imageUrl = URL.createObjectURL(await response.blob())
      setSavedImageUrl(imageUrl)
    } catch (requestError) {
      setSavedImageError(requestError.message || 'Unable to retrieve this saved image from the backend.')
    }
  }

  const selectSavedScan = async (scan) => {
    setSavedScan(scan)
    setSavedImageError('')
    setSavedImageUrl('')
    setGradcamDataUrl('')
    setGradcamError('')
    await loadSavedImage(scan)
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
              patients={patients}
              isLoading={patientsBusy}
              error={patientsError}
              modelInfo={modelInfo}
              onRetry={loadPatients}
              onOpenDirectory={() => setCurrentView('directory')}
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
              savedImageError={savedImageError}
              gradcamDataUrl={gradcamDataUrl}
              gradcamError={gradcamError}
              isAnalyzing={isAnalyzing}
              error={error}
              onBack={returnToDirectory}
              onEyeSideChange={setEyeSide}
              onScanDateChange={setScanDate}
              onVisitNotesChange={setVisitNotes}
              onDrop={handleDrop}
              onFileChange={(event) => handleFile(event.target.files?.[0])}
              onClearImage={clearImage}
              onAnalyze={analyzeAndSaveScan}
              onSelectSavedScan={selectSavedScan}
              savedImageUrl={savedImageUrl}
              onSavedImageError={() => setSavedImageError('Unable to retrieve this saved image from the backend.')}
            />
          )}
        </div>
      </main>
    </div>
  )
}

function DoctorDashboard({ patients, isLoading, error, modelInfo, onRetry, onOpenDirectory, onOpenPatient }) {
  const totalScans = patients.reduce((total, patient) => total + patient.scan_count, 0)
  const recentActivity = patients
    .filter((patient) => patient.latest_scan)
    .sort((first, second) => new Date(second.latest_scan.uploaded_at) - new Date(first.latest_scan.uploaded_at))
    .slice(0, 5)

  return (
    <>
      <section className="doctor-page-heading">
        <div>
          <p className="eyebrow">Clinical workflow demonstration</p>
          <h1>Doctor dashboard</h1>
          <p className="hero-copy">Review registered local demo patients and their latest saved OCT activity. This prototype does not provide clinical risk or progression estimates.</p>
        </div>
        <button type="button" className="primary-action" onClick={onOpenDirectory}><Users size={17} /> Open patient directory</button>
      </section>

      <section className="overview-grid doctor-overview-grid" aria-label="Live local record summary">
        <SummaryCard label="Registered patients" value={isLoading ? '…' : error ? '—' : String(patients.length)} note="Read from local patient storage" icon={<Users size={19} />} />
        <SummaryCard label="Saved OCT scans" value={isLoading ? '…' : error ? '—' : String(totalScans)} note="Stored scan records" icon={<ScanLine size={19} />} />
        <SummaryCard label="Model status" value={modelInfo?.ready ? 'Ready' : 'Unavailable'} note={modelInfo?.model?.architecture || 'Backend status'} icon={<Microscope size={19} />} />
      </section>

      {error && <div className="error-box directory-error" role="alert">{error}<button type="button" onClick={onRetry}>Retry</button></div>}
      {isLoading && <p className="empty-state">Loading patient and recent activity from the backend…</p>}
      {!isLoading && !error && patients.length === 0 && (
        <div className="panel directory-empty-panel">
          <h2>No registered patients yet</h2>
          <p className="empty-state">Create a patient profile in the directory to begin a local demonstration.</p>
          <button type="button" className="primary-action" onClick={onOpenDirectory}>Go to patient directory</button>
        </div>
      )}

      {!isLoading && !error && patients.length > 0 && (
        <section className="panel recent-activity-panel">
          <div className="panel-header">
            <div><span className="eyebrow-small">From saved scan records</span><h2>Recent activity</h2></div>
            <button type="button" className="text-action" onClick={onOpenDirectory}>View all patients<ChevronRight size={15} /></button>
          </div>
          {recentActivity.length === 0 ? <p className="empty-state">No saved scan activity is available yet.</p> : (
            <div className="recent-activity-list">
              {recentActivity.map(({ patient_id: id, latest_scan: scan }) => (
                <button type="button" className="recent-activity-item" key={id} onClick={() => onOpenPatient(id)}>
                  <span className="activity-icon"><ScanLine size={17} /></span>
                  <span className="activity-copy">
                    <strong>{id} <i>· {scan.eye_side} eye · {scan.prediction}</i></strong>
                    <small>Uploaded {formatDate(scan.uploaded_at)}{scan.scan_date ? ` · Scan date ${formatDate(scan.scan_date)}` : ' · Scan date not provided'}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          )}
          <p className="data-caveat">Recent activity uses saved upload timestamps; an upload time is not a scan acquisition date.</p>
        </section>
      )}
    </>
  )
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
}) {
  if (profileBusy && !patient) return <p className="empty-state">Loading patient workspace…</p>
  if (!patient) return (
    <div className="panel directory-empty-panel">
      <div className="error-box" role="alert">{profileError || 'No patient is selected.'}</div>
      <button type="button" className="primary-action" onClick={onBack}>Return to patient directory</button>
    </div>
  )

  const latestScan = scans.length ? scans[scans.length - 1] : null

  return (
    <>
      <section className="workspace-heading">
        <button type="button" className="text-action back-action" onClick={onBack}><ArrowLeft size={16} /> Patient directory</button>
        <div className="workspace-title-row">
          <div><p className="eyebrow">Individual patient workspace</p><h1>{patient.patient_id}</h1><p className="hero-copy">Profile created {formatDate(patient.created_at)} · {scans.length} saved {scans.length === 1 ? 'scan' : 'scans'}</p></div>
          <button type="button" className="primary-action" onClick={() => document.getElementById('scan-upload')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><Upload size={16} /> Upload OCT scan</button>
        </div>
      </section>

      {profileMessage && <div className="success-box directory-error" role="status">{profileMessage}</div>}
      {profileError && <div className="error-box directory-error" role="alert">{profileError}</div>}

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
            {gradcamError && <div className="info-box">{gradcamError}</div>}
            {gradcamDataUrl && <div className="gradcam-panel"><img src={gradcamDataUrl} alt="Grad-CAM visualization for the saved scan" /><div className="gradcam-caption">Grad-CAM is an explanation aid only; it does not establish disease location.</div></div>}
          </div>

          <section className="section-anchor workspace-results">
            <div className="section-heading"><div><p className="eyebrow">Current saved visit</p><h2>Model output</h2></div><span className="section-note"><Sparkles size={15} /> No clinical risk estimate</span></div>
            {savedScan ? <div className="model-output-grid">
              <SummaryCard label="Prediction" value={savedScan.prediction} note={`Eye: ${savedScan.eye_side}`} icon={<ScanLine size={19} />} />
              <SummaryCard label="AMD probability" value={formatProbability(savedScan.amd_probability)} note="Classifier output; not calibrated clinical risk" icon={<Sparkles size={19} />} />
              <SummaryCard label="Non-AMD probability" value={formatProbability(savedScan.class_probabilities?.['Non-AMD'])} note="Returned by the model endpoint" icon={<ShieldCheck size={19} />} />
              <SummaryCard label="Model version" value={savedScan.model_version || 'Not reported'} note={`Scan ID ${savedScan.scan_id}`} icon={<Microscope size={19} />} />
            </div> : <p className="empty-state">Select a saved scan below or upload an OCT image to display model output.</p>}
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
            {historyBusy ? <p className="empty-state">Loading saved scan history…</p>
              : historyError ? <div className="error-box" role="alert">{historyError}</div>
                : scans.length === 0 ? <p className="empty-state">No saved scans for this patient yet.</p>
                  : <div className="scan-history-list">
                    {scans.map((scan) => (
                      <article className={`scan-history-item ${savedScan?.scan_id === scan.scan_id ? 'scan-history-item-active' : ''}`} key={scan.scan_id}>
                        <div className="scan-history-summary">
                          <div><strong>{scan.prediction} <span>· {scan.eye_side} eye</span></strong><small>Scan date: {formatDate(scan.scan_date)} · Uploaded: {formatDate(scan.uploaded_at)}</small><small>AMD probability: {formatProbability(scan.amd_probability)}</small></div>
                          <button type="button" onClick={() => onSelectSavedScan(scan)} disabled={!scan.image_available}>{scan.image_available ? 'View scan' : 'Image unavailable'}</button>
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
