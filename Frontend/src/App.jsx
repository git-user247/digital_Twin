import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  CloudUpload,
  FileImage,
  LayoutDashboard,
  Menu,
  Microscope,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  X,
} from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const SELECTED_PATIENT_KEY = 'ocutwin.selectedPatientId'
const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Image analysis', icon: ScanLine },
  { label: 'Digital twin', icon: UserRound },
  { label: 'Health monitoring', icon: CalendarDays },
  { label: 'AI insights', icon: Sparkles },
  { label: 'Project details', icon: Microscope },
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
  const [activeSection, setActiveSection] = useState('Dashboard')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
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
  const [savedImageError, setSavedImageError] = useState('')
  const [gradcamDataUrl, setGradcamDataUrl] = useState('')
  const [gradcamError, setGradcamError] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [modelInfo, setModelInfo] = useState(null)
  const [backendStatus, setBackendStatus] = useState('checking')

  const activeNav = useMemo(() => navItems.find((item) => item.label === activeSection), [activeSection])
  const loadedPatientId = patient?.patient_id || ''
  const patientIsLoaded = Boolean(patient && patientId.trim() === loadedPatientId)

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
    let mounted = true
    let storedPatientId
    try {
      storedPatientId = window.localStorage.getItem(SELECTED_PATIENT_KEY)?.trim()
    } catch {
      setProfileError('This browser could not restore the selected patient from local storage.')
      return () => { mounted = false }
    }

    if (!storedPatientId) return () => { mounted = false }

    setPatientId(storedPatientId)
    setProfileBusy(true)
    fetch(`${API_BASE}/patients/${encodeURIComponent(storedPatientId)}`)
      .then((response) => readResponse(response, 'Unable to restore the selected patient profile.'))
      .then(async (payload) => {
        if (!mounted) return
        setPatient(payload.patient)
        setPatientId(payload.patient.patient_id)
        setProfileMessage('Patient profile restored from local storage.')
        await loadPatientScans(payload.patient.patient_id)
      })
      .catch((requestError) => {
        if (!mounted) return
        setPatient(null)
        setScans([])
        setProfileError(requestError.message || 'Unable to restore the selected patient profile.')
      })
      .finally(() => {
        if (mounted) setProfileBusy(false)
      })

    return () => { mounted = false }
  }, [])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const loadPatientScans = async (id) => {
    setHistoryBusy(true)
    setHistoryError('')
    try {
      const response = await fetch(`${API_BASE}/patients/${encodeURIComponent(id)}/scans`)
      const payload = await readResponse(response, 'Unable to load this patient’s scan history.')
      setScans(Array.isArray(payload.scans) ? payload.scans : [])
    } catch (requestError) {
      setScans([])
      setHistoryError(requestError.message || 'Unable to load this patient’s scan history.')
    } finally {
      setHistoryBusy(false)
    }
  }

  const loadPatient = async () => {
    const id = patientId.trim()
    if (!id) {
      setProfileError('Enter a patient ID before loading a profile.')
      setProfileMessage('')
      return
    }
    setProfileBusy(true)
    setProfileError('')
    setProfileMessage('')
    setPatient(null)
    setScans([])
    setSavedScan(null)
    try {
      const response = await fetch(`${API_BASE}/patients/${encodeURIComponent(id)}`)
      const payload = await readResponse(response, 'Unable to load the patient profile.')
      setPatient(payload.patient)
      setPatientId(payload.patient.patient_id)
      let remembered = true
      try {
        window.localStorage.setItem(SELECTED_PATIENT_KEY, payload.patient.patient_id)
      } catch {
        remembered = false
      }
      setProfileMessage(remembered
        ? 'Patient profile loaded and will be restored after refresh.'
        : 'Patient profile loaded, but this browser could not remember it for refresh.')
      await loadPatientScans(payload.patient.patient_id)
    } catch (requestError) {
      setProfileError(requestError.message || 'Unable to load the patient profile.')
    } finally {
      setProfileBusy(false)
    }
  }

  const createPatient = async () => {
    const id = patientId.trim()
    if (!id) {
      setProfileError('Enter a unique patient ID before creating a profile.')
      setProfileMessage('')
      return
    }
    setProfileBusy(true)
    setProfileError('')
    setProfileMessage('')
    try {
      const response = await fetch(`${API_BASE}/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: id }),
      })
      const payload = await readResponse(response, 'Unable to create the patient profile.')
      setPatient(payload.patient)
      setPatientId(payload.patient.patient_id)
      setScans([])
      setSavedScan(null)
      let remembered = true
      try {
        window.localStorage.setItem(SELECTED_PATIENT_KEY, payload.patient.patient_id)
      } catch {
        remembered = false
      }
      setProfileMessage(remembered
        ? 'Patient profile created and will be restored after refresh.'
        : 'Patient profile created, but this browser could not remember it for refresh.')
    } catch (requestError) {
      setPatient(null)
      setProfileError(requestError.message || 'Unable to create the patient profile.')
    } finally {
      setProfileBusy(false)
    }
  }

  const handlePatientIdChange = (event) => {
    const nextId = event.target.value
    setPatientId(nextId)
    if (nextId.trim() !== loadedPatientId) {
      setPatient(null)
      setScans([])
      setSavedScan(null)
      setProfileMessage('')
      setHistoryError('')
    }
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
    setGradcamDataUrl('')
    setGradcamError('')
  }

  const handleDrop = (event) => {
    event.preventDefault()
    handleFile(event.dataTransfer.files?.[0])
  }

  const analyzeAndSaveScan = async () => {
    if (!patientId.trim()) {
      setError('Enter a patient ID and load or create the profile before saving a scan.')
      return
    }
    if (!patientIsLoaded) {
      setError('Load or create this patient profile before saving a scan.')
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
      const response = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId.trim())}/scans`, {
        method: 'POST',
        body: formData,
      })
      const payload = await readResponse(response, 'Unable to analyze and save the scan.')
      if (!payload.scan?.scan_id || !payload.scan?.prediction || !payload.scan?.class_probabilities) {
        throw new Error('The backend returned an incomplete saved-scan response.')
      }
      setSavedScan(payload.scan)
      await loadPatientScans(patientId.trim())

      const explanationForm = new FormData()
      explanationForm.append('file', selectedFile)
      try {
        const explanationResponse = await fetch(`${API_BASE}/gradcam`, {
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
    setGradcamDataUrl('')
    setGradcamError('')
    setError('')
  }

  const selectSavedScan = (scan) => {
    setSavedScan(scan)
    setSavedImageError('')
    setGradcamDataUrl('')
    setGradcamError('')
  }

  const scrollTo = (label) => {
    setActiveSection(label)
    setIsSidebarOpen(false)
    const id = label.toLowerCase().replaceAll(' ', '-')
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const latestScan = scans.length ? scans[scans.length - 1] : null

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isSidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><EyeMark /></div>
          <div><p className="brand-name">OcuTwin</p><p className="brand-caption">Eye health intelligence</p></div>
          <button className="mobile-close" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="sidebar-label">Workspace</div>
        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${activeSection === label ? 'nav-item-active' : ''}`} onClick={() => scrollTo(label)}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {activeSection === label && <ChevronRight className="nav-chevron" size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><CircleHelp size={17} /><div><strong>Local research prototype</strong><span>No authentication or authorization</span></div></div>
          <div className="profile-row"><div className="avatar">RT</div><div><strong>Research tool</strong><span>Not for identifiable clinical data</span></div></div>
        </div>
      </aside>

      {isSidebarOpen && <button className="sidebar-scrim" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation overlay" />}

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setIsSidebarOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{activeNav?.label || 'Dashboard'}</strong></div>
          <div className="topbar-actions">
            <span className="live-dot"><i /> {backendStatus === 'ready' ? 'Model ready' : backendStatus === 'model-unavailable' ? 'Model unavailable' : backendStatus === 'offline' ? 'Backend unavailable' : 'Checking backend'}</span>
          </div>
        </header>

        <div className="page-wrap">
          <section id="dashboard" className="hero-section section-anchor">
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> Patient-specific OCT observations</p>
              <h1>See the signal<br /><em>behind the scan.</em></h1>
              <p className="hero-copy">Save model-backed OCT observations to a local patient record. Scan history shows recorded visits only; no progression score or clinical risk estimate is generated.</p>
            </div>
            <div className="hero-meta">
              <div className="hero-status"><span className="status-check"><Check size={13} /></span><span><b>{patientIsLoaded ? 'Profile loaded' : 'No profile selected'}</b><small>{loadedPatientId || 'Load or create a patient profile'}</small></span></div>
              <div className="hero-id">LOCAL / RESEARCH<span>Model: {modelInfo?.model?.architecture || 'status unavailable'}</span></div>
            </div>
          </section>

          <section className="overview-grid" aria-label="Selected patient record summary">
            <SummaryCard label="Patient profile" value={patientIsLoaded ? loadedPatientId : 'None loaded'} note={patientIsLoaded ? 'Backend profile confirmed' : 'No patient selected'} icon={<UserRound size={19} />} />
            <SummaryCard label="Saved visits" value={patientIsLoaded ? String(scans.length) : '—'} note={historyBusy ? 'Loading history…' : patientIsLoaded ? 'Stored scan records' : 'Load a profile to view'} icon={<CalendarDays size={19} />} />
            <SummaryCard label="Latest saved result" value={latestScan?.prediction || '—'} note={latestScan ? `AMD probability ${formatProbability(latestScan.amd_probability)}` : 'No scan result available'} icon={<ScanLine size={19} />} />
            <SummaryCard label="Latest upload" value={latestScan ? formatDate(latestScan.uploaded_at) : '—'} note={latestScan?.scan_date ? `Scan date ${latestScan.scan_date}` : 'No saved scan date'} icon={<FileImage size={19} />} />
          </section>

          <section id="image-analysis" className="content-grid section-anchor">
            <div className="panel upload-panel">
              <PanelHeader eyebrow="OCT imaging" title="Analyze and save scan" action="Persistent visit" />
              <div className="visit-fields">
                <label>Eye side
                  <select value={eyeSide} onChange={(event) => setEyeSide(event.target.value)}>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label>Scan date <span className="optional-label">(optional)</span>
                  <input type="date" value={scanDate} onChange={(event) => setScanDate(event.target.value)} />
                </label>
                <label className="visit-notes-field">Visit notes <span className="optional-label">(optional)</span>
                  <textarea maxLength={2000} rows={2} value={visitNotes} onChange={(event) => setVisitNotes(event.target.value)} placeholder="Non-identifying notes for this scan" />
                </label>
              </div>

              <div className="upload-zone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
                {previewUrl ? (
                  <div className="image-preview-wrap"><img src={previewUrl} alt="Selected OCT scan preview" /><button className="remove-image" onClick={clearImage} aria-label="Remove image"><X size={14} /></button></div>
                ) : (
                  <>
                    <div className="upload-icon"><CloudUpload size={22} /></div>
                    <strong>Drop an OCT image here</strong><span>or browse from your device</span>
                    <label className="browse-button"><Upload size={15} /> Choose image<input type="file" accept="image/jpeg,image/png" onChange={(event) => handleFile(event.target.files?.[0])} /></label>
                    <small>JPEG or PNG · up to 20 MB</small>
                  </>
                )}
              </div>

              {previewUrl && (
                <div className="selected-file">
                  <div><FileImage size={16} /><div><b>{selectedFile?.name}</b><span>{patientIsLoaded ? 'Ready to analyze and persist' : 'Load or create a patient profile first'}</span></div></div>
                  <button onClick={analyzeAndSaveScan} className="analyze-button" disabled={isAnalyzing || !patientIsLoaded}>
                    {isAnalyzing ? 'Analyzing and saving…' : 'Analyze / Save'}<ArrowUpRight size={16} />
                  </button>
                </div>
              )}
              {error && <div className="error-box" role="alert">{error}</div>}
              {savedScan && <SavedScanSummary scan={savedScan} />}
              {gradcamError && <div className="info-box">{gradcamError}</div>}
              {gradcamDataUrl && <div className="gradcam-panel"><img src={gradcamDataUrl} alt="Grad-CAM visualization for the saved scan" /><div className="gradcam-caption">Grad-CAM is an explanation aid only; it does not establish disease location.</div></div>}
            </div>

            <div className="panel twin-panel" id="digital-twin">
              <PanelHeader eyebrow="Persistent patient record" title="Patient profile" action="Local prototype" />
              <div className="patient-form patient-profile-form">
                <label htmlFor="patient-id">Patient ID</label>
                <input id="patient-id" type="text" value={patientId} onChange={handlePatientIdChange} maxLength={64} placeholder="Enter a unique ID" />
                <div className="profile-actions">
                  <button type="button" onClick={loadPatient} disabled={profileBusy}>{profileBusy ? 'Loading…' : 'Load profile'}</button>
                  <button type="button" onClick={createPatient} disabled={profileBusy}>{profileBusy ? 'Please wait…' : 'Create profile'}</button>
                </div>
              </div>
              {profileError && <div className="error-box" role="alert">{profileError}</div>}
              {profileMessage && <div className="success-box" role="status">{profileMessage}</div>}
              <div className="patient-profile-summary">
                <span className="profile-icon"><UserRound size={20} /></span>
                <div><small>Loaded backend profile</small><strong>{patientIsLoaded ? patient.patient_id : 'No patient profile loaded'}</strong><span>{patientIsLoaded ? `Created ${formatDate(patient.created_at)}` : 'Create a new profile or load an existing ID.'}</span></div>
              </div>
              <p className="prototype-warning">Do not enter identifiable clinical information. This local prototype has no authentication or authorization.</p>
            </div>
          </section>

          <section id="health-monitoring" className="content-grid section-anchor">
            <div className="panel history-panel">
              <PanelHeader eyebrow="Backend scan records" title="Saved scan history" action={patientIsLoaded ? `${scans.length} visits` : 'No patient'} />
              {!patientIsLoaded ? <p className="empty-state">Load or create a patient profile to view its saved scans.</p>
                : historyBusy ? <p className="empty-state">Loading saved scan history…</p>
                  : historyError ? <div className="error-box" role="alert">{historyError}</div>
                    : scans.length === 0 ? <p className="empty-state">No saved scans for this patient yet.</p>
                      : <div className="scan-history-list">
                        {scans.map((scan) => (
                          <article className={`scan-history-item ${savedScan?.scan_id === scan.scan_id ? 'scan-history-item-active' : ''}`} key={scan.scan_id}>
                            <div className="scan-history-summary">
                              <div><strong>{scan.prediction} <span>· {scan.eye_side} eye</span></strong><small>Scan date: {formatDate(scan.scan_date)} · Uploaded: {formatDate(scan.uploaded_at)}</small><small>AMD probability: {formatProbability(scan.amd_probability)}</small></div>
                              <button type="button" onClick={() => selectSavedScan(scan)} disabled={!scan.image_available}>{scan.image_available ? 'View scan' : 'Image unavailable'}</button>
                            </div>
                          </article>
                        ))}
                      </div>}
              {savedScan && (
                <div className="saved-scan-view">
                  <h3>Saved OCT image</h3>
                  {savedScan.image_available === false || savedImageError ? <p className="empty-state">{savedImageError || 'The backend reports that this scan image is unavailable.'}</p>
                    : <img src={`${API_BASE}${savedScan.image_url}`} alt={`Saved OCT scan ${savedScan.scan_id}`} onError={() => setSavedImageError('Unable to retrieve this saved image from the backend.')} />}
                  <small>Scan ID: {savedScan.scan_id}</small>
                </div>
              )}
            </div>

            <div className="panel observation-panel">
              <PanelHeader eyebrow="Interpretation limits" title="What this system records" />
              <div className="observation-quote">Each saved visit is a single-image AMD classification—not a clinical risk score or a progression estimate.</div>
              <div className="observation-source"><div className="source-icon"><ShieldCheck size={18} /></div><div><b>Actual model outputs only</b><span>Probability values come from the saved classifier response.</span></div></div>
              <div className="observation-divider" />
              <div className="next-review"><div className="calendar-tile"><CalendarDays size={18} /></div><div><span>Longitudinal interpretation</span><strong>No visit-to-visit comparison is implemented</strong></div></div>
            </div>
          </section>

          <section id="ai-insights" className="section-anchor insights-section">
            <div className="section-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> Current saved visit</p><h2>Model output</h2></div><span className="section-note"><Sparkles size={15} /> No clinical risk estimate</span></div>
            {savedScan ? <div className="model-output-grid">
              <SummaryCard label="Prediction" value={savedScan.prediction} note={`Eye: ${savedScan.eye_side}`} icon={<ScanLine size={19} />} />
              <SummaryCard label="AMD probability" value={formatProbability(savedScan.amd_probability)} note="Classifier probability; not calibrated clinical risk" icon={<Sparkles size={19} />} />
              <SummaryCard label="Non-AMD probability" value={formatProbability(savedScan.class_probabilities?.['Non-AMD'])} note="Returned by the model endpoint" icon={<ShieldCheck size={19} />} />
              <SummaryCard label="Model version" value={savedScan.model_version || 'Not reported'} note={`Scan ID ${savedScan.scan_id}`} icon={<Microscope size={19} />} />
            </div> : <p className="empty-state">No current saved scan result. Analyze and save a scan to display the model’s response.</p>}
          </section>

          <section id="project-details" className="project-section section-anchor">
            <div className="project-intro">
              <p className="eyebrow"><span className="eyebrow-line" /> System context</p>
              <h2>Research prototype<br /><em>with explicit limits.</em></h2>
              <p>This local application connects persistent patient records to the existing binary OCT classifier. It has no user authentication and is not for clinical use or identifiable patient data.</p>
              <div className="project-status"><span className="status-pulse" /> {backendStatus === 'ready' ? 'Backend reports model ready' : backendStatus === 'model-unavailable' ? 'Backend is running, but model inference is unavailable' : backendStatus === 'offline' ? 'Backend unavailable' : 'Checking backend'}</div>
            </div>
            <div className="panel status-panel">
              <div className="status-panel-head"><div><span className="eyebrow-small">Model information</span><h3>{modelInfo?.model?.architecture || 'Model information unavailable'}</h3></div><span className="status-tag"><i /> {modelInfo?.ready ? 'Ready' : 'Unavailable'}</span></div>
              <div className="status-list">
                <div><span>Task</span><strong>{modelInfo?.model?.task || 'Not available'}</strong></div>
                <div><span>Input size</span><strong>{modelInfo?.model?.input_image_size?.join(' × ') || 'Not available'}</strong></div>
                <div><span>Classes</span><strong>{modelInfo?.model?.classes?.join(' / ') || 'Not available'}</strong></div>
                <div><span>Checkpoint</span><strong>{modelInfo?.checkpoint_exists ? 'Found' : 'Not confirmed'}</strong></div>
              </div>
              {modelInfo?.error && <div className="error-box" role="status">{modelInfo.error}</div>}
              <div className="quality-bar"><div><span>Clinical risk score</span><b>Not provided</b></div><p>Saved probabilities are classifier outputs and should not be interpreted as calibrated clinical risk.</p></div>
            </div>
          </section>
          <footer className="footer"><span>OcuTwin / AI-enabled eye health monitoring</span><span>Local academic prototype · no authentication</span></footer>
        </div>
      </main>
    </div>
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
        <strong>{scan.prediction} <i>· AMD probability {formatProbability(scan.amd_probability)}</i></strong>
        <small>Scan ID: {scan.scan_id}</small>
        <small>Scan date: {formatDate(scan.scan_date)} · Uploaded: {formatDate(scan.uploaded_at)}</small>
        <small>Non-AMD {formatProbability(scan.class_probabilities?.['Non-AMD'])} · AMD {formatProbability(scan.class_probabilities?.AMD)}</small>
      </div>
    </div>
  )
}

function formatProbability(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'Not available'
}

function PanelHeader({ eyebrow, title, action }) {
  return <div className="panel-header"><div><span className="eyebrow-small">{eyebrow}</span><h2>{title}</h2></div>{action && <span className="panel-action">{action}</span>}</div>
}

function EyeMark() {
  return <svg viewBox="0 0 44 28" aria-hidden="true"><path d="M2 14S10 2 22 2s20 12 20 12-8 12-20 12S2 14 2 14Z" fill="none" stroke="currentColor" strokeWidth="2.2" /><circle cx="22" cy="14" r="6" fill="none" stroke="currentColor" strokeWidth="2.2" /><circle cx="22" cy="14" r="2.5" fill="currentColor" /></svg>
}

export default App
