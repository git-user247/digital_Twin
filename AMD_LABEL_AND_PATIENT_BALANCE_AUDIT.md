# Step 6E — OCTDL Label Definition and Patient-Level Balance Audit

**Project:** AMD Digital Twin  
**Scope:** Read-only audit of local OCTDL labels, saved patient-grouped partitions, and training loss weighting  
**Date:** 2026-10-24  
**Changes:** No training, relabeling, source/data changes, or split regeneration performed

## Executive summary

The local label-preparation notebook sets `target_amd = 1` only when the source `disease` value is exactly `"AMD"`; every other source disease value maps to `target_amd = 0`. The original `disease`, `subcategory`, and `condition` fields are retained in the manifest. Within the AMD rows, this project does not remap subtype or condition: the observed combinations are `early` / `drusen`, `intermediate` / `MNV_suspected`, and `late` / `MNV`.

The local dataset directory contains the OCTDL label CSV and images, but no standalone dataset guide, paper, or label-definition document. A prior project research report cites the dataset paper and listing, but those source documents are not stored in the workspace; detailed official meanings of the disease/subtype/condition labels therefore remain **unverified from local sources**.

All 2,062 usable records in the saved train, validation, and test files were counted. The supplied patient IDs have zero overlap across partitions. Binary patient counts below use the split notebook's patient-level stratification convention: a patient is AMD-positive if any usable image for that patient has `target_amd = 1`. One test patient has both AMD and DME-labeled images, so “AMD-bearing” and “Non-AMD-bearing” patient sets overlap for that patient; the mutually exclusive binary count assigns that patient to AMD-positive.

The training notebook sets `POS_WEIGHT = n_nonAMD / n_AMD = 570 / 858 = 0.664336` and passes it as `pos_weight` to `BCEWithLogitsLoss`. In this implementation, it multiplies the positive-target AMD loss term by approximately 0.664, reducing the per-example AMD penalty relative to unweighted BCE. Because AMD is the majority image class in training, this value makes aggregate positive and negative class contributions equal under the simple count calculation. It is not, by itself, evidence of a defect.

## 1. Local documentation and what it verifies

### Files inspected

- `data/raw/OCTDL/OCTDL_labels.csv`
- `data/Processed/manifest.csv`
- `data/Processed/train.csv`
- `data/Processed/validation.csv`
- `data/Processed/test.csv`
- `data/Processed/split_report.csv`
- `data/Processed/split_patient_overlap.csv`
- `notebooks/02_data_cleaning_and_manifest.ipynb`
- `notebooks/04_patient_level_split.ipynb`
- `notebooks/07_model_training.ipynb`
- `notebooks/08_model_evaluation.ipynb`
- `LONGITUDINAL_DATASET_RESEARCH.md`

### Documented facts available in this workspace

The raw OCTDL label CSV has columns `file_name`, `disease`, `subcategory`, `condition`, `patient_id`, `eye`, `sex`, `year`, `image_width`, and `image_hight`. The processing notebook documents that it preserves the original disease labels and corrects the misspelled `image_hight` field only in the cleaned in-memory table. It also documents `0` as a placeholder for some metadata values, not a real laterality or year.

The project research report identifies the dataset as OCTDL, describes 2,064 labeled OCT images, and cites an IEEE DataPort listing and a 2024 *Scientific Data* paper. Those cited sources are **not present as local source files**. No separate README, data dictionary, license/terms document, or authoritative label glossary was found under `data/raw/OCTDL/`.

Accordingly:

- **Verified from local data/code:** the labels and terms actually stored, the project’s mapping implementation, and counts within the supplied partitions.
- **Not verified from local documentation:** the authoritative clinical or dataset-specific definitions, inclusion criteria, adjudication process, and intended semantic distinction for each disease class, subcategory, and condition. The values `early`, `intermediate`, `late`, `drusen`, `MNV_suspected`, and `MNV` are observed metadata strings, not definitions.
- **Not inferred:** `year` is not treated as an image acquisition date; filename suffixes are not treated as visits or chronology.

### Observed disease and AMD subtype labels

The seven source `disease` values represented in the saved splits are `AMD`, `DME`, `ERM`, `NO`, `RAO`, `RVO`, and `VID`. For AMD rows in the splits, the observed `subcategory` / `condition` combinations are:

| Source subcategory | Source condition | Meaning verified from local authoritative documentation? |
|---|---|---|
| `early` | `drusen` | No; the terms are present in metadata, but no local glossary or criteria was found. |
| `intermediate` | `MNV_suspected` | No; the source labels are present, but the meaning and adjudication criteria are not locally documented. |
| `late` | `MNV` | No; the source labels are present, but the meaning and adjudication criteria are not locally documented. |

The project does not infer or assign these subtypes from the image. It retains the CSV values.

## 2. Project label mapping

In `notebooks/02_data_cleaning_and_manifest.ipynb`, code cell 12 applies:

```python
df["target_amd"] = (df["disease"] == "AMD").astype("int8")
```

This creates the binary target as follows:

| Source `disease` value | Project `target_amd` |
|---|---:|
| `AMD` | 1 |
| Any non-`AMD` value present in the data (`DME`, `ERM`, `NO`, `RAO`, `RVO`, `VID`) | 0 |

The mapping is exact string equality, not a mapping from subcategory, condition, or image content. `subcategory` and `condition` remain separate columns in the processed manifest. No distinction between early, intermediate, and late AMD is used in the binary target: all source rows whose disease is `AMD` are positive, including all three observed AMD subcategory/condition combinations.

The same notebook constructs `usable` from image existence, readability, valid dimensions, and duplicate checks. The saved split files contain only usable records. The raw source labels are not rewritten by this audit.

### Mixed source labels within a supplied patient ID

The split files contain one test patient ID whose records include both `AMD` and `DME` source disease values. The split notebook's patient-level stratification label is `max(target_amd)` across a patient's rows, so that patient is assigned to the AMD-positive stratum. The row-level target values are still retained separately: the DME row remains `target_amd = 0`, while the AMD row remains `target_amd = 1`. No such mixed-target patient was observed in train or validation.

This is a code/data fact, not a determination that either row is mislabeled. The reason for the mixed source labels is not established by the local materials and should be clarified from dataset documentation before any new modeling decision.

## 3. Image-level and patient-level binary class counts

The table reports image counts directly from the saved partition CSVs. Patient-level categories are unique supplied `patient_id` values:

- **AMD-bearing patients:** at least one row with `target_amd = 1`.
- **Non-AMD-only patients:** all rows for that patient have `target_amd = 0`.
- **Mixed-target patients:** at least one row of each target. These patients are included in AMD-bearing, not Non-AMD-only, for the exclusive patient totals.

| Partition | Images | AMD images | Non-AMD images | Unique patients | AMD-bearing patients | Non-AMD-only patients | Mixed-target patients |
|---|---:|---:|---:|---:|---:|---:|---:|
| Train | 1,428 | 858 (60.08%) | 570 (39.92%) | 574 | 295 | 279 | 0 |
| Validation | 327 | 197 (60.24%) | 130 (39.76%) | 123 | 63 | 60 | 0 |
| Test | 307 | 174 (56.68%) | 133 (43.32%) | 123 | 63 | 60 | 1 |
| **All partitions** | **2,062** | **1,229** | **833** | **820** | **421** | **399** | **1** |

In the test partition, 61 unique patients have at least one Non-AMD row, of whom one is also AMD-bearing. Thus there are 63 AMD-bearing patients and 60 Non-AMD-only patients, totaling 123 distinct test patients. Across all partitions, the 421 AMD-bearing and 400 Non-AMD-bearing patient sets overlap by one mixed-target patient; the exclusive patient total is 421 AMD-bearing plus 399 Non-AMD-only = 820.

The patient-level AMD-positive convention agrees with the split notebook's use of a patient target equal to the maximum row target. Patient counts are not counts of independent visits; multiple images can belong to each patient.

## 4. AMD subcategory counts by partition

Counts below are restricted to AMD (`target_amd = 1`) rows. “Images” counts rows in the split. “Unique patients” counts patients with at least one image in that subcategory. Patient counts by subtype are not necessarily additive because a patient may have multiple recorded AMD subtypes.

| Partition | AMD subcategory / condition | Images | Unique patients |
|---|---|---:|---:|
| Train | early / drusen | 178 | 82 |
| Train | intermediate / MNV_suspected | 189 | 62 |
| Train | late / MNV | 491 | 151 |
| Validation | early / drusen | 41 | 19 |
| Validation | intermediate / MNV_suspected | 27 | 9 |
| Validation | late / MNV | 129 | 37 |
| Test | early / drusen | 47 | 20 |
| Test | intermediate / MNV_suspected | 32 | 8 |
| Test | late / MNV | 95 | 35 |

In validation, two AMD patients have images recorded under more than one AMD subcategory: one has early and intermediate labels, and one has intermediate and late labels. Therefore the validation subtype patient counts sum to 65, while there are 63 AMD-bearing patients. In train and test, no AMD patient was observed with more than one recorded AMD subcategory. A patient with several images within the same subcategory is counted once for that subcategory.

The source condition and subcategory values are counted as supplied. They are not independently validated stage assignments and do not establish disease progression or visit sequence.

For context, the non-AMD source-disease image counts are:

| Partition | DME | ERM | NO | RAO | RVO | VID |
|---|---:|---:|---:|---:|---:|---:|
| Train | 110 | 99 | 200 | 19 | 86 | 56 |
| Validation | 18 | 33 | 61 | 2 | 9 | 7 |
| Test | 19 | 23 | 71 | 1 | 6 | 13 |

These six source disease classes are all mapped to the same binary negative target by the project mapping. The local materials do not establish whether combining all of them is the intended or clinically appropriate comparison for every research question.

## 5. Supplied patient-ID overlap verification

Patient ID sets were computed from `train.csv`, `validation.csv`, and `test.csv` and compared pairwise. The existing `data/Processed/split_patient_overlap.csv` was also inspected.

| Split pair | Shared supplied patient IDs |
|---|---:|
| Train / validation | 0 |
| Train / test | 0 |
| Validation / test | 0 |

The split notebook (`notebooks/04_patient_level_split.ipynb`) groups all usable rows by patient, assigns each patient to one partition, then maps rows back to that assignment. This verifies no overlap under the supplied `patient_id` values. It cannot verify that the source IDs perfectly capture real-world identity or that there are no duplicate identities hidden behind different IDs.

## 6. `POS_WEIGHT` and `BCEWithLogitsLoss`

In `notebooks/07_model_training.ipynb`, code cell 9 calculates the weight from training labels only:

```python
amd_count = int((train_labels == 1).sum())
non_amd_count = int((train_labels == 0).sum())
POS_WEIGHT = non_amd_count / amd_count
criterion = nn.BCEWithLogitsLoss(
    pos_weight=torch.tensor([POS_WEIGHT], device=DEVICE)
)
```

For the saved training partition:

```text
amd_count     = 858
non_amd_count = 570
POS_WEIGHT    = 570 / 858 = 0.664335664... (reported as 0.664336)
```

For a logit `x` and binary target `y`, the positive-weighted binary cross-entropy with logits is equivalent to:

```text
loss(x, y) = -[pos_weight * y * log(sigmoid(x))
               + (1 - y) * log(1 - sigmoid(x))]
```

Therefore:

- For an AMD row (`y = 1`), the positive loss term is multiplied by `0.664336`. Relative to unweighted BCE, each positive-target AMD error has about 33.6% less loss contribution at the same logit.
- For a Non-AMD row (`y = 0`), the negative term is not multiplied by `pos_weight`.
- Since there are more AMD than Non-AMD training images, `858 × 0.664336 ≈ 570`, which balances the aggregate positive and negative class weights by image count under this simple calculation.

Thus this value **decreases the per-example relative penalty on AMD-positive errors** compared with unweighted BCE, while approximately equalizing the summed class weights across training rows. It does not mean that AMD is weighted more heavily than Non-AMD on a per-example basis. Whether this is desirable depends on the intended objective and validation evidence; the current value is code-verified and should not be called a bug without a defined objective and controlled comparison.

The notebook monitors validation metrics, including recall and ROC-AUC, and selects the checkpoint by validation ROC-AUC (validation loss fallback). This audit did not train a model or use test results to choose a setting.

## 7. Unresolved questions before new modeling

1. **Official label definitions:** What are the source dataset's documented criteria for `AMD`, `early`, `intermediate`, `late`, `drusen`, `MNV_suspected`, and `MNV`? The detailed documentation is not available locally; verify against the authoritative dataset documentation before interpreting labels.
2. **Label unit and adjudication:** Are disease/subcategory labels defined per image, eye, patient, or exam, and what review or adjudication process produced them? The CSV alone does not answer this.
3. **Mixed AMD/DME patient:** Why do multiple rows for one supplied patient ID contain both `AMD` and `DME`? Preserve the supplied labels pending source clarification; do not resolve this by inference.
4. **Multiple AMD subtypes:** Why do two validation patients have more than one recorded AMD subtype? Are these label conventions, distinct eyes/exams, or another documented structure? The available metadata does not establish the explanation.
5. **Binary negative-class rationale:** Is the intended task AMD versus the pooled set of all six non-AMD classes, or should some comparisons be scoped differently? The current code pools them mechanically.
6. **Patient-weighting objective:** Should training loss weight images equally, patients equally, or reflect a pre-specified target population? Patients contribute different numbers of rows; `POS_WEIGHT` is calculated from image counts, not patient counts.
7. **Class imbalance objective:** Is the desired operating goal sensitivity, specificity, overall discrimination, or another research metric? A loss weight alone does not determine an appropriate decision threshold.
8. **Dataset provenance and duplicate structure:** Confirm the official meaning of patient IDs and records per ID, and whether the available images represent independent scans, slices, or other sampling units. Filenames are not used here to infer such relationships.

These are documentation and research-design questions, not evidence that supplied labels are incorrect.

## 8. Recommended next controlled experiment

First complete a source-documentation and patient-level label-balance review without changing any labels. Once the binary task definition and the mixed/multiple-subtype records are understood, the next controlled training experiment should compare the existing loss weighting with a small, pre-specified set of alternative `pos_weight` values.

For that experiment:

1. Preserve patient-grouped partitions; calculate any class weights from training data only.
2. Keep architecture, preprocessing, augmentation, initialization policy, training schedule, and random seeds fixed while varying only the loss weight.
3. Keep the decision threshold fixed at 0.5 for the primary loss-weight comparison so the loss change is not confounded with threshold selection.
4. Compare patient-grouped validation ROC-AUC/PR-AUC and AMD sensitivity, specificity, precision, and F1 at the fixed threshold. Report patient-aware variability as well as image-level metrics.
5. Pre-specify the comparison and choose settings using validation data only.
6. Do **not** tune against the existing test split: its outcomes, false-negative examples, and alternative-threshold trade-offs have already been examined in the Step 6C/6D audits. Obtain a new untouched patient-level test cohort or suitable external evaluation set for confirmatory reporting.

This is a proposed experiment only. No training, threshold selection, or model update was performed here.

## 9. Verification record and limitations

### Executed

- Read the raw label CSV and saved manifest/split CSVs.
- Recomputed image and unique-patient counts for each saved partition.
- Counted unique patients for each observed AMD subcategory in each partition.
- Recomputed patient-ID intersections across all three partitions.
- Checked patients with multiple AMD subcategories and with mixed binary source labels.
- Inspected the relevant label-mapping, patient-level split, training, and evaluation notebook cells and their saved outputs.
- Confirmed the `POS_WEIGHT` formula and how `BCEWithLogitsLoss(pos_weight=...)` applies it.

### Not performed / not verified

- No external dataset website, paper, or restricted data was accessed as part of this local audit.
- Official clinical/dataset definitions and label adjudication procedures are not verified from local files.
- No clinical relabeling, training, fine-tuning, threshold change, or model comparison was performed.
- Correctness or completeness of the supplied patient IDs beyond the stored files is not independently verified.
- No inference from filename suffixes to scan sequence, visit date, or eye identity was made.

Only `AMD_LABEL_AND_PATIENT_BALANCE_AUDIT.md` was created.
