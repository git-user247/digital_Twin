# End-to-End Integration Verification Report

**Project:** AMD Digital Twin  
**Verification scope:** Step 5 — integration of the React/Vite frontend, FastAPI backend, saved EfficientNetB0 checkpoint, patient records, scan history, and Grad-CAM  
**Verification date:** 2026-10-24  

## 1. Project Overview

The project is a local academic prototype for binary AMD versus Non-AMD classification from OCT images. The React frontend lets a user create or load a local patient profile, submit a scan, and view saved scan history and images. The FastAPI backend validates uploads, loads the saved EfficientNetB0 checkpoint, returns inference results, and stores scan metadata and original images on disk. Grad-CAM is exposed as a separate explanatory endpoint.

| Component | Role | Evidence |
|---|---|---|
| React and Vite frontend | Patient profile and scan workflow, result display, history, saved-image display, and Grad-CAM presentation | `Frontend/src/App.jsx`, `Frontend/package.json` |
| FastAPI backend | Health/model readiness, profiles, scan upload/history/image retrieval, legacy prediction, and Grad-CAM routes | `backend/app.py` |
| Model service | EfficientNetB0 construction, checkpoint loading, image preprocessing, sigmoid prediction, and Grad-CAM | `backend/model_service.py`, `src/oct_preprocessing.py` |
| Local scan persistence | Profile and per-scan metadata and original image files | `data/patients/<patient-id>/` |
| Dataset | OCTDL images and train/validation/test manifests | `data/raw/OCTDL/`, `data/Processed/` |

This verification demonstrates application integration for the tested flow. It does not establish clinical validity, clinical risk calibration, or suitability for identifiable clinical records.

## 2. Verification Environment

### Verified versions and configuration

| Item | Verified value |
|---|---|
| Operating system | Windows |
| Python | 3.13.7 |
| FastAPI | 0.162.0 |
| Starlette | 1.9.0 |
| Pydantic | 2.14.1 |
| PyTorch | 2.14.0+cpu |
| Torchvision | 0.29.0+cpu |
| Pillow | 12.3.0 |
| React / React DOM | 18.3.1 |
| Vite | 6.4.3 |
| Backend address | `http://127.0.0.1:8000` |
| Frontend address | `http://127.0.0.1:5173` |
| Frontend API base URL | `http://127.0.0.1:8000` |

The Python executable and `uvicorn` were confirmed to be from the project `.venv`. Existing frontend `node_modules` were present. No packages were installed or dependencies changed.

### Startup commands

The backend command used to start/restart the project backend was:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

The frontend startup command used during the verification session was:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

For the later repeat of the checks, both services were already running and their owning processes and commands were inspected; duplicate services were not launched.

### Not verified

- Node.js version: **Not verified**.
- GPU availability/performance: **Not verified**; the observed backend reported CPU.
- Behavior on a different host, deployment environment, or production server: **Not verified**.

## 3. Backend Verification

The following checks used real HTTP requests to the running backend:

| Method | Endpoint | Observed status | Result |
|---|---|---:|---|
| `GET` | `/health` | 200 | `status: "ok"`, `model_ready: true`, `device: "cpu"` |
| `GET` | `/model-info` | 200 | `ready: true`, `checkpoint_exists: true`; model metadata reported EfficientNetB0 and binary AMD vs Non-AMD classification |
| `GET` | `/openapi.json` | 200 | Patient profile, scan history, and saved-image routes were present after the current backend process was loaded |
| `OPTIONS` | `/patients` with origin `http://127.0.0.1:5173` | 200 | CORS response allowed the frontend origin and `content-type` header |

The live model readiness response establishes that the running backend considered the model ready and checkpoint present. A successful scan request also establishes that inference completed for the submitted image. The checkpoint-loading implementation was inspected in `backend/model_service.py`: it builds the binary EfficientNetB0 head, loads the state dictionary strictly, moves the model to the selected device, and sets evaluation mode. That implementation detail is code inspection; the live endpoint checks do not independently expose every internal loading operation.

The `/model-info` checkpoint path in the JSON response displayed garbled non-ASCII characters in a Windows path. The response still reported `checkpoint_exists: true` and `ready: true`; no path-formatting fix was attempted because it did not prevent the tested workflow.

## 4. Patient and Scan Workflow

### Test input

- Test patient ID: `E2E-VERIFY-20261024-0216-01`
- OCT image: `data/raw/OCTDL/AMD/amd_1191668_3.jpg`
- The training manifest row records the source image as class AMD and eye `OS` (left).
- The image came from the training split, not the held-out test split.

### Executed workflow

1. The browser created the patient using `POST /patients`. The UI confirmed creation only after receiving the backend response.
2. The browser retrieved the profile using `GET /patients/{patient_id}`.
3. The browser submitted the image to `POST /patients/{patient_id}/scans` as a left-eye scan. A successful request returned HTTP 201.
4. The API returned the prediction, AMD probability, class probabilities, scan ID, upload timestamp, model version, and image URL.
5. `GET /patients/{patient_id}/scans` returned persisted scan records.
6. `GET /patients/{patient_id}/scans/{scan_id}/image` returned the stored JPEG with HTTP 200.
7. After refreshing the frontend, the profile and scan history were reloaded, and the saved image opened again.
8. A different, nonexistent patient ID returned a not-found profile response and displayed no scan history for that ID.

### Observed model output

The actual saved scan response and UI showed:

| Field | Observed value |
|---|---|
| Prediction | `AMD` |
| AMD probability | `0.5099449753761292` |
| Non-AMD class probability | `0.490055` |
| AMD class probability | `0.509945` |
| Model version displayed | `baseline_efficientnetb0_best:epoch-12` |
| Eye side saved | `left` |

These values are the classifier response for this one submitted image. They are not a clinically validated or calibrated risk estimate.

### Persistence evidence

The scan endpoint returned a saved scan ID and image URL. The corresponding image was downloaded through the image endpoint and displayed in the browser. A SHA-256 comparison established that the persisted original image matched the submitted dataset image. After refresh, the frontend retrieved the saved records again.

Three visits were created under the fresh test profile during repeated submissions used to check save confirmation and Grad-CAM failure isolation. The profile and all three scan records were inspected before cleanup. Only the directory matching this test patient ID was removed. The earlier profile `E2E-VERIFY-20261023-A` was preserved.

## 5. Grad-CAM Verification

- A separate `POST /gradcam` request using a saved OCT image returned HTTP 200 and a nonempty base64 overlay. The frontend displayed a Grad-CAM image in the successful inference flow.
- A separate failure-isolation test deliberately aborted the Grad-CAM browser request after a scan was saved. The UI displayed the Grad-CAM failure (`Failed to fetch`) separately. The backend-confirmed saved scan remained visible and persisted in history.
- The aborted request produced an expected browser request failure/console error. This was induced for the failure test, not an unexplained failure in the successful flow.
- Grad-CAM is an explanatory visualization aid, not proof of disease location.

## 6. Frontend Verification

### Browser checks actually executed

Browser automation was available and used against the live Vite page. The following behavior was exercised:

- Create and retrieve a patient profile.
- Select the left eye and upload a genuine dataset image.
- Display actual prediction and probabilities returned by the backend.
- Delay a scan-save request to verify that no saved-result panel appears before the backend response; after confirmation, the UI showed the saved scan.
- Refresh, reload scan history, and open a previously saved image.
- Switch to a different nonexistent patient ID and verify that its history was empty.
- Submit an unsupported image file and verify the frontend message: “Choose a JPEG or PNG image.”
- Submit an empty patient ID and verify the frontend validation message.
- Simulate backend unavailability by intercepting browser requests. The UI displayed “Backend unavailable,” and a profile request displayed “Failed to fetch.”
- Abort Grad-CAM after a successful scan save and verify that the saved scan remained confirmed.

### Network, CORS, and console observations

- Successful browser profile/history/image checks returned the expected API responses and included `Access-Control-Allow-Origin: http://127.0.0.1:5173`.
- The explicit CORS preflight also succeeded.
- The successful profile/history/image pass had no console errors, uncaught page errors, or failed requests.
- Negative tests intentionally produced HTTP 400/415 responses. The deliberate Grad-CAM abort produced a failed request and browser console message as expected.

### Production build

Command, run from `Frontend`:

```powershell
npm.cmd run build
```

Result: **Passed** using Vite 6.4.3. The build transformed 1,577 modules. The observed output included `dist/index.html`, CSS, and JavaScript bundles. This verifies a production build, not a deployed production-server workflow.

## 7. Bugs and Fixes

### Stale backend process encountered during the initial integration attempt

An initial browser profile-creation request returned HTTP 404. Inspection of the running process showed that it was the project Uvicorn process, but its in-memory OpenAPI schema exposed only the older routes and omitted the patient routes defined in the current source. The patient-storage root was also absent at that point, confirming that the attempted request had not created a profile.

**Resolution:** The specific stale backend process was stopped and the backend was restarted with the project `.venv` command. The refreshed OpenAPI then included `/patients`, `/patients/{patient_id}`, scan history, and saved-image routes. Health/model readiness remained successful and the browser workflow then completed.

**Files changed:** None. This was resolved by restarting the backend process; no application source, model, configuration, or dependencies were changed.

No other integration bug requiring a source-code fix was established during these checks.

## 8. Automated Tests

### Backend

Exact command:

```powershell
.\.venv\Scripts\python.exe -B -m unittest discover -s tests -p 'test_*.py' -v
```

Observed summary:

```text
Ran 21 tests in 3.398s
OK
```

**Passed:** 21  
**Failed:** 0  
**Skipped:** 0

### Frontend

Exact command, run from `Frontend`:

```powershell
npm.cmd run build
```

**Result:** Passed. Vite 6.4.3 transformed 1,577 modules and generated the production bundle.

## 9. Verification Evidence and Classification

| Evidence type | Verified facts |
|---|---|
| Live HTTP | Health, model-info, CORS preflight, profile/scan/image routes, upload validation responses, and Grad-CAM response were exercised against the local server |
| Browser automation | Profile create/load, scan upload and result display, history refresh, saved-image viewing, patient isolation, invalid input, backend-unavailable simulation, and Grad-CAM failure isolation were exercised |
| Automated tests | 21 backend `unittest` cases passed |
| Build | Frontend Vite production build passed |
| Code inspection | API base URL, CORS origins, route implementation, model construction/checkpoint-loading code, inference and Grad-CAM handling, and frontend response/error handling were inspected |
| Not verified | Clinical validity, calibrated risk estimates, production deployment, authentication/authorization, multi-user/concurrent use, and browser behavior on other browsers/devices |

No screenshots, logs, metrics, or test results have been fabricated. The results above are from the commands and live checks executed during this integration verification.

## 10. Limitations and Remaining Work

- Backend-unavailable behavior was simulated by browser request interception; the backend process itself was not stopped during that check.
- Validation covered the specified local workflow and one genuine training-split image. It does not establish correctness for every image, browser, operating system, or deployment configuration.
- The model produces binary classification probabilities. These are not clinical risk scores and have not been clinically validated by this integration check.
- The project has no authentication or authorization and should not be used to store identifiable clinical data.
- Longitudinal comparison or disease-progression prediction was not tested or implemented as part of this step.
- No model retraining, threshold changes, or longitudinal analysis were performed.

Before longitudinal analysis is undertaken, the project should at minimum define the intended longitudinal outcome and data semantics, ensure visits and eye laterality are reliable, preserve patient-level separation for any evaluation, and specify an evaluation protocol that prevents leakage between visits from the same patient. Those are recommendations for future work, not changes made or results established here.

## 11. Final Status

The local React/Vite-to-FastAPI workflow has been exercised end-to-end in a browser: patient profiles can be created and retrieved, a real OCT image can be submitted for saved EfficientNetB0 inference, scan metadata and original images persist, history survives refresh, saved images can be reopened, and Grad-CAM can be generated independently. The frontend build and all 21 backend tests passed.

The stale loaded backend encountered during the first attempt was resolved by restarting the backend; no source files required modification. This status applies to the tested local academic prototype and does not imply clinical readiness, secure handling of real patient information, or validation of longitudinal predictions.
