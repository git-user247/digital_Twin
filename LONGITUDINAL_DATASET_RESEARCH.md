# Step 6A — Longitudinal OCT Dataset Suitability Research

**Project:** AMD Digital Twin  
**Scope:** Read-only audit of the local OCTDL data and research into publicly documented alternatives for genuine longitudinal OCT analysis  
**Date:** 2026-10-24

## Executive summary

The local OCTDL data support **patient-grouped image classification**, but do not establish a dated, same-eye visit sequence. The manifests contain repeated patient IDs and laterality for some images, but have no scan date or visit identifier. Image filenames are not evidence of visit order. Consequently, OCTDL cannot be used to claim actual longitudinal change or progression from the available local metadata.

The strongest research lead is the **AREDS 2 Ancillary SD-OCT (A2A) Study**, registered as NCT00734487. Its official registry describes SDOCT outcomes at two and five years, eye-level outcomes, and underlying datasets available to researchers upon request. However, a downloadable package containing raw OCT volumes and stable patient-eye-visit linkage was **not verified**. The next step should be a focused data-access inquiry to the study contacts, not implementation against assumed data fields.

Keep OCTDL for the existing classification baseline. Use a separate source for longitudinal work only after confirming lawful access to actual repeated OCT data, eye linkage, dates, and outcome definitions. No dataset was downloaded, no restricted patient records were accessed, and no project files other than this report were changed.

## Part A — Audit of local OCTDL data

### Files inspected

- `data/raw/OCTDL/OCTDL_labels.csv`
- `data/Processed/manifest.csv`
- `data/Processed/train.csv`
- `data/Processed/validation.csv`
- `data/Processed/test.csv`
- `data/Processed/split_report.csv`
- `data/Processed/split_patient_overlap.csv`
- `data/Processed/quality_inspection/inspection_report.csv`
- `notebooks/04_patient_level_split.ipynb`

The OCTDL dataset listing describes 2,064 labeled OCT images and the source metadata columns; the local counts below were independently calculated from the local CSVs. See [IEEE DataPort OCTDL description](https://ieee-dataport.org/documents/octdl-optical-coherence-tomography-dataset-image-based-deep-learning-methods) and the dataset paper, Kulyabin et al. (2024), [Scientific Data, DOI 10.1038/s41597-024-03182-7](https://doi.org/10.1038/s41597-024-03182-7).

### Fields present locally

The raw label file has these columns:

`file_name`, `disease`, `subcategory`, `condition`, `patient_id`, `eye`, `sex`, `year`, `image_width`, `image_hight`

The processed manifest adds:

`image_path`, `target_amd`, and `usable`

The local `year` field is not named `scan_date`, `visit_date`, or `acquisition_date`. Its 448 populated values range from 1931 to 2004, but the accessible dataset description lists only a `year` field and does not establish that it is the OCT acquisition year. Its values must therefore **not** be used as visit dates. The local manifests do not contain an explicit visit ID, scan date, acquisition timestamp, longitudinal outcome, or treatment history. The source labels use `image_hight` (rather than `image_height`); the processed manifest uses `image_height`.

### Local counts and metadata coverage

| Measure | Observed local value |
|---|---:|
| Source/manifest rows | 2,064 |
| Distinct patient IDs | 820 |
| Manifest rows marked usable | 2,062 |
| AMD images | 1,231 |
| Non-AMD images (`target_amd = 0`) | 833 |
| Disease classes in source metadata | 7 |
| Images with known `OD`/`OS` laterality | 448 |
| Images with laterality `Unknown` | 1,616 |
| Rows with nonempty `year` value | 448 |
| Patients with more than one image | 568 |
| Maximum images for one patient ID | 10 |

The seven source disease categories are AMD, DME, ERM, NO, RAO, RVO, and VID. `target_amd` collapses these into a binary AMD/non-AMD target; it is not a longitudinal disease stage or progression label.

Patient IDs repeat across images, so the metadata permits image grouping by the supplied `patient_id`. Some records also carry `OD` or `OS`. In the manifest, 220 patient-eye combinations have known laterality, and 152 such combinations have multiple image rows; 32 patient IDs have records for both known eyes. These repeated rows do **not** establish repeated visits. Without a documented visit identifier and acquisition date, multiple images for one patient-eye might be multiple B-scans or images from one examination, or otherwise related records; the local files do not resolve that distinction.

The filenames have patient-like text and numeric suffixes, but neither the local manifest nor the cited dataset description establishes that the suffix identifies a chronological visit. This report does not infer dates, visits, or eye relationships from filename order.

### Does OCTDL support a genuine longitudinal comparison?

**Not from the locally available files.** The metadata lacks the minimum confirmed linkage needed for a defensible trajectory:

1. Verified participant ID linked across visits.
2. Verified laterality for each observation.
3. Acquisition date or a documented ordered visit index.
4. Evidence that two observations refer to distinct visits rather than images within one scan or exam.
5. Longitudinal disease outcome or clinical grading, if progression claims are intended.

OCTDL can be used for its documented image classification task. Repeated patient IDs and some eye labels alone are not sufficient to call an image pair longitudinal.

The application store at `data/patients/` is separate from OCTDL metadata. It currently contains a prior end-to-end test profile with a server-generated `uploaded_at` timestamp and `scan_date: null`. That record is not source-dataset visit metadata and must not be treated as a genuine participant timeline or merged with OCTDL patient IDs.

### Train/validation/test leakage assessment

The split artifacts show the following:

| Split | Images | Unique patients | AMD images | Non-AMD images |
|---|---:|---:|---:|---:|
| Train | 1,428 | 574 | 858 | 570 |
| Validation | 327 | 123 | 197 | 130 |
| Test | 307 | 123 | 174 | 133 |

`split_patient_overlap.csv` records zero overlap for train-validation, train-test, and validation-test. The notebook `notebooks/04_patient_level_split.ipynb` was inspected: it validates patient IDs, groups usable rows by patient, stratifies patient groups, assigns patient IDs with a fixed seed, and maps each patient’s images into the corresponding split. This supports the conclusion that the current classification splits are patient-disjoint, not image-random.

An independent read-only set comparison of the three CSVs also found zero patient-ID intersections and zero train/validation image-path overlap. One exact-content duplicate pair was found in the full manifest; both rows have `usable=False`, share the same patient ID, and are excluded from the saved splits. This does not identify a cross-split duplicate in the current splits.

**Residual risks:** patient-disjoint splitting depends on the supplied IDs being accurate and consistently applied. The split prevents known same-ID patients from crossing partitions, but does not prove that dataset IDs correspond to all true patient relationships. It also does not establish external generalization or provide a temporal evaluation. The split is appropriate for image classification on the provided IDs; it is not a longitudinal split design.

## Part B — Alternative dataset research

### Comparison

| Candidate | Modality and task | Repeated visits, eye/date linkage, AMD outcomes | Access and suitability |
|---|---|---|---|
| **AREDS 2 Ancillary SD-OCT Study (A2A; NCT00734487)** | Prospective observational/case-control SDOCT study related to AMD. ClinicalTrials.gov reports 470 actual participants. Registry outcomes include percent of eyes developing CNV, visual acuity change, and OCT-derived change in drusen volume, geographic atrophy area, and photoreceptor thickness at 2 and 5 years. | **Longitudinal OCT outcomes are explicitly documented at 2 and 5 years, at eye level.** The registry supports the study’s relevance to AMD change over time. The exact raw-scan package, stable participant/eye IDs, acquisition-date fields, and their availability in a researcher release were not verified. | Registry IPD sharing is marked “YES” and says underlying datasets can be made available to researchers **upon request**. This is not an unrestricted download. Privacy conditions, review process, agreement terms, and raw OCT-image availability must be confirmed with study contacts. **Best lead**, conditional on receiving the actual images and linkage fields required. |
| **Duke/RPEDC SDOCT dataset associated with the A2A work** | Published Duke resource for OCT image segmentation/classification methods. The indexed resource description reports 38,400 B-scans from 269 AMD patients and 115 normal subjects, with segmentation markings. Related paper: Farsiu et al., “Quantitative Classification of Eyes with and without Intermediate Age-related Macular Degeneration Using Optical Coherence Tomography,” *Ophthalmology* (2014). | The resource description supports OCT images and AMD/control labels, but does not, by itself, confirm that the distributed images are serial visits or expose visit dates and stable same-eye keys. A separately reported longitudinal study design is not proof that all longitudinal raw scans are in this download. | Duke resource page: [RPEDC Ophthalmology 2013 dataset](http://people.duke.edu/~sf59/RPEDC_Ophth_2013_dataset.htm). The page was discovered through the dataset listing, but direct access to the Duke host was blocked in this review; downloadable package, terms, and contents were not verified. Contact the authors for the longitudinal subset and its linkage before selecting it. **Potentially valuable, access/content uncertain.** |
| **HARBOR ranibizumab trial (NCT00891735)** | Phase III randomized neovascular AMD treatment trial; ClinicalTrials.gov reports 1,097 actual participants. The registry includes OCT-related central foveal thickness changes at baseline and Day 7 / months 1, 2, 3, 4, 6, 9, and 12. | Repeated, scheduled OCT-derived measures and AMD outcomes are documented. The trial record does **not** establish public access to raw OCT images or a released same-eye image-series key. | ClinicalTrials.gov provides the study record and summary information; no raw OCT download or IPD sharing statement was confirmed there. Sponsor-mediated data requests may be possible, but image-level access and terms are unverified. **Fallback access inquiry**, not a confirmed downloadable longitudinal image dataset. |
| **OCTA-500** | 500-subject retinal OCT angiography resource. Its IEEE DataPort description says it contains OCT and OCTA volumes, projections, and age, gender, eye (OS/OD), and disease labels, plus segmentation labels. | Laterality is documented, but the landing page does not document repeated visits, acquisition dates, or longitudinal AMD progression outcomes. Disease-specific AMD suitability was not established from the page inspected. | [Official IEEE DataPort page](https://ieee-dataport.org/open-access/octa-500) specifies emailing the authors with an application format to obtain the archive password. This is author-mediated access, not an unrestricted download. Useful for same-eye volume/segmentation method work if access is granted, **not** a substitute for a dated AMD trajectory. |
| **AREDS/AREDS2 clinical-trial cohort (general)** | NEI describes AREDS/AREDS2 as major trials studying AMD natural history, risk factors, and progression. | AMD progression relevance is documented by NEI, but this overview does not confirm that a researcher can obtain linked serial OCT images with participant, eye, and date fields. A general trial dataset or fundus-photo availability should not be assumed to include OCT. | [NEI AREDS/AREDS2 overview](https://www.nei.nih.gov/eye-health-information/clinical-trials/age-related-eye-disease-studies-aredsareds2). This is a research lead, not an OCT-image download portal. Investigate through the A2A study and data custodians. |
| **OCTDL (current project data)** | 2D OCT images for retinal disease classification; local project uses a binary AMD/non-AMD target. | Patient IDs repeat and some rows have eye laterality, but local data do not document visits, dates, or progression labels. | The public dataset description is at [IEEE DataPort](https://ieee-dataport.org/documents/octdl-optical-coherence-tomography-dataset-image-based-deep-learning-methods). It is appropriate to retain for classification, but not to present as longitudinal evidence. |
| **UK Biobank retinal imaging** | Large research imaging resource; OCT-specific claims were not established from a page accessible in this review. | Repeated same-eye OCT visits, dates, and AMD-linked progression records were **not verified** here. | The official [UK Biobank imaging-data page](https://www.ukbiobank.ac.uk/enable-your-research/about-our-data/imaging-data/retinal-imaging) returned HTTP 403 to the research browser. Access terms and relevant fields are therefore **not verified**; do not select it without confirming OCT availability, repeat imaging, and application requirements with UK Biobank. |

### Access and evidence notes

- The most direct longitudinal evidence came from the official [ClinicalTrials.gov A2A record](https://clinicaltrials.gov/study/NCT00734487), including its study design, actual enrollment, eye-level OCT outcome measures at 2 and 5 years, and “underlying datasets available upon request” statement. This does **not** prove that raw OCT files or all requested linkage variables will be granted.
- The official [HARBOR registry record](https://clinicaltrials.gov/study/NCT00891735) supports the repeated OCT-derived measurement schedule. The record does not establish access to the actual scans.
- OCTDL and OCTA-500 descriptions were read from their IEEE DataPort dataset pages. No data were downloaded.
- Direct access to the Duke resource host and UK Biobank page was blocked during this research. Claims about those resources are explicitly limited to accessible indexed descriptions or marked not verified.
- No restricted patient data were accessed. No dataset archives were downloaded.

### Candidate suitability

1. **A2A is the best practical first request** because it is the most directly matched verified lead: actual OCT, AMD-related endpoints, and longitudinal measurement timepoints are documented, and the registry says underlying data may be requested.
2. **HARBOR is a fallback request**, particularly for treatment-associated nAMD trajectories, if the sponsor can provide raw OCT images, dates, stable patient-eye linkage, treatment records, and data-use permission. The registry’s repeated OCT-derived thickness outcomes alone are insufficient for image-based comparison.
3. **Duke/RPEDC is a promising author inquiry** for its publicly described OCT images and segmentation labels. Verify whether the particular downloadable resource includes longitudinal follow-up before relying on it.
4. **OCTA-500 is a technical-method fallback only** for OCT/OCTA volume handling, laterality, and segmentation; it is not confirmed as a longitudinal AMD cohort.
5. If A2A/HARBOR/Duke image access is denied or does not include the needed linkage, **no fully open, verified longitudinal same-eye AMD OCT dataset was established by this audit**. Do not substitute unrelated images or invent chronology.

## Part C — Recommended plan

### 1. Retain OCTDL for its current purpose

Continue using OCTDL for the existing image-level AMD classifier and its patient-disjoint train/validation/test evaluation. Keep longitudinal work in a separate, source-traceable dataset and evaluation track. Do not add OCTDL images to an invented sequence based on filename suffixes, patient ID repetition, `year`, or server upload timestamps.

### 2. Request A2A data before implementing longitudinal analysis

Contact the A2A study/data custodians through the [ClinicalTrials.gov record](https://clinicaltrials.gov/study/NCT00734487) / listed study contacts and request written confirmation of:

- Whether raw or deidentified OCT volumes/B-scans are available, not just derived measurements.
- Stable deidentified participant IDs and eye laterality shared across visits.
- Actual acquisition dates or a documented visit index and study-timepoint mapping.
- OCT device, scan protocol, image quality, and cross-visit acquisition consistency.
- AMD grades and adjudicated outcomes at follow-up, including definitions for CNV, drusen, GA, and visual-acuity change.
- Treatment history and missing-visit handling.
- Data-use agreement, ethics/IRB requirements, privacy controls, permitted storage, and redistribution restrictions.
- Whether the 2- and 5-year outcome measurements correspond to images available to researchers.

Proceed only after confirming that the package includes actual repeated image data plus adequate linkage. A statement that a dataset is available “upon request” is not a guarantee of approval or image-level access.

### 3. Use HARBOR as a conditional fallback; do not assume raw images

The HARBOR trial has a well-documented repeated-measurement schedule and AMD treatment context, but the public registry evidence reviewed here is not evidence that its OCT image files are downloadable. Ask the sponsor/data-sharing route specifically for serial OCT images and same-eye identifiers. If only summary measurements or tabular participant data are available, that can support a separate tabular analysis but **not** OCT-image registration or visual comparison.

If neither study provides suitable image series, the honest fallback is to defer longitudinal claims and continue with OCTDL classification. A prospective collection would require appropriate institutional review, consent/legal basis, genuine scan dates and laterality, secure handling, and a defined follow-up protocol; it is not a reason to create synthetic patient histories.

### 4. Leakage-safe evaluation design

Before any future training or comparison:

1. Define an explicit observation unit: participant → eye → visit → scan/volume → B-scan. Keep source IDs and provenance in a protected, documented mapping.
2. Verify that every compared pair is the **same participant and same eye**, and that visits are ordered by verified acquisition date or protocol timepoint.
3. Group all eyes, visits, volumes, and slices from a participant into one train/validation/test partition. Do not split B-scans or visits from the same person across partitions.
4. For future-outcome prediction, select an index/baseline time and construct features only from data available by that time. Do not allow later scans, later labels, or post-outcome treatments to leak into baseline features.
5. Reserve participants—not visits—as the independent test cohort. If suitable independent studies are available, perform external validation across cohort/site/device.
6. Report participant count and eye/visit count separately; define outcome horizon, missingness, treatment exposure, scanner/protocol differences, and confidence intervals.
7. For image-derived change, validate repeatability, registration, segmentation/measurement error, and protocol comparability before interpreting a numeric difference as biological change.

### 5. Outcome that can be demonstrated honestly

With verified paired scans and dates, an initial prototype could display a **descriptive, per-eye change in a defined OCT measurement between documented visits**, alongside the actual visit dates, measurement method, and uncertainty/quality flags. Label it as measured change in the recorded images. Do not call a classifier probability a risk score, and do not call a measured difference a clinical progression prediction without validated clinical outcomes and external evaluation.

## Sources consulted

1. Kulyabin et al. (2024). “OCTDL: Optical Coherence Tomography Dataset for Image-Based Deep Learning Methods.” *Scientific Data* 11, 365. [DOI](https://doi.org/10.1038/s41597-024-03182-7); [IEEE DataPort dataset description](https://ieee-dataport.org/documents/octdl-optical-coherence-tomography-dataset-image-based-deep-learning-methods).
2. U.S. National Library of Medicine. [AREDS 2 Ancillary Spectral Domain Optical Coherence Tomography Study, NCT00734487](https://clinicaltrials.gov/study/NCT00734487).
3. National Eye Institute. [Age-Related Eye Disease Studies (AREDS/AREDS2)](https://www.nei.nih.gov/eye-health-information/clinical-trials/age-related-eye-disease-studies-aredsareds2).
4. U.S. National Library of Medicine. [HARBOR ranibizumab study, NCT00891735](https://clinicaltrials.gov/study/NCT00891735).
5. Duke/RPEDC. [Ophthalmology 2013 dataset landing page](http://people.duke.edu/~sf59/RPEDC_Ophth_2013_dataset.htm); Farsiu et al. (2014), “Quantitative Classification of Eyes with and without Intermediate Age-related Macular Degeneration Using Optical Coherence Tomography,” *Ophthalmology* 121(1):162–172. Dataset page was discovered through the indexed dataset description; direct host access was blocked in this review.
6. Li et al. (2024). “OCTA-500: A Retinal Dataset for Optical Coherence Tomography Angiography Study.” *Medical Image Analysis*, 103092. [IEEE DataPort OCTA-500 description and access instructions](https://ieee-dataport.org/open-access/octa-500).
7. UK Biobank. [Imaging data: retinal imaging](https://www.ukbiobank.ac.uk/enable-your-research/about-our-data/imaging-data/retinal-imaging). Page returned HTTP 403 during this review; relevant OCT contents and access terms are not asserted here.

## Final recommendation

**First request the A2A study data and confirm raw serial OCT images, same-eye identifiers, visit timing, outcomes, and terms. Keep OCTDL for classification. Do not implement or demonstrate longitudinal progression until genuine linked follow-up scans and their provenance are confirmed.**
