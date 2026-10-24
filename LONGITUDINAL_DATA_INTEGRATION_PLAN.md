# Longitudinal Data Integration Plan

**Project:** AMD Digital Twin  
**Status:** Planning only — no implementation or data migration in this step  
**Purpose:** Define a source-independent representation for future, provenance-preserving, same-participant/same-eye OCT observations without assuming that an access-controlled dataset will be approved.

## 1. Readiness findings from the current project

The existing local application has a working single-image classification and persistence workflow. Inspection of `backend/app.py`, `backend/model_service.py`, `Frontend/src/App.jsx`, and the existing patient storage shows the following:

### Existing stored profile

`data/patients/<patient-id>/profile.json` stores:

- `patient_id` — locally entered identifier.
- `created_at` — server-generated profile creation timestamp.
- `notes` — optional profile notes.

The current application has no mapping from a research source's deidentified participant identifier to a local patient ID. Do not reuse OCTDL `patient_id` values as real application identities without a documented, privacy-reviewed mapping.

### Existing stored scan metadata

Each uploaded visit is stored under a unique directory:

`data/patients/<patient-id>/scans/<scan-uuid>/`

It currently stores `metadata.json` and an original uploaded `original.jpg` or `original.png`. The metadata contains:

- `scan_id` — unique UUID for the application record.
- `patient_id` — local profile ID.
- `uploaded_at` — server-generated upload timestamp.
- `scan_date` — optional user-entered calendar date; may be null.
- `eye_side` — user-selected left/right eye.
- `prediction`, `amd_probability`, `class_probabilities`, and `model_version`.
- `notes`, `image_extension`, and relative `image_path`.

The API validates the patient ID, laterality, optional date format, image type/size, and notes length. History is sorted using `scan_date` where supplied, with upload time as a fallback ordering key. That fallback is a display/order behavior only; it does not make upload time a scan acquisition date.

### Current readiness gaps

The existing API accepts one image at a time and does not distinguish a source-provided visit identifier from an application scan UUID. It has no required verified acquisition timestamp, source dataset identifier, participant-eye-visit key, volume/B-scan hierarchy, device/protocol metadata, clinical outcome schema, or source-quality provenance. The frontend's current scan date is optional and entered by the user; the system does not verify it against source records.

The server-generated `uploaded_at` must remain distinct from acquisition time. The UI/model prediction fields describe single-image classification; they are not a temporal outcome, clinical risk, or progression label.

## 2. Design principles

1. **Preserve provenance:** retain original source identifiers and record where each value came from.
2. **Separate identity layers:** distinguish local application IDs from deidentified source participant IDs.
3. **Require same-eye matching:** do not compare observations unless participant and eye linkage are verified.
4. **Represent time honestly:** distinguish exact acquisition time, study visit label, date precision, and server upload time.
5. **Separate observations from inference:** store source clinical labels/outcomes separately from model predictions.
6. **Keep uncertainty explicit:** use null plus a missingness/reason field; never fill gaps by guessing.
7. **Preserve immutable originals:** do not overwrite the original scan or source metadata when adding normalized fields.
8. **Design for grouping before modeling:** split at participant level before creating scan, volume, or B-scan samples.
9. **Minimize sensitive information:** store only deidentified or approved data, in locations and formats permitted by the data agreement.
10. **No feature implementation now:** this proposal does not change routes, storage, model, frontend, datasets, or current records.

## 3. Proposed source-independent data model

A normalized structure should distinguish **participant**, **eye**, **visit**, **scan/volume**, **image/series**, and **labels/outcomes**. These can be represented in relational tables or equivalent manifest files. The example is conceptual, not a dataset record.

### Participant

| Field | Type / example | Meaning and validation |
|---|---|---|
| `participant_key` | opaque string | Stable deidentified participant key within the authorized source release; required and nonempty. Never use a direct identifier. |
| `local_patient_id` | optional opaque string | Local application profile key, if a permitted mapping exists. Keep any crosswalk separately with stricter access controls; do not store identity mappings in public manifests. |
| `source_dataset_id` | controlled string | Dataset/release identifier, e.g. documented cohort release. Required for provenance. |
| `source_participant_id` | string or null | Deidentified source ID as supplied; preserve verbatim. |
| `consent_or_access_scope` | controlled value/reference | Approved research scope or agreement reference where appropriate; do not copy legal documents into image metadata. |

### Eye

| Field | Type / example | Meaning and validation |
|---|---|---|
| `eye_key` | stable opaque key | Unique within participant/source. |
| `participant_key` | foreign key | Must refer to a known participant. |
| `laterality` | `OD`, `OS`, or null | Right/left in source convention. Preserve source value and document mapping. Do not translate ambiguous or unknown values into a side. |
| `laterality_source` | controlled string | Source field/documentation supporting the side. |

### Visit

| Field | Type / example | Meaning and validation |
|---|---|---|
| `visit_key` | stable source key | Source visit ID when provided; otherwise a locally assigned key only after a verified source visit is established. |
| `participant_key` | foreign key | Participant associated with visit. |
| `visit_label` | string or null | Source-defined label such as baseline or protocol month, with source definition retained. Not inferred from filename. |
| `acquisition_datetime` | ISO-8601 datetime or null | Actual scan acquisition time only if verified by source data. |
| `acquisition_date` | ISO-8601 date or null | Date when only date precision is provided. |
| `time_from_baseline_days` | integer/decimal or null | Derived only from verified dates or documented study timepoints; include derivation and precision. |
| `date_precision` | enum | `datetime`, `date`, `study_timepoint`, or `unknown`. |
| `time_source` | controlled string or null | Source field/protocol establishing the time value. |
| `uploaded_at` | ISO-8601 datetime | Local server timestamp of ingestion; separate from acquisition/visit time and never substituted for it. |

### Scan or volume

| Field | Type / example | Meaning and validation |
|---|---|---|
| `scan_key` | stable unique string | Source scan/volume identifier or generated ingestion key with explicit namespace. |
| `participant_key`, `eye_key`, `visit_key` | foreign keys | Required linkage. Participant identity must agree across all linked records. |
| `modality` | controlled value | OCT, SD-OCT, OCTA, or source-defined subtype; retain original source label. |
| `source_scan_id` | string or null | Original deidentified source identifier. |
| `image_or_volume_path` | relative path/URI | Path inside an authorized managed data root; not user-controlled arbitrary path. |
| `file_format`, `sha256`, `byte_size` | metadata | Preserve format, integrity digest, and size for the ingested original. |
| `device_vendor`, `device_model`, `software_version` | value or null | Record only when supported by source metadata. |
| `scan_protocol`, `scan_pattern`, `field_of_view`, `dimensions`, `spacing` | value or null | Preserve units and source definitions; validate ranges without inventing defaults. |
| `image_quality_grade`, `quality_flags`, `exclusion_reason` | value(s) or null | Keep source grades separate from locally computed flags; record assessor/algorithm and version when available. |

### Image/series items

If a volume contains multiple B-scans or derived images, represent them as children of the scan/volume rather than separate visits:

| Field | Type / example | Meaning and validation |
|---|---|---|
| `image_key` | unique string | Unique B-scan/slice/image identifier. |
| `scan_key` | foreign key | Parent OCT scan or volume. |
| `source_image_id` | string or null | Source-provided slice/image key. |
| `slice_index` | integer or null | Only use when supplied or unambiguously defined by source documentation. It is within-volume order, not visit chronology. |
| `image_path` | relative path/URI | Original or derived image path with derivative provenance. |
| `is_original` | boolean | Distinguish original input from transformed/resampled/registered images. |

### Clinical labels, outcomes, and treatment

Use separate records linked to the appropriate participant, eye, visit, or scan. Every field should carry source, timepoint, definition/version, and assessment status.

| Field group | Suggested fields | Rules |
|---|---|---|
| AMD grade | `label_name`, `label_value`, `grading_scale`, `grader_or_adjudication`, `assessment_time`, `source` | Do not collapse stages to binary AMD unless the analysis explicitly requires it; preserve the source grade. |
| Outcomes | e.g. CNV conversion, GA, drusen measures, visual acuity, progression event | Store outcome definition, units, assessment time/horizon, source, and adjudication. Do not call model output a clinical outcome. |
| Treatment | treatment class/name, administration date/time, visit relation, source | Preserve missingness and temporal ordering; only use if provided and permitted. Treatment may affect observed change and must not be silently ignored. |
| Quality | source quality score, locally computed flags, missing/failed scan reason | Keep raw source assessment and derived quality features separate, with method/version and units. |

### Conceptual record example

The following is a schema illustration only. Placeholder values are not a real participant, visit, scan, date, label, or result.

```json
{
  "participant_key": "<verified-deidentified-participant-key>",
  "source_dataset_id": "<documented-source-release>",
  "eye": {
    "eye_key": "<verified-eye-key>",
    "laterality": "<OD|OS|unknown>"
  },
  "visit": {
    "visit_key": "<verified-source-visit-key>",
    "visit_label": null,
    "acquisition_datetime": null,
    "acquisition_date": null,
    "time_from_baseline_days": null,
    "date_precision": "unknown",
    "uploaded_at": "<separate-server-ingestion-time>"
  },
  "scan": {
    "scan_key": "<source-or-ingestion-scan-key>",
    "modality": "<source-documented-modality>",
    "image_or_volume_path": "<managed-relative-path>",
    "sha256": "<computed-content-digest>",
    "image_quality_grade": null
  },
  "clinical_labels": [],
  "outcomes": [],
  "treatments": []
}
```

## 4. Missing-value and validation rules

### Missing values

- Use a typed null for unavailable values; do not use strings such as `"Unknown"`, `"N/A"`, zero, or an empty string interchangeably without a documented source convention.
- Where useful, pair a null with `missing_reason` such as `not_collected`, `not_shared`, `not_applicable`, `source_unknown`, `withheld`, or `failed_quality_check`. Only assign a reason supported by source documentation.
- Preserve a source value and a normalized value separately when mapping labels, laterality, or units.
- Never derive a visit date from file creation/modification time, upload time, filename suffix, patient birth year, or a bare `year` field of uncertain meaning.
- Do not infer missing laterality from neighboring rows or assumed bilateral imaging.
- Do not turn absent labels into negative outcomes.

### Validation gates

Before a record can be admitted to a same-eye longitudinal analysis:

1. `participant_key`, `eye_key`, `visit_key`, and `scan_key` must be unique/consistent within their documented scopes and referentially valid.
2. Participant and eye linkage must be source-verified. Laterality must be `OD` or `OS`, or the record is excluded from same-eye pairing.
3. A comparison requires at least two distinct verified visits for the same participant and same eye. Distinct filenames alone are insufficient.
4. Visit ordering requires verified acquisition dates or a source-defined ordered timepoint with documented semantics. Reject contradictory timestamps or unresolvable ordering.
5. Acquisition time and upload time must be stored separately; upload time cannot satisfy the acquisition-time requirement.
6. Scan modality, units, device/protocol, dimensions, and image paths must be validated against the source data dictionary. Preserve differences rather than silently coercing them.
7. Each file must pass format/readability checks, have a recorded integrity hash, and retain its source provenance.
8. Labels/outcomes must include their definition and observation time. Do not mix outcomes from different grading systems without a documented harmonization.
9. Quarantine contradictory, ambiguous, duplicate, or incomplete source records for review rather than silently fixing them.
10. Keep an auditable import manifest with source release, import date, parser/version, file hash, mapping version, and validation outcome. Import time is provenance, not clinical time.

## 5. Leakage-safe evaluation plan

### Partitioning

- Partition by **participant**, not image, B-scan, visit, eye, or volume. All eyes and all timepoints from one participant stay in exactly one of train, validation, or test.
- For a multi-source project, retain source/site/device fields and consider a separate external cohort or site-held-out evaluation, subject to sample size and access constraints.
- Freeze the participant assignment manifest and record its seed/version before model selection. Check participant-ID and source-image/hash overlap across partitions.
- Keep the final test participants and their future visits untouched during model development and threshold/feature selection.

### Temporal design for a future-outcome task

If a later task predicts a future clinical outcome:

1. Define the index visit and a clinically meaningful prediction horizon before examining model results.
2. Restrict predictors to information available on or before the index time. Later images, grades, treatments, or outcome adjudications must not leak into baseline features.
3. Keep each participant within one split even when generating multiple index visits or windows.
4. Ensure outcome labels occur after the predictor window, with a documented censoring and missing-follow-up strategy.
5. Report participants, eyes, visits, and scans separately, plus event counts, time horizon, missingness, and uncertainty.

### For descriptive within-eye change

For a demonstrative measurement comparison rather than prediction, use verified same-eye pairs and retain participant as the statistical grouping unit. Validate registration, measurement repeatability, protocol/device comparability, and image quality. Do not present scan-level observations as independent patients. Report measurement uncertainty and exclude pairs that cannot be reliably aligned or measured.

The current OCTDL splits are patient-disjoint for the documented classification task, but they do not create a temporal test set or validate longitudinal outcomes. A future longitudinal dataset requires its own participant-level split and temporal protocol.

## 6. Relationship to current application storage

Current storage layout:

```text
data/patients/<local-patient-id>/
  profile.json
  scans/<application-scan-uuid>/
    metadata.json
    original.jpg|original.png
```

The existing local `patient_id`, `scan_id`, user-entered optional `scan_date`, `eye_side`, model result, `model_version`, original-image path, and server-generated `uploaded_at` are useful foundations for a local demonstration. They are not sufficient on their own to establish provenance from a research dataset or a verified longitudinal sequence.

For future genuine longitudinal ingestion, an approved source adapter would need to preserve source participant/eye/visit/scan identifiers and map them to an application profile without conflating the namespaces. It would also need verified acquisition time/timepoint, source and release provenance, modality/device/protocol, quality, labels/outcomes/treatment references, and explicit missingness. If each source scan is a volume containing multiple B-scans, the storage model must represent the volume-to-image hierarchy rather than treating every image as a separate patient visit.

Do not rewrite existing profile or scan files as part of planning. Do not reinterpret their `uploaded_at` or user-entered `scan_date` as verified source acquisition metadata. No endpoints, frontend display, classifier, threshold, or storage behavior are changed by this plan.

## 7. Readiness checklist before implementation

- [ ] Written approval/access terms and permitted use are documented.
- [ ] Data custodian confirms raw OCT image/volume availability.
- [ ] Deidentified participant and same-eye linkage fields are documented.
- [ ] Visit-time semantics and acquisition-date precision are documented.
- [ ] Outcome/grading definitions, treatment metadata, device/protocol, and quality fields are documented.
- [ ] Privacy, storage, retention, sharing, and institutional/ethics obligations are reviewed.
- [ ] A source-specific import mapping is reviewed against the data dictionary.
- [ ] Validation rejects uncertain participant-eye-visit matches; no synthetic history is created.
- [ ] Participant-level split and temporal evaluation protocol are prespecified.
- [ ] Measurement/registration repeatability is assessed before displaying numeric change.
- [ ] UI labels measured change as descriptive and does not present classifier probability as clinical risk or progression.

## 8. Not verified

- A2A raw OCT volumes/B-scans are available to this project.
- A2A access will be approved or what agreement/ethics requirements apply.
- Exact stable participant-eye-visit keys or acquisition dates are included in any requestable release.
- Any source dataset has been imported into the current application.
- The current application can perform same-eye matching, scan registration, OCT measurement, or longitudinal outcome evaluation.

This document is a proposal only. It does not implement or validate any longitudinal analysis.

