# Step 6C — AMD False-Negative and Evaluation Audit

**Project:** AMD Digital Twin  
**Scope:** Read-only reproduction and audit of the existing OCTDL held-out test evaluation  
**Date:** 2026-10-24  
**Positive class:** AMD (`target_amd = 1`)  
**Decision threshold audited:** AMD probability `>= 0.5`

## Executive summary

The current checkpoint was successfully loaded and evaluated on all 307 rows of the saved test split using the existing deterministic inference preprocessing and binary label mapping. The reproduced confusion matrix and metrics exactly match the saved evaluation artifacts. At the existing 0.5 threshold, the model produced **21 AMD false negatives** among 174 AMD-labeled test images.

The three saved split CSVs and `split_patient_overlap.csv` show no patient-ID overlap across train, validation, and test. The training notebook groups images by patient before assigning splits. Metrics here are image-level, however, and repeated images from the same patient within a split are not statistically independent.

False negatives in this test set were metadata-labeled early or intermediate AMD. None was flagged by the existing simple image-quality checks. This does not establish that quality or label ambiguity played no role: the available quality metrics are limited automated indicators, and no independent clinical relabeling or systematic visual review was performed.

Lower thresholds increase sensitivity on these same test predictions but substantially increase false positives. The threshold examples below are descriptive only; they do not recommend or implement a new threshold and do not establish clinical safety.

## 1. Data, checkpoint, and label mapping

| Item | Inspected or executed evidence |
|---|---|
| Test split | `data/Processed/test.csv`: 307 image rows, 123 unique patient IDs |
| Test labels | 133 Non-AMD (`target_amd = 0`), 174 AMD (`target_amd = 1`) |
| Test image availability | All 307 image paths existed and were opened for inference |
| Checkpoint | `models/baseline_efficientnetb0_best.pth` |
| Checkpoint version | `baseline_efficientnetb0_best:epoch-12` |
| Device used | CPU |
| Class mapping | `CLASS_NAMES = ["Non-AMD", "AMD"]`; the sigmoid output is AMD probability |
| Prediction rule | AMD when probability is greater than or equal to 0.5; otherwise Non-AMD |
| Preprocessing | Existing deterministic `preprocess_pil_image` path: grayscale, resize to 224 × 224, convert to three identical RGB channels, ImageNet normalization |

The checkpoint loaded successfully through `backend.model_service.ModelService`; the model was ready and in evaluation mode. This service constructs the binary EfficientNetB0 classifier, loads the checkpoint state dictionary strictly, and returns the sigmoid AMD probability. The evaluation notebook independently documents an EfficientNetB0 with a one-unit output head, strict checkpoint state loading, evaluation mode, and sigmoid probabilities.

## 2. Patient-level split audit

Patient IDs were read from the saved train, validation, and test CSVs and compared directly. `data/Processed/split_patient_overlap.csv` independently records zero overlap.

| Pair of splits | Shared patient IDs |
|---|---:|
| Train / validation | 0 |
| Train / test | 0 |
| Validation / test | 0 |

The split notebook (`notebooks/04_patient_level_split.ipynb`) validates patient IDs, assigns whole patient groups to partitions, and maps all rows for a patient to the same partition. The training notebook (`notebooks/07_model_training.ipynb`) also checks patient sets and states that test data are not used for training or validation monitoring.

This establishes separation according to the supplied OCTDL patient IDs. It cannot establish that those IDs are complete or error-free identifiers of real-world patient identity. It also does not make each image-level test observation independent: multiple images from one patient remain within a partition.

## 3. Reproduced held-out test results

Predictions were run on all 307 rows from `data/Processed/test.csv` using the existing checkpoint, `ModelService.predict_pil_image`, and the existing inference preprocessing. The saved outputs in `results/evaluation/` were not regenerated or modified.

Rows are actual labels and columns are predicted labels:

| Actual \ Predicted | Non-AMD | AMD |
|---|---:|---:|
| Non-AMD | 107 (TN) | 26 (FP) |
| AMD | 21 (FN) | 153 (TP) |

AMD is the positive class. Metrics are calculated from the reproduced predictions:

| Metric | Reproduced value |
|---|---:|
| AMD precision | 0.8547 |
| AMD recall / sensitivity | 0.8793 |
| Specificity | 0.8045 |
| AMD F1-score | 0.8669 |
| ROC-AUC | 0.9220 |
| AMD false-negative count | **21 of 174 AMD images** |

These are metrics on this saved test split, not clinical performance estimates. No confidence intervals or external validation are included.

### Agreement with existing evaluation artifacts

The reproduced confusion matrix is `[[107, 26], [21, 153]]`, matching `results/evaluation/confusion_matrix.csv`. The reproduced precision, recall, F1-score, and ROC-AUC match `results/evaluation/test_metrics.csv` and `results/evaluation/classification_report.csv` to the stored precision. The saved text report also matches the per-class results.

## 4. False-negative review

The 21 false-negative image rows correspond to 14 distinct patient IDs. Available manifest metadata identifies 16 as early AMD / drusen and 5 as intermediate AMD / MNV-suspected. The test-set AMD subtype denominators and image-level sensitivities were:

| Manifest subtype | AMD test images | False negatives | Image-level sensitivity |
|---|---:|---:|---:|
| Early | 47 | 16 | 0.6596 |
| Intermediate | 32 | 5 | 0.8438 |
| Late | 95 | 0 | 1.0000 |

This is an observed distribution in this test set, not evidence that the model generalizes better to late AMD. Images are clustered by patient, subtype labels come from dataset metadata, and the counts are modest. The local metadata does not include independent adjudication of the image-level diagnosis.

### Image-quality metadata

The existing quality-inspection table records automated indicators including blank/near-blank status, unusual aspect ratio/dimensions, intensity statistics, and entropy. None of the 21 false-negative rows was flagged as potentially unusual, blank/near-blank, or unusual-aspect-ratio in those fields. Six of all 174 AMD-labeled test images were marked potentially unusual, and none of those six was a false negative.

These checks do not rule out clinically meaningful acquisition artifacts, subtle image-quality problems, ambiguous labels, or other visual factors. A systematic expert image review was **not performed**. The available data do not support a claim that label ambiguity caused these errors.

### False-negative examples

The table lists the 21 false-negative OCTDL manifest filenames and their reproduced AMD probabilities. Values below 0.5 were classified Non-AMD by the current rule. Subtype and condition are the manifest metadata, not independent clinical adjudications.

| File | Manifest subtype / condition | AMD probability |
|---|---|---:|
| `amd_1521791_2` | Early / drusen | 0.4079 |
| `amd_1521791_3` | Early / drusen | 0.4586 |
| `amd_1781906_1` | Early / drusen | 0.2782 |
| `amd_2006405_1` | Early / drusen | 0.2637 |
| `amd_2989246_1` | Early / drusen | 0.2892 |
| `amd_2989246_2` | Early / drusen | 0.4718 |
| `amd_2989246_3` | Early / drusen | 0.4084 |
| `amd_5078997_1` | Early / drusen | 0.2674 |
| `amd_5410141_3` | Intermediate / MNV_suspected | 0.2434 |
| `amd_5418162_1` | Early / drusen | 0.4100 |
| `amd_5998231_1` | Intermediate / MNV_suspected | 0.3723 |
| `amd_5998231_2` | Intermediate / MNV_suspected | 0.4334 |
| `amd_6497902_2` | Early / drusen | 0.3942 |
| `amd_6554588_1` | Early / drusen | 0.2316 |
| `amd_6554588_2` | Early / drusen | 0.2307 |
| `amd_6698539_1` | Early / drusen | 0.3806 |
| `amd_7240307_1` | Intermediate / MNV_suspected | 0.3421 |
| `amd_7240307_4` | Intermediate / MNV_suspected | 0.3421 |
| `amd_8280980_2` | Early / drusen | 0.4905 |
| `amd_9069910_2` | Early / drusen | 0.4568 |
| `amd_9069910_5` | Early / drusen | 0.2763 |

False-negative probabilities ranged from 0.2307 to 0.4905, with a median of 0.3723. Thus, some errors were near the 0.5 cutoff and others were not. Repeated false-negative images occur for several patient IDs; the listed images are not 21 independent patients.

## 5. Descriptive threshold trade-offs

The following table applies alternative cutoffs to the same already-computed held-out probabilities. It shows the mechanical sensitivity/false-positive trade-off; it is **not** a threshold-selection exercise or a proposed deployment setting.

| AMD threshold | TP | FN | FP | TN | Sensitivity | Specificity |
|---:|---:|---:|---:|---:|---:|---:|
| 0.50 (current) | 153 | 21 | 26 | 107 | 0.8793 | 0.8045 |
| 0.40 | 161 | 13 | 52 | 81 | 0.9253 | 0.6090 |
| 0.30 | 166 | 8 | 83 | 50 | 0.9540 | 0.3759 |
| 0.20 | 174 | 0 | 120 | 13 | 1.0000 | 0.0977 |

As the cutoff falls, fewer AMD images are missed in this sample, while more Non-AMD images are classified AMD. The table does not establish an appropriate clinical operating point, calibration, safety, or net benefit. The deployed threshold remains unchanged at 0.5.

## 6. Test-set use and model-selection audit

In the inspected training notebook, the best checkpoint is selected using validation ROC-AUC (with validation loss as fallback), and the test set is explicitly excluded from training and validation monitoring. The inspected evaluation notebook loads the saved checkpoint once, uses the fixed 0.5 rule, calculates test metrics, and states that test evaluation was performed once with no retraining or tuning. No test-set-based model-selection or threshold-tuning decision is evident in these inspected artifacts.

This conclusion is limited to the available notebooks and reports. Whether any unrecorded experiments, external scripts, or prior informal decisions used the test set is **unverified**. The lower-threshold table in this audit is a descriptive, post-hoc calculation on test labels and must not be used to select or claim a new threshold. Any future threshold selection should be performed using training/validation data (or a separately designated calibration set), followed by a genuinely untouched evaluation set.

## 7. Commands and procedure executed

From the project root, the inference reproduction was executed as an inline PowerShell here-string piped to the existing virtual-environment interpreter. The command invocation was:

```powershell
.\.venv\Scripts\python.exe -
```

The Python source was supplied through standard input in the PowerShell here-string and was not saved as a standalone script. It loaded `data/Processed/test.csv`, instantiated `backend.model_service.ModelService`, opened every listed image with Pillow, collected each result's AMD probability, and calculated the confusion matrix, precision, sensitivity, specificity, F1-score, ROC-AUC, threshold scenarios, and false-negative metadata summaries. It did not write prediction files or change the saved evaluation results.

The overlap check was also run as an inline Python script through the same interpreter, reading each saved split CSV and counting patient-ID set intersections. The saved overlap CSV was inspected as well.

No packages were installed; no source code, checkpoint, threshold, dataset, split file, evaluation artifact, or patient record was changed. Only `AMD_FALSE_NEGATIVE_AUDIT.md` was created.

## 8. Evidence and limitations

### Executed

- Loaded the current checkpoint successfully on CPU.
- Reproduced predictions for all 307 held-out test images.
- Confirmed that all test image paths existed.
- Reproduced metrics and confusion matrix exactly against saved evaluation artifacts.
- Recomputed patient-ID intersections from the three split CSVs and confirmed zero overlap.
- Joined false-negative rows to manifest subtype/condition and automated quality metadata.
- Calculated descriptive threshold trade-offs without changing model behavior.

### Inspected

- `notebooks/04_patient_level_split.ipynb`
- `notebooks/07_model_training.ipynb`
- `notebooks/08_model_evaluation.ipynb`
- `backend/model_service.py`
- `src/oct_preprocessing.py`
- `data/Processed/train.csv`
- `data/Processed/validation.csv`
- `data/Processed/test.csv`
- `data/Processed/split_patient_overlap.csv`
- `data/Processed/split_report.csv`
- `data/Processed/quality_inspection/image_quality_metrics.csv`
- `data/Processed/quality_inspection/flagged_images.csv`
- `results/evaluation/test_metrics.csv`
- `results/evaluation/confusion_matrix.csv`
- `results/evaluation/classification_report.csv`
- `results/evaluation/classification_report.txt`

### Not verified / limitations

- Clinical correctness of image labels or AMD subtype labels.
- Expert visual adjudication of the 21 false-negative images.
- External-site or prospective performance, probability calibration, or clinical utility.
- Completeness of the source patient identifiers beyond the manifest.
- Whether any untracked experiments or informal decisions used the test split.
- Whether any threshold other than 0.5 is appropriate for any clinical context.

The model remains a research prototype, not a diagnostic tool. A higher observed sensitivity at a lower cutoff does not make it clinically safe.
