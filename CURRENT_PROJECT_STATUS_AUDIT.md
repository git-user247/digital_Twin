# AMD Digital Twin — Current Project Status Audit

**Audit date:** 2026-10-25
**Scope:** Read-only source/artifact review and non-persistent verification. No model training, test-split evaluation, source/data/checkpoint edits, or package installation were performed. The report is the only project file created by this audit.

## 1. Executive summary

The current project is a working **local AMD-vs-Non-AMD OCT classification and scan-recording prototype**. The FastAPI backend loads the existing EfficientNetB0 checkpoint; the React app communicates with it on the configured local origin, displays model probabilities, and can restore a patient and saved scan history after a browser refresh. A live prediction and Grad-CAM were also verified using an image confirmed in the training manifest.

It is **not yet a longitudinal digital twin**. It stores separate scan observations, but does not compare repeat scans, visualize within-patient change, or predict progression. OCTDL’s locally available metadata does not establish acquisition dates or distinct visits, so it cannot currently support defensible progression claims.

The main demonstration risks are local patient/test records already tracked under `data/patients/`, the lack of authentication, and CORS being restricted to port 5173. Use only de-identified demonstration records and keep the backend bound to loopback. A production-preview page on port 4173 was blocked by the current CORS allowlist; the application on port 5173 communicated successfully.

## 2. Features confirmed working

| Feature | Evidence and verification |
|---|---|
| Model loading and inference | `backend/model_service.py` loads `models/baseline_efficientnetb0_best.pth` with a strict state-dictionary load and shared deterministic preprocessing from `src/oct_preprocessing.py`. The running API reported model ready. `POST /predict` on `data/raw/OCTDL/AMD/amd_1047099_1.jpg` returned AMD probability **0.715859** and Non-AMD probability **0.284141**. The image was confirmed in `data/Processed/train.csv`; no held-out test image or metric was used. |
| Frontend ↔ backend communication | The page at `http://127.0.0.1:5173/` rendered with “Model ready”; the browser restored an existing profile and history from the API. CORS preflight for this configured origin succeeded. |
| Model output display and saved-image reopening | The active UI in `Frontend/src/App.jsx` showed the saved prediction, both class probabilities, model version, and original stored scan after selecting “View scan”. The rendered probability is explicitly described as not calibrated clinical risk. |
| Grad-CAM | Live `POST /gradcam` using the same training-split image returned a PNG (610,572 bytes; valid PNG signature). The UI and endpoint label it an explanatory aid, not proof of disease location. |
| Persistence and scan retrieval | `backend/app.py` stores profiles, per-scan `metadata.json`, and original images under `data/patients/`. Two existing demonstration/test profiles and two scan records were present; both scan images were present. The API returned an existing profile/history and the image endpoint returned HTTP 200. The browser restored profile/history after refresh. |
| Input validation and service failures | The 23-test backend suite passed, including malformed/empty/unsupported/oversized uploads, missing checkpoint handling, and HTTP 503 when inference is unavailable. API upload validation returns explicit 400/413/415 errors. |
| Laterality fields | Upload metadata stores `eye_side`; history displays it. `tests/test_patient_records.py` verifies separately stored left- and right-eye records. A new live second-eye record was not created during this read-only audit. |

## 3. Implemented but not fully verified in this audit

- **Clean backend startup:** An existing process already occupied port 8000. A duplicate startup attempt exited with Windows error 10048 (“address already in use”). The already-running API returned healthy status and model-ready state, but a clean start in an otherwise empty process environment was not repeated.
- **Backend-restart persistence:** Disk-backed files and live retrieval were confirmed, but this audit did not stop/restart the pre-existing backend. `END_TO_END_INTEGRATION_REPORT.md` documents the earlier browser refresh workflow; treat any restart claim there as historical evidence, not a fresh restart test in this audit.
- **Patient creation:** The active endpoint and UI are implemented, and isolated unit tests exercise create/retrieve. No new persistent patient was created during this audit.
- **Invalid-upload browser path:** Automated tests passed. This audit did not submit a malformed upload through the live browser.
- **Frontend automated tests:** `Frontend/package.json` has build/dev/preview scripts but no frontend test script. Browser checks here were manual automation; a dedicated React/UI test suite was not found.

## 4. Digital-twin vision: implemented vs. unfinished

| Capability | Current status |
|---|---|
| Patient-specific state and examination history | **Implemented as a local record store.** Patient profiles and individual scan metadata/images persist on disk. This is not a clinical record system and has no authentication or authorization. |
| Date- and eye-specific organization | **Partially implemented.** Eye side is explicit. `scan_date` is optional and user-entered; `uploaded_at` is generated by the server. The UI displays both separately. |
| Reliable chronological ordering | **Not reliable enough for longitudinal interpretation.** `get_patient_scans()` sorts by `scan_date`, but substitutes the upload date when `scan_date` is missing. Upload time is not acquisition time, and entered dates have no documented provenance. |
| Same-patient, same-eye repeat-scan comparison | **Not implemented.** History lists records, but there is no image registration, scan alignment, quantitative change measure, or comparison view. |
| Visualization of change over time | **Not implemented.** No active progression/trend chart is rendered in `Frontend/src/App.jsx`. `Frontend/src/styles.css` retains unused legacy selectors such as `.trend-chart` and `.mock-note`; these do not establish an active fake chart. |
| Actual longitudinal progression prediction | **Not implemented and currently blocked by data provenance.** The local OCTDL documentation/research reports describe repeated patient IDs but do not establish distinct visits and acquisition chronology. No temporal prediction target/model exists. |

Do not use `uploaded_at`, filenames, or the OCTDL `year` field as scan acquisition chronology without source documentation. The existing reports `LONGITUDINAL_DATASET_RESEARCH.md`, `LONGITUDINAL_DATA_INTEGRATION_PLAN.md`, and `OCTDL_OFFICIAL_DOCUMENTATION_REVIEW.md` discuss these limitations and distinguish proposals from implemented behavior.

## 5. Quality, configuration, and actual verification results

### Commands and results

1. **Backend tests**

   ```powershell
   .\.venv\Scripts\python.exe -B -m unittest discover -s tests -p 'test_*.py' -v
   ```

   **Passed: 23 tests.** Coverage includes checkpoint loading, preprocessing parity, class mapping, Grad-CAM PNG output, patient/scan persistence logic, left/right metadata, and invalid inputs.

2. **Frontend production build**

   ```powershell
   Set-Location Frontend
   npm.cmd run build -- --outDir C:\Users\vibhu\AppData\Local\Temp\amd-digital-twin-audit-build-20261025
   ```

   **Passed:** Vite 6.4.3 transformed 1,577 modules and emitted the production bundle. Output was directed outside the project and the temporary build directory was removed.

3. **Live API/browser checks**

   - `GET /health`, `GET /model-info`, patient profile/history: successful; checkpoint exists and model was ready.
   - `POST /predict` with a training-manifest image: successful, genuine model output returned.
   - `POST /gradcam` with the same image: successful, valid PNG returned.
   - Saved-image endpoint: HTTP 200.
   - Browser refresh restored the selected profile and history; “View scan” rendered the saved image and output.
   - CORS preflight for `http://127.0.0.1:5173`: successful.
   - Browser access from Vite’s default preview origin `http://127.0.0.1:4173`: **blocked by CORS**, since the backend allows only `localhost:5173` and `127.0.0.1:5173`.

### Configuration and data-handling observations

- The checkpoint path in `backend/model_service.py` is derived from the project root and the checkpoint is present (approximately 16.3 MB).
- `Frontend/package-lock.json` is present and the frontend build dependencies were available. No tracked Python dependency manifest (`requirements*.txt`, `pyproject.toml`, or `Pipfile`) was found, so recreating the backend environment is less reproducible.
- No `.env` file was found or tracked, and no credential-like literal was found in the inspected active app/config files. This was not a comprehensive secret scan of every notebook or artifact.
- No root `.gitignore` was present. **Six files under `data/patients/` are tracked**: two demo/test profiles, two scan metadata files, and two original images. Although the current records are marked as demonstration/test records, tracking this storage creates a privacy risk if real records are ever entered. The app also has no authentication; CORS is not an access-control mechanism.
- The active frontend has no hardcoded prediction or patient fixture. Two persistent demo/test profiles exist under `data/patients/`; a browser with a previously selected patient ID in local storage automatically restores that record. These are stored records, not automatically seeded fixture data.
- `PROJECT_AUDIT_REPORT.md` contains descriptions of an earlier prototype that conflict with the current API/frontend. Current code, tests, and the more recent `END_TO_END_INTEGRATION_REPORT.md` are the relevant evidence for the implemented app.
- Partial files exist under `results/amd_loss_weight_experiment_20261024/comparison_cpu4/`, but `AMD_LOSS_WEIGHT_EXPERIMENT_REPORT.md` is absent. These artifacts do not constitute a completed controlled comparison. This audit did not inspect their metrics or evaluate the held-out test split.

## 6. Remaining issues ranked

### Critical to the original vision

1. **No validated longitudinal twin or progression feature.** The app is a single-image classifier plus a visit log. There is no chronology-qualified comparison or progression model, and available OCTDL artifacts do not verify serial visits.

### Important for safe, reliable demonstration

1. **Tracked patient-storage files and no authentication.** Keep the demonstration bound to `127.0.0.1`; use only de-identified demo records. Before sharing the repository, add an appropriate ignore/untracking policy for local patient data and confirm no real records are included.
2. **CORS is port-specific.** The documented Vite dev origin on port 5173 works. A default production preview on port 4173 does not; use an allowed origin for the demonstration or update CORS when intentionally changing the deployment origin.
3. **No Python dependency manifest.** A fresh environment cannot be reliably recreated from a project-managed dependency specification.
4. **Dates do not guarantee acquisition chronology.** Optional user-entered dates and upload-time fallback must not be interpreted as verified visit dates; this also affects ordering of “latest” scan summaries.

### Optional cleanup / follow-up

1. Remove or clearly mark unused legacy mock/trend CSS selectors and review the legacy `/patient-history` JSON route separately from the active per-scan store.
2. Finish, document, or explicitly abandon the partial loss-weight experiment. Do not use its partial outputs as a completed result.
3. Add frontend automated tests for profile restore, upload errors, and saved-scan reopening.

## 7. Minimum steps for a demonstration

1. Start the backend bound to loopback:

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
   ```

2. From `Frontend`, run the Vite dev server on the CORS-allowed port:

   ```powershell
   npm.cmd run dev -- --host 127.0.0.1
   ```

3. Confirm `http://127.0.0.1:8000/health` reports `model_ready: true` and use `http://127.0.0.1:5173/`.
4. Use an explicitly demo-only, de-identified profile and OCT image. Show upload, model output, history, refresh restoration, and reopening a stored scan.
5. State that outputs are experimental binary classifier probabilities, not calibrated clinical risk or diagnoses. Do not demonstrate a progression claim.
6. Do not expose the unauthenticated backend to a network or enter identifiable clinical data.

## 8. Recommended next steps aligned with the vision

1. **Protect the local record store first:** decide how demo records are handled in version control, add repository ignore rules, and keep identifiable data out of this prototype. Add authentication and access controls before any network deployment.
2. **Make time and eye provenance explicit:** distinguish acquisition date/time (including source and precision) from server upload time; require or visibly mark missing acquisition dates; retain laterality and examination/visit identifiers.
3. **Acquire suitable longitudinal data:** obtain appropriately authorized serial OCT with verified same-person, same-eye, distinct-visit linkage and documented outcomes. Existing OCTDL repeats alone do not establish this.
4. **Build descriptive repeat-scan comparison before prediction:** only after provenance is established, implement and validate scan alignment/measurement and uncertainty reporting. Keep that separate from the binary classifier.
5. **Consider progression modeling only after a defensible temporal target and cohort exist.** Use patient-grouped development/validation and a separately held-out evaluation set; do not select rules or thresholds from prior test-set results.

## Files and artifacts reviewed

- Application: `backend/app.py`, `backend/model_service.py`, `src/oct_preprocessing.py`, `Frontend/src/App.jsx`, `Frontend/src/styles.css`, `Frontend/src/main.jsx`, `Frontend/index.html`, `Frontend/package.json`, `Frontend/package-lock.json`, `Frontend/vite.config.js`.
- Tests: `tests/test_inference_foundation.py`, `tests/test_patient_records.py`.
- Model/data/storage: `models/baseline_efficientnetb0_best.pth`, `data/Processed/train.csv` (training sample membership only), `data/Processed/manifest.csv`, split-report/overlap artifacts by presence, and existing `data/patients/` records. `data/Processed/test.csv` was not opened for evaluation and no held-out test metrics were calculated.
- Reports: `END_TO_END_INTEGRATION_REPORT.md`, `INFERENCE_SMOKE_TEST_REPORT.md`, `PROJECT_AUDIT_REPORT.md`, `LONGITUDINAL_DATASET_RESEARCH.md`, `LONGITUDINAL_DATA_INTEGRATION_PLAN.md`, and `OCTDL_OFFICIAL_DOCUMENTATION_REVIEW.md`.
