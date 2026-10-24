# Step 6D — False-Negative Error Analysis and Model Improvement Plan

**Project:** AMD Digital Twin  
**Scope:** Read-only analysis of the existing held-out OCTDL predictions and a proposed validation-only experiment plan  
**Date:** 2026-10-24  
**Positive class:** AMD (`target_amd = 1`)  
**Current decision threshold:** AMD probability `>= 0.5`

## Executive summary

The current checkpoint was run on the existing 307-image test split using the existing inference pipeline. The 21 AMD false-negative rows belong to 14 patient IDs; 16 of the rows are metadata-labeled early AMD / drusen, and 5 are intermediate AMD / MNV-suspected. Six patient IDs have multiple false-negative images, so the 21 errors are not 21 independent patient outcomes.

All 21 false-negative source images were viewed locally, without external image services. Four correctly classified early-AMD images were also viewed for comparison. This was a cautious visual review, not clinical interpretation or relabeling. No consistent visual or automated-quality feature was identified that distinguishes all false negatives from correctly classified examples.

Among early-AMD test images, false negatives had a lower median source-image size (882 × 322 pixels) than correctly classified images (1,100 × 409 pixels); their median aspect ratios were nearly the same. None of the false negatives was flagged by the available automated quality checks. These are descriptive observations only and do not establish that resolution or image quality caused errors.

The most appropriate first experiment is a label-definition and class/subtype audit, followed by a controlled training-only class-weighting comparison. Importantly, the held-out test results and specific examples have now been examined in both the Step 6C audit and this analysis. The existing test split must not be used to select among future experiments or thresholds. A fresh untouched patient-level test cohort or a separately secured external cohort is needed for a new confirmatory evaluation.

## 1. Evaluation data and interpretation

The source for this analysis is `data/Processed/test.csv` and the probabilities reproduced from `models/baseline_efficientnetb0_best.pth` using `backend.model_service.ModelService`. The corresponding Step 6C results are in [AMD_FALSE_NEGATIVE_AUDIT.md](./AMD_FALSE_NEGATIVE_AUDIT.md).

- Test split: 307 images from 123 patient IDs.
- AMD-positive images: 174.
- Current false negatives: 21 images from 14 patient IDs.
- AMD-positive class: `target_amd = 1`; an AMD probability of at least 0.5 maps to AMD.
- Image preprocessing and model weights were not changed.

Rows are images. Since several patient IDs have multiple images in the split, image-level counts and medians are descriptive and do not represent independent patients.

## 2. All false-negative examples

Dimensions are source image width × height in pixels from the quality-inspection metadata. “Automated indicators” summarizes available flags: blank/near-blank, unusual aspect ratio, unusual dimensions, and `potentially_unusual`. All false-negative rows had **No** for each of these flags. Mean intensity, standard deviation, and entropy are the recorded grayscale image statistics; they are not clinical quality scores.

| Source image | Patient ID | Manifest subtype / condition | AMD probability | Dimensions | Mean / SD intensity | Entropy | Blank / unusual AR / unusual dimensions / potential |
|---|---:|---|---:|---:|---:|---:|---|
| [amd_1521791_2.jpg](data/raw/OCTDL/AMD/amd_1521791_2.jpg) | 1521791 | early / drusen | 0.4079 | 1101 × 410 | 60.88 / 39.99 | 7.047 | No / No / No / No |
| [amd_1521791_3.jpg](data/raw/OCTDL/AMD/amd_1521791_3.jpg) | 1521791 | early / drusen | 0.4586 | 1144 × 390 | 57.29 / 50.83 | 6.798 | No / No / No / No |
| [amd_1781906_1.jpg](data/raw/OCTDL/AMD/amd_1781906_1.jpg) | 1781906 | early / drusen | 0.2782 | 618 × 228 | 88.83 / 39.81 | 6.600 | No / No / No / No |
| [amd_2006405_1.jpg](data/raw/OCTDL/AMD/amd_2006405_1.jpg) | 2006405 | early / drusen | 0.2637 | 880 × 321 | 53.45 / 46.38 | 6.798 | No / No / No / No |
| [amd_2989246_1.jpg](data/raw/OCTDL/AMD/amd_2989246_1.jpg) | 2989246 | early / drusen | 0.2892 | 882 × 322 | 56.61 / 46.45 | 7.052 | No / No / No / No |
| [amd_2989246_2.jpg](data/raw/OCTDL/AMD/amd_2989246_2.jpg) | 2989246 | early / drusen | 0.4718 | 882 × 322 | 56.13 / 45.73 | 6.944 | No / No / No / No |
| [amd_2989246_3.jpg](data/raw/OCTDL/AMD/amd_2989246_3.jpg) | 2989246 | early / drusen | 0.4084 | 882 × 322 | 59.63 / 47.02 | 7.112 | No / No / No / No |
| [amd_5078997_1.jpg](data/raw/OCTDL/AMD/amd_5078997_1.jpg) | 5078997 | early / drusen | 0.2674 | 1101 × 411 | 56.41 / 47.45 | 7.118 | No / No / No / No |
| [amd_5410141_3.jpg](data/raw/OCTDL/AMD/amd_5410141_3.jpg) | 5410141 | intermediate / MNV_suspected | 0.2434 | 1103 × 411 | 53.17 / 43.40 | 6.850 | No / No / No / No |
| [amd_5418162_1.jpg](data/raw/OCTDL/AMD/amd_5418162_1.jpg) | 5418162 | early / drusen | 0.4100 | 739 × 309 | 50.26 / 50.76 | 7.025 | No / No / No / No |
| [amd_5998231_1.jpg](data/raw/OCTDL/AMD/amd_5998231_1.jpg) | 5998231 | intermediate / MNV_suspected | 0.3723 | 579 × 210 | 64.27 / 49.55 | 7.357 | No / No / No / No |
| [amd_5998231_2.jpg](data/raw/OCTDL/AMD/amd_5998231_2.jpg) | 5998231 | intermediate / MNV_suspected | 0.4334 | 579 × 211 | 54.33 / 44.68 | 7.148 | No / No / No / No |
| [amd_6497902_2.jpg](data/raw/OCTDL/AMD/amd_6497902_2.jpg) | 6497902 | early / drusen | 0.3942 | 614 × 230 | 89.07 / 40.65 | 6.521 | No / No / No / No |
| [amd_6554588_1.jpg](data/raw/OCTDL/AMD/amd_6554588_1.jpg) | 6554588 | early / drusen | 0.2316 | 741 × 314 | 45.79 / 48.05 | 6.876 | No / No / No / No |
| [amd_6554588_2.jpg](data/raw/OCTDL/AMD/amd_6554588_2.jpg) | 6554588 | early / drusen | 0.2307 | 738 × 313 | 45.55 / 44.22 | 6.823 | No / No / No / No |
| [amd_6698539_1.jpg](data/raw/OCTDL/AMD/amd_6698539_1.jpg) | 6698539 | early / drusen | 0.3806 | 1101 × 412 | 58.30 / 47.30 | 7.174 | No / No / No / No |
| [amd_7240307_1.jpg](data/raw/OCTDL/AMD/amd_7240307_1.jpg) | 7240307 | intermediate / MNV_suspected | 0.3421 | 882 × 314 | 55.52 / 49.63 | 6.944 | No / No / No / No |
| [amd_7240307_4.jpg](data/raw/OCTDL/AMD/amd_7240307_4.jpg) | 7240307 | intermediate / MNV_suspected | 0.3421 | 882 × 314 | 55.52 / 49.63 | 6.944 | No / No / No / No |
| [amd_8280980_2.jpg](data/raw/OCTDL/AMD/amd_8280980_2.jpg) | 8280980 | early / drusen | 0.4905 | 579 × 211 | 52.47 / 46.16 | 7.114 | No / No / No / No |
| [amd_9069910_2.jpg](data/raw/OCTDL/AMD/amd_9069910_2.jpg) | 9069910 | early / drusen | 0.4568 | 1101 × 410 | 77.87 / 40.19 | 7.166 | No / No / No / No |
| [amd_9069910_5.jpg](data/raw/OCTDL/AMD/amd_9069910_5.jpg) | 9069910 | early / drusen | 0.2763 | 1099 × 409 | 58.76 / 49.62 | 7.193 | No / No / No / No |

No false-negative examples were relabeled or altered. Filenames link to the existing local source images; no contact sheet or image copy was created.

## 3. Comparison with correctly classified AMD images

### Metadata comparison for early AMD

The AMD test rows labeled `early` number 47: 16 false negatives and 31 correctly classified AMD images.

| Descriptive measure | Early false negatives (n=16) | Correctly classified early AMD (n=31) |
|---|---:|---:|
| Distinct patient IDs | 11 | 15 |
| Median AMD probability | 0.3874 | 0.6874 |
| Median source dimensions | 882 × 322 | 1100 × 409 |
| Median aspect ratio | 2.686 | 2.685 |
| Median mean intensity | 56.95 | 60.50 |
| Median intensity SD | 46.42 | 48.24 |
| Median entropy | 7.036 | 7.109 |
| Potentially unusual quality flags | 0 | 0 |
| Blank / near-blank flags | 0 | 0 |
| Unusual aspect-ratio flags | 0 | 0 |

The false-negative group has a lower median image size, while the aspect-ratio medians are essentially the same. These summaries do not adjust for patient clustering, source subtype within the early group, or any other confounders. Resolution may be worth testing because the current preprocessing resizes all images to 224 × 224, but these data do not demonstrate that lower source resolution caused a false negative.

For context, the 5 intermediate false negatives came from 3 patient IDs; their median dimensions were 882 × 314, versus 1101 × 390 among the 27 correctly classified intermediate AMD images. All 95 late AMD test images were classified AMD at the current threshold. These are small, dataset-specific descriptive counts, not estimates of subtype performance in a target population.

### Local visual inspection

All 21 false-negative source images were opened and visually inspected locally. Four correctly classified early-AMD images were also inspected: `amd_6497902_1.jpg`, `amd_2009727_1.jpg`, `amd_2294375_2.jpg`, and `amd_6698539_4.jpg`. The first and fourth controls share patient IDs with false-negative rows, allowing a within-ID image comparison without assuming a date or scan order.

The inspected images show grayscale OCT B-scans with variation in dimensions, contrast, layer appearance, and visible shadow/band artifacts. Such visible variation was not unique to the false negatives; similar general scan features were also present in correctly classified examples. No consistent, reliable visual pattern explaining the model errors was identified. This review was not performed by a retinal specialist, and no diagnosis, grade, or label decision is made here. The local filenames and IDs do not establish chronology or distinct visits.

### Repeated images and patient clustering

The 21 false-negative rows span 14 patient IDs. Six patient IDs have more than one false-negative image:

| Patient ID | False-negative image count |
|---:|---:|
| 1521791 | 2 |
| 2989246 | 3 |
| 5998231 | 2 |
| 6554588 | 2 |
| 7240307 | 2 |
| 9069910 | 2 |

A byte-level SHA-256 check found no exactly identical image files among these 21 rows. Even when images are not byte-identical, multiple images from one patient may be correlated. Thus, treating all 21 rows as independent would overstate the amount of evidence. Patient-level grouping should be retained, and patient-clustered uncertainty estimates or patient-level summaries should accompany future image-level metrics.

## 4. What the current evidence can and cannot say

### Observed

- The false negatives in this test split are metadata-labeled early or intermediate AMD; no late AMD rows were missed.
- Early false negatives have a lower median source-image size than correctly classified early AMD in this split.
- The automated quality flags inspected here do not mark any false-negative row as blank, unusual-aspect-ratio, unusual-dimension, or potentially unusual.
- The training notebook computes `POS_WEIGHT = non_amd_count / amd_count`. On its 1,428 training images, this is `570 / 858 = 0.664336`; the training images are approximately 60.1% AMD and 39.9% Non-AMD.
- The existing split is patient-grouped by the supplied patient IDs, but repeated images remain within each partition.

### Not established

- That source resolution, image quality, disease subtype, or label ambiguity caused any individual model error.
- That the OCTDL labels or subtype assignments are clinically correct or independently adjudicated.
- That all repeated records for a patient are separate visits or independent scans.
- That changing class weighting, preprocessing, model parameters, or threshold will improve performance on new patients.
- Clinical safety, calibration, or performance outside this held-out dataset.

## 5. Proposed experiments

No experiments below were run. Any changes described are proposals for a future controlled study; they are not changes to the current model.

| Priority / experiment | Hypothesis | Required changes | Validation metric(s) | Leakage risk and safeguards | Evaluation without test-set tuning |
|---|---|---|---|---|---|
| **1. Verify label definitions and class/subtype balance** | The binary AMD mapping and subtype semantics may conceal meaningful differences (for example, early drusen versus `MNV_suspected`); clarifying definitions may identify a data or task-definition issue before model work. | Review OCTDL documentation and the source label mapping with an appropriately qualified supervisor/reviewer. Tabulate train/validation class and subtype counts by patient. Do not alter any current labels; record unresolved/ambiguous definitions. | Patient counts and image counts by class/subtype; per-subtype validation sensitivity, specificity, precision, and confidence intervals where feasible. Treat labels as supplied unless an authorized adjudication protocol exists. | Reviewing test examples or using test outcomes to redefine labels would leak test information. Maintain a written label specification based on source documentation; conduct any formal label review blinded to model predictions and keep test data out of rule development. | Finalize definitions from source documentation and training/validation data only. Freeze them before any evaluation on a newly reserved test cohort. |
| **2. Training-only AMD class-weight/loss comparison** | The current positive-class loss weight is below 1 despite AMD being the majority class. A controlled comparison with unweighted BCE and alternative weights calculated only from training labels may change the sensitivity/precision trade-off. Whether it helps is unknown. | Train controlled variants with the same patient split, architecture, initialization policy, preprocessing, training schedule, and random seeds; vary only the loss weighting (include the current baseline). Calculate all weights from training patients/images only. Keep threshold fixed at 0.5 for the primary loss comparison. | Validation ROC-AUC and PR-AUC; AMD sensitivity, specificity, precision, and F1 at the fixed threshold; report patient-level and image-level summaries. | Computing weights from validation/test labels, resampling before patient splitting, or allowing a patient’s images across partitions risks leakage. Split by patient first; derive weights from training only; use validation only for comparison. | Pre-register a small set of loss settings, repeat with fixed seeds, select using validation-only criteria, then evaluate the selected configuration on a new untouched patient cohort. Do not pick settings from test results. |
| **3. Source-resolution and preprocessing ablation** | Resizing heterogeneous source scans to 224 × 224 may discard detail in some images. The lower median size among early false negatives is a reason to investigate, not evidence of causation. | Compare the current deterministic preprocessing with a small, pre-specified set of resolution/aspect-ratio-preserving alternatives. Apply each consistently to training and validation; maintain identical augmentation policy and model capacity where possible. | Validation ROC-AUC/PR-AUC, early-AMD sensitivity and specificity, fixed-threshold metrics, and performance stratified by source dimensions. Include patient-clustered uncertainty. | Choosing a resolution after inspecting test errors or tuning the transform on test images leaks test information. Do not use test errors as design feedback; fit any learned preprocessing statistics on training only. | Select from patient-grouped validation results only and lock the preprocessing before evaluation on new, untouched patients. |
| **4. Validation-only threshold comparison** | A lower cutoff may increase sensitivity while increasing false positives; a threshold chosen on validation data may offer a different operating trade-off than the current fixed 0.5 cutoff. | Do not change model weights. Choose a candidate threshold using validation probabilities only and a pre-specified decision criterion. Report the full validation sensitivity/specificity trade-off rather than only the selected point. | Validation sensitivity, specificity, precision, F1, PR curve, and calibration summaries; state the criterion used to choose the threshold. | Selecting the threshold from test labels or reporting only favorable cutoffs is direct test leakage. The existing test outcomes have already been inspected in Step 6C and 6D. | Freeze the threshold after validation; assess it once on an additional untouched patient-level test cohort. Do not use the existing test split to adjust it. A lower threshold is not evidence of clinical safety. |
| **5. Patient-grouped validation stability check** | A single patient-grouped train/validation assignment may not provide stable performance estimates, particularly for subtype-specific sensitivity. | Use repeated patient-grouped cross-validation or multiple pre-defined patient-level folds for development comparisons, keeping all records for a patient in the same fold. Keep a final external or newly held-out patient cohort locked. | Fold-level and pooled sensitivity, specificity, ROC-AUC/PR-AUC, subtype results, and patient-clustered confidence intervals; report variability rather than only a best fold. | Image-level random folds leak related images across partitions. Build folds on patient IDs before distributing rows; ensure all preprocessing, sampling, and training are fit within each training fold. | Use grouped folds for development and model selection only. Reserve a separate, untouched patient cohort for final evaluation after choices are frozen. |

## 6. Recommended first experiment

Start with **verification of the source label definitions and a patient-level class/subtype balance audit**, without changing labels or training. This is the lowest-risk step and directly informs how to interpret the observed concentration of false negatives among metadata-labeled early AMD. It can clarify whether `AMD`, `early`, `intermediate`, `late`, and `MNV_suspected` have precise source-defined meanings and whether the binary task appropriately combines them. It also exposes imbalance at the patient level, rather than relying only on image counts.

The training notebook currently uses a positive-class weight of approximately 0.664. After the label and balance audit, the next controlled experiment should compare that baseline with a small, pre-specified set of alternative training-only loss weights using the existing patient-grouped validation split. Do not infer that the current weight caused the errors; the validation experiment must test that hypothesis.

## 7. Test-set governance for future work

The existing test split is patient-disjoint from train and validation according to the supplied IDs, but it is no longer an untouched confirmatory set: its aggregate results, individual false-negative examples, threshold trade-offs, and metadata have been inspected and documented. Therefore:

1. Do not tune future weights, preprocessing, label rules, model choices, or thresholds using this split.
2. Use the training split for fitting and the existing patient-grouped validation split (or grouped cross-validation within development data) for development choices.
3. Freeze the experiment protocol and selected configuration before any final assessment.
4. Prefer a new, independently reserved patient-level test set or external dataset for confirmatory evaluation. If no new cohort is available, report that current test performance is exploratory and has been examined during error analysis.

All future partitions must keep every image for a supplied patient ID together. Because patients may have multiple images, report both image-level and patient-aware metrics and uncertainty.

## 8. Inspection and change record

### Inspected or executed

- Read `AMD_FALSE_NEGATIVE_AUDIT.md` and confirmed the checkpoint, label mapping, split, and prior metrics.
- Re-ran the existing checkpoint on all 307 test images to summarize false-negative and correctly classified early-AMD metadata. No prediction or evaluation output files were written.
- Joined predictions to `data/Processed/quality_inspection/image_quality_metrics.csv`.
- Opened all 21 false-negative OCT images locally and four correctly classified early-AMD examples. No external image service was used; no contact sheet or copied image file was created.
- Checked false-negative patient group counts and compared SHA-256 hashes; no exact byte-identical false-negative image pair was found.
- Inspected training choices in `notebooks/07_model_training.ipynb`, evaluation procedure in `notebooks/08_model_evaluation.ipynb`, and existing result artifacts under `results/evaluation/`.

### Not performed

- No expert clinical image review or label adjudication.
- No training, fine-tuning, threshold change, or model selection.
- No change to source code, weights, datasets, thresholds, split files, evaluation artifacts, or patient records.
- No claim that any observed feature caused the model errors or that any proposed experiment improves clinical performance.

Only this report, `AMD_ERROR_ANALYSIS_AND_EXPERIMENT_PLAN.md`, was created.
