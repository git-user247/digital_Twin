# AI-Enabled Digital Twin for Personalized Eye Health Monitoring

## Evidence Scope

This document is based on the files currently present in the AMD-Digital-Twin workspace and on saved result tables. No project code, notebook, model, data file, or environment was modified while preparing it.

Where a requested fact is not represented in the current files, this document says: **Not found in current project files.**

---

## 1. Project Overview

The project combines OCT retinal-image analysis with a proposed patient-specific digital representation for eye-health monitoring.

The implemented system currently delivers:

1. OCTDL dataset exploration and metadata inspection.
2. Image and metadata quality control.
3. A cleaned image manifest.
4. Patient-level, leakage-safe train/validation/test splits.
5. A reusable OCT preprocessing pipeline.
6. A frozen EfficientNetB0 transfer-learning baseline.
7. Controlled training with validation monitoring and checkpointing.
8. Held-out test evaluation.
9. A React/Vite demonstration frontend using mock prediction data.

The implemented machine-learning task is narrower than the full long-term vision:

> Binary image-level classification: AMD = 1 and Non-AMD = 0.

The full longitudinal digital twin, progression predictor, backend API, and clinical workflow are not implemented yet.

### Current headline results

| Measure                          |              Evidence-based result |
| -------------------------------- | ---------------------------------: |
| Raw labeled images               |                              2,064 |
| Unique patients                  |                                820 |
| Usable images in split pipeline  |                              2,062 |
| Train / validation / test images |                  1,428 / 327 / 307 |
| Patient overlap                  |          0 across every split pair |
| Baseline architecture            | ImageNet-pretrained EfficientNetB0 |
| Training epochs                  |                                 12 |
| Test accuracy                    |                             84.69% |
| Test precision                   |                             85.47% |
| Test recall for AMD              |                             87.93% |
| Test F1-score for AMD            |                             86.69% |
| Test ROC-AUC                     |                              0.922 |

These metrics are an internal held-out OCTDL result, not clinical validation.

---

## 2. Problem Statement

Age-related macular degeneration affects the macula and can change over time. OCT provides cross-sectional retinal images that can reveal structural abnormalities such as drusen, fluid, and retinal-layer changes.

The project aims to move beyond a one-image classification result toward a patient-specific representation that can combine:

- Current OCT findings.
- Historical examinations.
- Disease state.
- Risk and confidence estimates.
- Future clinical and patient metadata.
- Longitudinal progression information.

The current implementation proves the image-analysis foundation. It does not yet prove longitudinal disease progression prediction because the available metadata is not a reliable examination timeline.

---

## 3. Complete Architecture

### Implemented machine-learning path

```text
OCTDL raw images + labels
        |
        v
Data exploration
        |
        v
Cleaning and manifest creation
        |
        v
Image-quality audit
        |
        v
Patient-level split
        |
        v
Dynamic preprocessing
        |
        v
Frozen EfficientNetB0 + binary head
        |
        v
Training with validation monitoring
        |
        v
Held-out test evaluation
```

### Current application path

```text
Reviewer
   |
   v
React/Vite frontend
   |
   v
Mock upload and mock prediction
```

### Intended future path

```text
React frontend
        |
        v
FastAPI backend API
        |
        v
Preprocessing service
        |
        v
EfficientNetB0 checkpoint
        |
        v
Prediction and confidence response
        |
        v
Patient/twin state store
        |
        v
Digital twin dashboard
```

A FastAPI backend is not present. **Not found in current project files.**

---

## 4. Folder and File Structure

| Folder/File                                | Purpose                      | What It Contains                                                                                                     | Why It Is Used                                                          | Status                                  |
| ------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| `data/raw/OCTDL/`                          | Immutable source dataset     | OCTDL images grouped into AMD, DME, ERM, NO, RAO, RVO, and VID folders plus labels CSV                               | Keeps source images and original labels separate from derived artifacts | ✓ Completed                             |
| `data/raw/OCTDL/OCTDL_labels.csv`          | Source metadata              | `file_name`, disease labels, subcategory, condition, patient ID, eye, sex, year, and image dimensions                | Supplies labels and metadata for all audit and split stages             | ✓ Completed                             |
| `data/processed/manifest.csv`              | Clean record-level manifest  | Verified image paths, original labels, standardized metadata, `target_amd`, and `usable`                             | Provides one controlled source table for later stages                   | ✓ Completed                             |
| `data/processed/train.csv`                 | Training split               | Usable rows assigned to training patients                                                                            | Feeds model training                                                    | ✓ Completed                             |
| `data/processed/validation.csv`            | Validation split             | Usable rows assigned to validation patients                                                                          | Monitors model selection and early stopping                             | ✓ Completed                             |
| `data/processed/test.csv`                  | Held-out test split          | Usable rows assigned to test patients                                                                                | Provides final unbiased internal evaluation                             | ✓ Completed                             |
| `data/processed/split_report.csv`          | Split summary                | Image/patient counts and AMD/non-AMD percentages                                                                     | Documents split composition                                             | ✓ Completed                             |
| `data/processed/split_patient_overlap.csv` | Leakage result               | Pairwise patient overlap counts                                                                                      | Proves patient disjointness                                             | ✓ Completed                             |
| `data/processed/quality_inspection/`       | Image audit outputs          | Per-image metrics, flagged rows, samples, report, and figures                                                        | Documents readability and unusual-image screening                       | ✓ Completed                             |
| `data/processed/preprocessing_inspection/` | Preprocessing audit outputs  | Array validation table, preprocessing summary, and comparison figure                                                 | Proves model-ready shapes and finite values                             | ✓ Completed                             |
| `notebooks/`                               | Sequential research workflow | Notebooks 01 through 08                                                                                              | Makes each project phase inspectable and reproducible                   | ✓ Completed through baseline evaluation |
| `src/oct_preprocessing.py`                 | Reusable preprocessing code  | Pillow/NumPy image loading, augmentation, normalization, denormalization, validation                                 | Shares preprocessing logic between notebook stages and model code       | ✓ Completed                             |
| `models/baseline_efficientnetb0_best.pth`  | Best trained checkpoint      | EfficientNetB0 state, optimizer state, epoch, and validation metrics                                                 | Reloads the selected baseline for evaluation or future serving          | ✓ Completed                             |
| `results/baseline_training_history.csv`    | Epoch history                | Train/validation loss and metrics for 12 epochs                                                                      | Supports training analysis and plots                                    | ✓ Completed                             |
| `results/plots/`                           | Training figures             | Training curves PNG                                                                                                  | Shows loss, accuracy, and validation ROC-AUC across epochs              | ✓ Completed                             |
| `results/evaluation/`                      | Test evaluation outputs      | Metrics, classification report, confusion matrix, and ROC plot                                                       | Documents held-out model performance                                    | ✓ Completed                             |
| `docs/amd_research.md`                     | Research and design notes    | AMD background, proposed digital twin, architecture, and future concepts                                             | Explains motivation and intended system                                 | ✓ Completed as planning document        |
| `Frontend/`                                | Demonstration application    | React/Vite/Tailwind dashboard and mock data                                                                          | Presents the project to reviewers                                       | ⚠ Prototype / Partial                   |
| `apps/`                                    | Intended application area    | Currently empty                                                                                                      | Reserved for future application/backend work                            | ⬜ Not Started                          |
| `models/`                                  | Model artifact area          | Baseline checkpoint                                                                                                  | Stores trained models separately from source code                       | ✓ Completed for baseline                |
| `.venv/`                                   | Active ML environment        | PyTorch, TorchVision, scikit-learn, Jupyter support, and data-science packages                                       | Runs the model notebooks                                                | ✓ Completed for current baseline        |
| `venv/`                                    | Earlier environment          | Existing environment from earlier phases; it does not contain the current PyTorch stack according to observed checks | Historical/project environment artifact                                 | ⚠ Prototype / Partial                   |

Generated dependency directories such as `Frontend/node_modules/`, `Frontend/dist/`, `.venv/`, and `venv/` are not explained file by file because they are environment/build output rather than project logic.

---

## 5. Dataset and Data Pipeline

### 5.1 Where the dataset is stored

The raw dataset is stored at:

```text
data/raw/OCTDL/
```

The image directories are:

```text
AMD/
DME/
ERM/
NO/
RAO/
RVO/
VID/
```

The source label file is:

```text
data/raw/OCTDL/OCTDL_labels.csv
```

The CSV stores image basenames without the `.jpg` suffix. The cleaning notebook constructs paths as:

```text
data/raw/OCTDL/<disease>/<file_name>.jpg
```

### 5.2 Dataset classes

The observed class counts are:

| Disease   |    Images |
| --------- | --------: |
| AMD       |     1,231 |
| NO        |       332 |
| ERM       |       155 |
| DME       |       147 |
| RVO       |       101 |
| VID       |        76 |
| RAO       |        22 |
| **Total** | **2,064** |

AMD subcategories in the source metadata include early, intermediate, and late. The current trained task does not predict these subcategories; it predicts AMD versus all other diseases.

### 5.3 Dataset exploration

`notebooks/01_data_exploration.ipynb`:

- Imports pandas, NumPy, Matplotlib, and Pillow.
- Checks the working directory and raw-folder contents.
- Walks the raw directory and displays sample file names.
- Loads `OCTDL_labels.csv` with pandas.
- Prints dataset shape and a preview.
- Counts values in `eye`, `sex`, and `year`.
- Counts disease labels.
- Draws a disease-distribution bar chart.

This stage answers: “What data exists, what labels are present, and how balanced are the classes?”

### 5.4 Data cleaning and manifest creation

`notebooks/02_data_cleaning_and_manifest.ipynb`:

1. Finds the project root by searching for `data/raw/OCTDL`.
2. Loads and validates required source columns.
3. Adds an expected image path for each row.
4. Checks whether each image exists.
5. Uses Pillow `verify()` to detect unreadable/corrupted images.
6. Reads actual image dimensions.
7. Computes SHA-256 file hashes for duplicate-content detection.
8. Compares actual dimensions with metadata dimensions.
9. Counts missing and placeholder metadata.
10. Renames the source typo `image_hight` to `image_height` in the cleaned table.
11. Converts `0` eye/sex values to `Unknown`.
12. Converts `year == 0` to missing nullable integer values.
13. Creates `target_amd`: AMD = 1, all other diseases = 0.
14. Creates `usable`, requiring an existing, readable, dimension-valid, non-duplicate record.
15. Saves exactly the requested manifest columns.

The manifest columns are:

```text
image_path
file_name
patient_id
disease
subcategory
condition
eye
sex
year
image_width
image_height
target_amd
usable
```

The raw CSV and raw images are not modified by this notebook.

### 5.5 Image-quality audit

`notebooks/03_image_quality_inspection.ipynb` reads the manifest and computes, for every image:

- Readability.
- Actual width and height.
- Aspect ratio.
- Mean intensity.
- Intensity standard deviation.
- Minimum and maximum intensity.
- Dynamic range.
- Entropy.

It uses conservative screening rules for blank/near-blank images and flags unusual aspect ratios or dimensions. It samples up to eight readable images per disease class using seed 42 and saves a report-ready image grid.

Results:

| Quality measure             | Result |
| --------------------------- | -----: |
| Total images                |  2,064 |
| Readable images             |  2,064 |
| Unreadable or missing       |      0 |
| Blank or near-blank         |      0 |
| Unusual aspect-ratio images |     41 |
| Unusual-dimension images    |      1 |
| Potentially unusual images  |     41 |

The unusual images were not automatically deleted. They are screening flags, mainly reflecting aspect-ratio variation.

### 5.6 Patient IDs and leakage-safe splitting

`notebooks/04_patient_level_split.ipynb` first validates `patient_id` before assigning any split.

Observed validation:

- Unique patients: 820.
- Images with missing or invalid patient IDs: 0.
- Patients with multiple images: 568.
- Maximum images for one patient: 10.
- One patient has mixed AMD/non-AMD row labels.

The split notebook treats a patient as AMD-positive for stratification if any usable row for that patient has `target_amd == 1`. Original row-level labels are retained unchanged.

Patients are shuffled within the two patient-level strata with seed 42 and assigned approximately 70%/15%/15%.

| Split      | Images | Patients | AMD | Non-AMD |  AMD % |
| ---------- | -----: | -------: | --: | ------: | -----: |
| Train      |  1,428 |      574 | 858 |     570 | 60.08% |
| Validation |    327 |      123 | 197 |     130 | 60.24% |
| Test       |    307 |      123 | 174 |     133 | 56.68% |

Patient intersections are all zero:

```text
train ∩ validation = 0
train ∩ test = 0
validation ∩ test = 0
```

### 5.7 Simple definitions

| Term                | Meaning in this project                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw data            | Original OCTDL images and source label CSV under `data/raw/OCTDL`                                                                                                                |
| Processed data      | Derived manifests, split CSVs, audit tables, and model-ready analysis outputs under `data/processed`                                                                             |
| Manifest            | A table that maps each image to its path, patient, labels, metadata, target, and usability decision                                                                              |
| Metadata            | Information about an image or patient, such as patient ID, eye, sex, year, dimensions, disease, and condition                                                                    |
| Data leakage        | Information from outside the training data improperly influencing training or evaluation; here, the main danger is related images from one patient appearing in different splits |
| Patient-level split | Assigning all images from one patient to exactly one of train, validation, or test                                                                                               |
| Class imbalance     | Unequal numbers of AMD and Non-AMD examples; here the training set contains 858 AMD and 570 Non-AMD images                                                                       |
| Preprocessing       | Converting raw images into the fixed-size, normalized arrays expected by the CNN                                                                                                 |
| Augmentation        | Controlled, artificial variation applied to training images; here rotation, brightness, contrast, and minor translation are used only for training                               |

---

## 6. Notebook-by-Notebook Explanation

### `01_data_exploration.ipynb`

**Purpose:** Initial dataset orientation.

**Input:** `../data/raw/OCTDL/OCTDL_labels.csv` and the raw image directory.

**Processing:** Imports pandas, NumPy, Matplotlib, Pillow, and `os`; prints folder contents; walks raw directories; loads the CSV; inspects `eye`, `sex`, and `year`; counts diseases; plots disease counts.

**Output:** Console previews and a disease-distribution bar chart. It does not write a processed dataset.

**Why important:** It establishes the data shape, class vocabulary, available metadata, and early class-balance risks before cleaning.

**Panel explanation:** “I began with an exploratory notebook to understand the dataset rather than training immediately. I checked the directory structure, label table, metadata distributions, and disease counts. This showed me what needed to be validated and helped define AMD versus Non-AMD as the first task.”

### `02_data_cleaning_and_manifest.ipynb`

**Purpose:** Convert source metadata into a validated manifest.

**Input:** `OCTDL_labels.csv` and raw `.jpg` images.

**Processing:** Path construction, file existence checks, Pillow readability checks, actual-dimension checks, SHA-256 duplicate checks, placeholder metadata audit, field standardization, binary target creation, and `usable` flag creation.

**Important functions/libraries:** `find_project_root`, `inspect_image`, `hashlib`, `pathlib`, pandas, and Pillow.

**Output:** `data/processed/manifest.csv` plus printed data-quality report.

**Why important:** Every later stage depends on reliable image-to-label mapping and explicit inclusion/exclusion decisions.

**Panel explanation:** “The manifest is the contract between the source dataset and the model. It preserves the labels, records the patient ID, creates the binary target, and marks whether each image passed objective validation.”

### `03_image_quality_inspection.ipynb`

**Purpose:** Review visual and numeric image quality without removing unusual images automatically.

**Input:** `manifest.csv` and raw image paths.

**Processing:** Pillow verification, grayscale intensity statistics, entropy, aspect ratio, dimension screening, fixed-seed per-class sampling, contact sheet creation, and summary plots.

**Output:** `image_quality_metrics.csv`, `flagged_images.csv`, `sampled_images.csv`, `inspection_report.csv`, representative grid PNG, and dimensions/aspect-ratio PNG.

**Why important:** A readable file is not necessarily a useful image. The audit identifies blankness, dimension inconsistencies, and aspect-ratio outliers for human review.

**Panel explanation:** “Forty-one images were flagged mainly for aspect-ratio differences, but I did not automatically remove them. The audit separates quality evidence from a premature deletion decision.”

### `04_patient_level_split.ipynb`

**Purpose:** Create leakage-safe train, validation, and test files.

**Input:** `manifest.csv`.

**Processing:** Patient-ID reliability gate; repeated-image distribution; mixed-label patient check; patient-level AMD stratification; seed-42 assignment; overlap verification.

**Output:** `train.csv`, `validation.csv`, `test.csv`, `split_report.csv`, and `split_patient_overlap.csv`.

**Why important:** Multiple images from one patient can be visually and clinically related. Image-level random splitting can produce an overly optimistic evaluation.

**Panel explanation:** “The unit of splitting is the patient, not the image. That is why every patient appears in only one partition and why all three pairwise overlaps are zero.”

### `05_preprocessing_pipeline.ipynb`

**Purpose:** Define and validate model-ready image preprocessing.

**Input:** All three split CSVs and dynamic raw image paths.

**Processing:** Grayscale conversion; grayscale-to-three-channel RGB conversion; LANCZOS resize to 224 by 224; ImageNet normalization; training-only conservative augmentation; shape and finite-value checks; original/preprocessed/augmented visualization.

**Important reusable code:** `src/oct_preprocessing.py` contains `preprocess_image`, `_conservative_augmentation`, `denormalize_image`, and `validate_preprocessed_array`.

**Output:** `preprocessing_validation.csv`, `preprocessing_summary.csv`, and `preprocessing_visual_comparison.png`.

**Actual contract:** Output arrays are `float32` with shape `(3, 224, 224)`. Training augmentation is rotation up to 5 degrees, brightness/contrast within 0.90 to 1.10, and translation up to 3%. Validation/test use no augmentation.

**Why important:** The CNN must receive consistent tensors, and validation/test preprocessing must remain deterministic.

**Panel explanation:** “OCT is grayscale, but pretrained CNNs expect three channels. I replicate the grayscale signal into three channels rather than inventing color. I use ImageNet normalization because the baseline weights were pretrained on ImageNet.”

### `06_baseline_model.ipynb`

**Purpose:** Define the EfficientNetB0 transfer-learning architecture and verify one forward pass.

**Input:** Patient split CSVs and the reusable preprocessing module.

**Processing:** Defines a dynamic `OCTDataset`, constructs loaders, loads `EfficientNet_B0_Weights.DEFAULT`, freezes `model.features`, replaces the classifier with dropout and one logit, defines `BCEWithLogitsLoss`, and checks tensor shapes.

**Actual configuration in this notebook:** Batch size 16, seed 42, learning rate 0.001, Adam optimizer, and `RUN_TRAINING = False`. This notebook is the architecture-validation predecessor to the later training notebook.

**Output:** Printed model architecture, parameter counts, class counts, and successful forward-pass shapes. It does not run full training.

**Why important:** It verifies that labels, tensors, model outputs, and the loss interface are compatible before spending time training.

**Panel explanation:** “Before training, I froze the pretrained feature extractor, added a binary head, and verified that a batch of shape `(16, 3, 224, 224)` produced one logit per label.”

### `07_model_training.ipynb`

**Purpose:** Execute the controlled baseline training run.

**Input:** Train and validation split CSVs plus the raw images dynamically loaded through `oct_preprocessing.py`. The test CSV is read for integrity checks and patient-overlap verification, but no test DataLoader is constructed and test metrics are not used for model decisions.

**Processing:** Uses seed 42, detects CPU/GPU, computes `POS_WEIGHT = non_AMD / AMD`, constructs AdamW, trains the frozen feature extractor plus classification head, evaluates every epoch on validation, saves the best validation ROC-AUC checkpoint, applies patience-4 early stopping, and creates training curves.

**Actual configuration:**

| Setting                         | Value                                         |
| ------------------------------- | --------------------------------------------- |
| Device                          | CPU in the completed run (`torch 2.14.0+cpu`) |
| Batch size                      | 16                                            |
| Optimizer                       | AdamW                                         |
| Learning rate                   | 0.0001                                        |
| Loss                            | `BCEWithLogitsLoss`                           |
| Positive-class weight           | 570 / 858 = approximately 0.664336            |
| Maximum epochs                  | 12                                            |
| Early-stopping patience         | 4                                             |
| Seed                            | 42                                            |
| Feature extractor               | Frozen                                        |
| Test evaluation during training | Not performed                                 |

**Output:** `results/baseline_training_history.csv`, `results/plots/baseline_training_curves.png`, and `models/baseline_efficientnetb0_best.pth`.

**Observed history:** 12 epochs completed. Validation ROC-AUC increased to 0.905193 at epoch 12. Early stopping was not triggered.

**Panel explanation:** “I used a controlled frozen baseline rather than tuning many settings. AdamW optimized the trainable head, BCE-with-logits handled the binary target, the class weight came only from training labels, and validation ROC-AUC selected the checkpoint.”

### `08_model_evaluation.ipynb`

**Purpose:** Evaluate the finalized baseline once on the untouched test split.

**Input:** `models/baseline_efficientnetb0_best.pth` and `data/processed/test.csv`.

**Processing:** Reconstructs the same EfficientNetB0 architecture, loads the checkpoint, dynamically preprocesses test images without augmentation, computes thresholded metrics, classification report, confusion matrix, and ROC curve/AUC.

**Output:** `results/evaluation/test_metrics.csv`, classification report CSV/TXT, confusion matrix CSV/PNG, and `results/evaluation/plots/test_roc_curve.png`.

**Why important:** It gives one final internal estimate after model selection without using the test set to influence training.

**Panel explanation:** “I kept test data untouched until the model and checkpoint were finalized. The evaluation notebook makes one pass over 307 test images and saves all metrics and visual evidence.”

---

## 7. Model Architecture and Training Details

### Why EfficientNetB0

The project research notes list EfficientNetB0, ResNet50, and DenseNet121 as candidates and select EfficientNetB0 for the initial experiment. The notes justify transfer learning for a relatively limited medical-imaging dataset and lower compute requirements. A separate benchmark comparison is **Not found in current project files.**

### Transfer learning

Transfer learning reuses visual features learned from a large source dataset and adapts them to a new task. Instead of learning every edge, texture, and shape from the OCT dataset, the model begins with a pretrained visual representation.

### Pretrained model and ImageNet weights

A pretrained model has parameters learned before this project. `EfficientNet_B0_Weights.DEFAULT` loads TorchVision's default ImageNet-pretrained EfficientNetB0 weights. ImageNet is the source visual dataset used by those weights; it is not the OCTDL dataset.

### Frozen baseline

In the baseline, `model.features.parameters()` are set to `requires_grad = False`. The convolutional feature extractor is therefore not updated by the optimizer. This reduces trainable parameters and makes the first experiment stable and computationally modest.

### Trainable layers

The original classifier is replaced with:

```text
Dropout(p=0.30)
Linear(in_features=1280, out_features=1)
```

The completed architecture reported:

- Trainable parameters: 1,281.
- Non-trainable parameters: 4,007,548.
- Total parameters: 4,008,829.

### Input and normalization

- Input image size: 224 x 224.
- Channels: three identical channels made from the grayscale OCT image.
- Array layout: channel-first `(3, 224, 224)`.
- Type: `float32`.
- Pixel scaling: raw intensity divided by 255.
- Normalization mean: `[0.485, 0.456, 0.406]`.
- Normalization standard deviation: `[0.229, 0.224, 0.225]`.

### Loss and imbalance

The training notebook uses `BCEWithLogitsLoss` with:

```text
pos_weight = number_of_non_AMD_training_images / number_of_AMD_training_images
           = 570 / 858
           ≈ 0.664336
```

This weight is calculated from the training split only. It changes the loss contribution; it does not change labels or evaluation counts.

### Optimizer, learning rate, and epochs

- Optimizer: AdamW.
- Learning rate: `0.0001`.
- Maximum epochs: 12.
- Early-stopping patience: 4 epochs.
- Seed: 42.
- Completed epochs: 12.
- Early stopping: not triggered.

The architecture-validation notebook (`06_baseline_model.ipynb`) contains an earlier Adam configuration at `0.001` with training disabled. The actual completed run is governed by `07_model_training.ipynb`, which uses AdamW at `0.0001`.

### Checkpoint strategy

At each epoch, validation ROC-AUC is calculated. If it improves, the notebook saves:

```text
models/baseline_efficientnetb0_best.pth
```

The checkpoint includes model state, optimizer state, epoch, validation metrics, validation loss, and random seed.

---

## 8. Training Results

The final saved history row is:

| Epoch | Train loss | Validation loss | Train accuracy | Validation accuracy | Precision | Recall |     F1 |  ROC-AUC |
| ----: | ---------: | --------------: | -------------: | ------------------: | --------: | -----: | -----: | -------: |
|    12 |   0.358389 |        0.364735 |         82.35% |              83.18% |    85.86% | 86.29% | 86.08% | 0.905193 |

The best validation ROC-AUC was also at epoch 12: **0.905193**.

The training plot is:

```text
results/plots/baseline_training_curves.png
```

---

## 9. Evaluation Results

The model was evaluated on the untouched test split:

- Test images: 307.
- Test patients: 123.
- Test positives: 174 AMD.
- Test negatives: 133 Non-AMD.

### Metrics

| Metric    |    Value |
| --------- | -------: |
| Accuracy  |   84.69% |
| Precision |   85.47% |
| Recall    |   87.93% |
| F1-score  |   86.69% |
| ROC-AUC   | 0.922003 |

### Confusion matrix

Using rows as actual classes and columns as predicted classes:

|                | Predicted Non-AMD | Predicted AMD |
| -------------- | ----------------: | ------------: |
| Actual Non-AMD |               107 |            26 |
| Actual AMD     |                21 |           153 |

The classification report shows:

| Class   | Precision | Recall | F1-score | Support |
| ------- | --------: | -----: | -------: | ------: |
| Non-AMD |      0.84 |   0.80 |     0.82 |     133 |
| AMD     |      0.85 |   0.88 |     0.87 |     174 |

### Meaning of the metrics

- **Accuracy:** The fraction of all test images classified correctly. Here, 84.69% means approximately 85 of every 100 test images were correct.
- **Precision:** Among images predicted as AMD, the fraction that were actually AMD. High precision means fewer false AMD alerts.
- **Recall:** Among actual AMD images, the fraction detected as AMD. AMD recall is 87.93%, meaning 153 of 174 AMD test images were detected.
- **F1-score:** The harmonic mean of precision and recall. It is useful when both missed AMD cases and false alerts matter.
- **ROC-AUC:** The area under the ranking curve across possible probability thresholds. A value of 0.922 means the model generally ranks an AMD image above a Non-AMD image, but it is not a probability of being clinically correct for one individual.
- **Confusion matrix:** A count of correct and incorrect predictions by actual and predicted class.

### Why AMD recall matters

For an initial screening-oriented tool, missing an AMD case can be more consequential than generating an extra follow-up alert. Recall therefore deserves explicit reporting rather than relying on accuracy alone. The model's 87.93% AMD recall is encouraging, but the 21 missed AMD images in this test set still matter.

### How to answer: “How do you know your model is performing well?”

> “I evaluated it on a patient-level held-out test set that was not used during training or checkpoint selection. It achieved 84.69% accuracy, 0.922 ROC-AUC, 85.47% precision, 87.93% AMD recall, and 86.69% AMD F1-score. I also inspected the confusion matrix: it detected 153 of 174 AMD images and missed 21. These results are promising for this internal OCTDL baseline, but they are not clinical validation because the test set is limited, the data comes from one dataset, and there is no external or prospective validation yet.”

### Why the untouched test set matters

If test images influence training, threshold choice, architecture choice, or checkpoint selection, the test score becomes optimistic. The project reserves the test split for the final evaluation notebook and does not use it to update the model.

### Why this is not clinical validation

The project has no clinician adjudication workflow, external dataset evaluation, prospective cohort, calibration analysis, clinical operating-point analysis, or deployment safety evaluation in the current files. **Not found in current project files.**

---

## 10. Frontend Architecture

### Framework and dependencies

`Frontend/package.json` shows:

- React 18.
- React DOM.
- Vite.
- Tailwind CSS with PostCSS and Autoprefixer.
- `lucide-react` for icons.
- `recharts` for the monitoring chart.

React was selected in the project because it supports reusable stateful UI components. Vite supplies a fast development/build workflow. The reason for choosing React/Vite is not separately documented in a design decision file; that rationale is inferred from the implementation. A formal comparison with other frontend frameworks is **Not found in current project files.**

### Important frontend files

| File                            | Actual role                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Frontend/package.json`         | Dependencies and `dev`, `build`, and `preview` scripts                                            |
| `Frontend/index.html`           | Browser entry document and page metadata                                                          |
| `Frontend/vite.config.js`       | Vite React plugin configuration                                                                   |
| `Frontend/tailwind.config.js`   | Tailwind content paths and font family extensions                                                 |
| `Frontend/postcss.config.js`    | Tailwind and Autoprefixer PostCSS plugins                                                         |
| `Frontend/src/main.jsx`         | React root mounting and CSS import                                                                |
| `Frontend/src/App.jsx`          | Main dashboard component, navigation, upload state, mock analysis, charts, and sections           |
| `Frontend/src/data/mockData.js` | Mock patient, trend, insights, overview, and project-status data                                  |
| `Frontend/src/styles.css`       | Global styles, layout, responsive breakpoints, colors, cards, panels, and dashboard visual system |
| `Frontend/public/favicon.svg`   | Eye-themed browser favicon                                                                        |

### Component structure

The frontend is currently concentrated in `App.jsx` rather than split into many component files. Reusable local functions include:

- `PanelHeader` for panel headings.
- `CustomTooltip` for the Recharts chart.
- `MetricIcon` for overview-card icons.
- `EyeMark` for the eye mark used in branding and the twin panel.

The data layer is separated into `src/data/mockData.js`, which is the main extension point for API-backed state.

### Current upload behavior

The image-analysis section:

1. Accepts drag-and-drop files.
2. Accepts file selection through an `<input type="file" accept="image/*">`.
3. Creates a browser object URL with `URL.createObjectURL(file)`.
4. Displays the uploaded image preview.
5. Allows removing the selected preview.
6. Enables “Analyze image” when an image is selected.

Clicking analyze waits 800 milliseconds and sets a hard-coded mock response:

```text
Prediction: AMD
Risk: Moderate
Confidence: 87%
```

The code contains the explicit integration marker:

```text
TODO: Replace mock prediction with a backend ML model API call.
```

### Why the frontend is a prototype

It does not call a backend, does not load the `.pth` checkpoint, does not preprocess uploads through Python, and does not store patient examinations. The chart, patient twin, risk score, observations, and insights are mock/sample values.

### Current and future architecture

Current:

```text
React Frontend
        |
        v
Mock prediction data
```

Future:

```text
React Frontend
        |
        v
FastAPI Backend
        |
        v
EfficientNetB0 model service
        |
        v
Real prediction response
```

### Future API connection changes

The frontend will need:

1. A backend endpoint such as `POST /predict` accepting an image upload.
2. Backend-side preprocessing identical to `src/oct_preprocessing.py`.
3. Checkpoint loading from `models/baseline_efficientnetb0_best.pth`.
4. A prediction response containing class, probability/confidence, model version, and uncertainty metadata where appropriate.
5. Frontend loading, error, timeout, and response states.
6. CORS and authentication decisions.
7. Patient/examination persistence for digital-twin updates.

A backend implementation, API schema, authentication, and database are **Not found in current project files.**

---

## 11. Honest Completion Status

| Component                   | Status                | Evidence/File Location                                                                                              |
| --------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Dataset Collection          | ✓ Completed           | OCTDL is present under `data/raw/OCTDL`; acquisition/provenance documentation is Not found in current project files |
| Data Exploration            | ✓ Completed           | `notebooks/01_data_exploration.ipynb`                                                                               |
| Data Cleaning               | ✓ Completed           | `notebooks/02_data_cleaning_and_manifest.ipynb`                                                                     |
| Manifest Creation           | ✓ Completed           | `data/processed/manifest.csv`                                                                                       |
| Image Quality Audit         | ✓ Completed           | `notebooks/03_image_quality_inspection.ipynb`, `data/processed/quality_inspection/`                                 |
| Patient-Level Split         | ✓ Completed           | `notebooks/04_patient_level_split.ipynb`, split CSVs, overlap report                                                |
| Preprocessing               | ✓ Completed           | `notebooks/05_preprocessing_pipeline.ipynb`, `src/oct_preprocessing.py`                                             |
| Baseline Model Architecture | ✓ Completed           | `notebooks/06_baseline_model.ipynb`                                                                                 |
| Model Training              | ✓ Completed           | `notebooks/07_model_training.ipynb`, history CSV, `.pth` checkpoint                                                 |
| Model Evaluation            | ✓ Completed           | `notebooks/08_model_evaluation.ipynb`, `results/evaluation/`                                                        |
| Frontend                    | ⚠ Prototype / Partial | `Frontend/` React/Vite dashboard with mock predictions                                                              |
| Backend Integration         | ⬜ Not Started        | No backend service found; `apps/` is empty                                                                          |
| Fine-Tuning                 | ⬜ Not Started        | No unfreezing/fine-tuning experiment found                                                                          |
| Multi-Class Classification  | ⬜ Not Started        | Seven source classes exist, but the trained target is binary                                                        |
| Patient-Level Prediction    | ⬜ Not Started        | Patient IDs are used for splitting, not model aggregation                                                           |
| Longitudinal Analysis       | ⬜ Not Started        | Reliable examination dates/history are not implemented                                                              |
| Complete Digital Twin       | ⚠ Prototype / Partial | Concept and mock UI exist; state engine, data store, and progression model do not                                   |

### Estimated overall completion

A reasonable presentation estimate is **about 65% of the planned end-to-end project**. This is a heuristic, not a measured software metric. The data foundation, baseline model, internal evaluation, and prototype UI are substantial completed work. The remaining 35% includes backend serving, production data contracts, clinical/longitudinal modeling, patient-level aggregation, external validation, and an integrated digital-twin state engine.

---

## 12. Remaining Work

1. Freeze the baseline results and record model/version metadata.
2. Add a backend inference service without changing the validated preprocessing contract.
3. Connect the frontend upload flow to the backend.
4. Add model response/error/loading states and API tests.
5. Add patient/examination storage.
6. Define a real examination timestamp and eye-level identity schema.
7. Aggregate repeated image predictions to patient/eye/examination level.
8. Obtain or construct genuinely longitudinal data with dated visits.
9. Implement progression labels and a temporal model only after those labels exist.
10. Consider controlled fine-tuning as a separate experiment.
11. Consider multi-class or AMD-stage classification as a separate task.
12. Add calibration, subgroup analysis, external validation, and clinician review.
13. Add deployment security, audit logging, access control, and monitoring if the project becomes clinical-facing.

---

## 13. Limitations

### Dataset limitations

- The dataset contains 2,064 images and 820 patients, which is useful for a baseline but limited for broad clinical generalization.
- The disease classes are imbalanced; RAO has only 22 images and is not the current model target.
- Most source `eye`, `sex`, and `year` values are placeholders or unknown after cleaning.
- The source provides repeated images per patient, but the current files do not establish reliable examination dates.
- One patient has mixed AMD/non-AMD row labels.
- The dataset source/provenance and acquisition conditions are not documented in the current project files.

### Modeling limitations

- The current model is binary, not a complete disease classifier.
- The EfficientNet feature extractor is frozen; fine-tuning has not been tested.
- The model is evaluated at a default probability threshold of 0.5.
- Calibration and uncertainty estimation are not implemented.
- The test sample is one internal held-out split, not an external cohort.
- Model explanations such as Grad-CAM are not implemented.

### Digital-twin limitations

- There is no real patient database or twin-state persistence.
- There is no backend API.
- There is no real longitudinal progression predictor.
- Frontend trend values, risk score, observations, and confidence are mock values.
- The system must not be presented as a clinical diagnostic product.

---

## 14. Panel Presentation Guide

### A. Two-minute project explanation

> “My project is an AI-enabled digital twin concept for personalized eye-health monitoring using OCT images. I started by auditing the OCTDL dataset, which contains 2,064 images from 820 patients across seven disease categories. I created a validated manifest that checks image paths, readability, dimensions, duplicate content, and metadata placeholders. I then split the data at patient level rather than image level, producing 1,428 training, 327 validation, and 307 test images with zero patient overlap, which prevents a major form of data leakage.
>
> “For the first machine-learning baseline, I used an ImageNet-pretrained EfficientNetB0. The OCT images are resized to 224 by 224, converted from grayscale to three identical channels, and normalized with ImageNet statistics. I initially froze the feature extractor and trained a binary AMD versus Non-AMD head using weighted binary cross-entropy and AdamW. The model trained for 12 epochs and achieved a validation ROC-AUC of 0.905. On the untouched test set it achieved 84.69% accuracy, 0.922 ROC-AUC, and 87.93% AMD recall.
>
> “I also built a React/Vite dashboard prototype. It currently uses mock predictions to demonstrate the future workflow. The next engineering step is a backend inference API, followed by patient-level aggregation and real longitudinal data so that the digital twin can represent change over time rather than only classify one image.”

### B. Five-minute technical explanation

1. **Problem and scope:** The long-term goal is a dynamic patient representation for AMD monitoring; the current validated scope is binary OCT image classification.
2. **Data foundation:** OCTDL is stored in `data/raw/OCTDL`; the label CSV includes disease, condition, patient ID, eye, sex, year, and dimensions.
3. **Quality control:** The manifest builder verifies paths and image readability, compares actual and declared dimensions, hashes content, normalizes placeholders, and creates `target_amd`.
4. **Leakage prevention:** All usable rows are grouped by patient ID. There are 820 patients and 568 with multiple images. The three split intersections are zero.
5. **Preprocessing:** Pillow/NumPy produce `(3, 224, 224)` float32 arrays. Grayscale is replicated to three channels for ImageNet CNN compatibility. Augmentation is limited to training.
6. **Model:** TorchVision EfficientNetB0 with `EfficientNet_B0_Weights.DEFAULT`; `model.features` is frozen; the classifier becomes dropout plus one logit.
7. **Training:** AdamW, learning rate 0.0001, batch size 16, maximum 12 epochs, seed 42, weighted `BCEWithLogitsLoss`, validation ROC-AUC checkpointing, and patience 4.
8. **Results:** The final epoch had validation accuracy 83.18% and ROC-AUC 0.905. The untouched test set produced 84.69% accuracy, AMD precision 85.47%, AMD recall 87.93%, AMD F1 86.69%, and ROC-AUC 0.922.
9. **Interpretation:** The model is promising as an internal baseline, but 21 AMD cases were missed and the result is not clinical validation.
10. **Digital twin gap:** A digital twin requires patient/eye/examination history, persistence, temporal logic, and repeated dated observations. Those are planned, not implemented.
11. **Software gap:** The frontend is a mock React dashboard. A future FastAPI service should reproduce preprocessing, load the checkpoint, return predictions, and update a patient state store.

---

## 15. Likely Panel Questions and Answers

### 1. Why EfficientNetB0?

**Short answer:** It is a compact transfer-learning architecture suited to a first experiment on a limited dataset and limited compute.

**Detailed answer:** The research notes list EfficientNetB0 among candidate CNNs and select it as the initial model. Its pretrained feature extractor lets the project reuse general visual representations while training only a small binary head. A comparative benchmark against ResNet or DenseNet is not present yet.

**Keywords:** transfer learning, compact CNN, limited data, baseline, compute efficiency.

### 2. Why patient-level splitting?

**Short answer:** Multiple images from one patient can be related, so all of a patient's images must stay in one partition.

**Detailed answer:** If one patient's related images appear in both train and test, the model may benefit from patient-specific appearance rather than generalizing to unseen patients. The project assigns 820 patients to disjoint partitions and verifies all pairwise intersections are zero.

**Keywords:** patient identity, correlated samples, leakage prevention, generalization.

### 3. Why not random image-level splitting?

**Short answer:** It can put related images from the same patient in both training and testing and inflate performance.

**Detailed answer:** Image-level randomness ignores the grouping structure. With 568 patients having multiple images, this is a realistic leakage risk in this dataset.

**Keywords:** group split, correlated observations, optimistic bias.

### 4. What is data leakage?

**Short answer:** Leakage is information crossing an evaluation boundary inappropriately.

**Detailed answer:** In this project the key example is patient overlap. Other examples would be using test metrics to choose hyperparameters or modifying preprocessing based on test results. The project reserves test evaluation for the final evaluation notebook.

**Keywords:** evaluation boundary, patient overlap, optimistic estimate.

### 5. What does ROC-AUC 0.922 mean?

**Short answer:** It measures how well the model ranks AMD above Non-AMD across thresholds; 0.922 is strong for this internal test sample.

**Detailed answer:** ROC-AUC is threshold-independent ranking performance. It is not the probability that a particular prediction is correct and does not prove clinical usefulness.

**Keywords:** ranking, thresholds, sensitivity/specificity tradeoff, not clinical probability.

### 6. Why is 84.69% accuracy not enough alone?

**Short answer:** Accuracy can hide class-specific failures and does not show which errors are AMD misses versus false alerts.

**Detailed answer:** The project therefore reports precision, recall, F1, ROC-AUC, a classification report, and a confusion matrix. Accuracy must be interpreted with class distribution and clinical priorities.

**Keywords:** class distribution, false negatives, confusion matrix, sensitivity.

### 7. Why is AMD recall important?

**Short answer:** Recall shows how many actual AMD images were detected, so it directly reflects missed AMD cases.

**Detailed answer:** The model detected 153 of 174 AMD images and missed 21. A screening workflow may prioritize reducing missed disease, although the appropriate operating point requires clinical input.

**Keywords:** sensitivity, false negatives, screening, clinical operating point.

### 8. What is precision?

**Short answer:** Precision is the proportion of AMD predictions that were actually AMD.

**Detailed answer:** AMD precision was 85.47%. Lower precision means more Non-AMD images would receive false AMD alerts.

**Keywords:** positive predictive value, false positives, alert burden.

### 9. What is F1-score?

**Short answer:** F1 is the harmonic mean of precision and recall.

**Detailed answer:** AMD F1 was 86.69%, summarizing the balance between finding AMD and avoiding false AMD predictions.

**Keywords:** harmonic mean, precision-recall balance, threshold.

### 10. What does the confusion matrix show?

**Short answer:** It counts actual-versus-predicted class outcomes.

**Detailed answer:** The model correctly classified 107 Non-AMD and 153 AMD images; it produced 26 false AMD predictions and missed 21 AMD images.

**Keywords:** true negatives, true positives, false positives, false negatives.

### 11. Why use an untouched test set?

**Short answer:** To obtain an evaluation that was not used to train or select the model.

**Detailed answer:** Training uses train data, checkpoint selection uses validation ROC-AUC, and the test set is evaluated afterward once. This reduces optimistic reporting.

**Keywords:** held-out data, model selection, unbiased internal estimate.

### 12. What is transfer learning?

**Short answer:** It adapts knowledge learned on a large source dataset to a new target task.

**Detailed answer:** EfficientNetB0 starts from ImageNet weights, then its classifier is adapted to one AMD/Non-AMD logit.

**Keywords:** pretrained representation, source task, target task.

### 13. What are ImageNet weights?

**Short answer:** Parameters learned by EfficientNetB0 on the ImageNet image-recognition dataset.

**Detailed answer:** They are generic visual features, not OCT-specific clinical knowledge. The project must validate whether those features transfer well to OCT.

**Keywords:** pretrained weights, domain shift, feature reuse.

### 14. What does freezing layers mean?

**Short answer:** Frozen parameters do not receive gradient updates during training.

**Detailed answer:** The project sets `requires_grad = False` for `model.features`. Only the replacement dropout/linear classifier is trained in the baseline.

**Keywords:** requires_grad, frozen backbone, trainable head.

### 15. Why freeze the feature extractor first?

**Short answer:** It creates a stable, lower-compute baseline and reduces overfitting risk on a limited dataset.

**Detailed answer:** Fine-tuning can be tested later as a separate experiment after establishing the frozen baseline.

**Keywords:** stability, compute, overfitting, baseline.

### 16. What is fine-tuning?

**Short answer:** Fine-tuning unfreezes some pretrained layers and updates them for the target OCT task.

**Detailed answer:** Fine-tuning is not implemented in the current project. It should use a lower learning rate and a separate experiment protocol.

**Keywords:** unfreezing, domain adaptation, lower learning rate.

### 17. What preprocessing was used?

**Short answer:** Grayscale conversion, three-channel replication, 224x224 resize, and ImageNet normalization.

**Detailed answer:** Training additionally uses small rotation, brightness, contrast, and translation changes. Validation and test are deterministic.

**Keywords:** channel compatibility, normalization, augmentation isolation.

### 18. Why convert grayscale to three channels?

**Short answer:** Pretrained EfficientNetB0 expects three-channel input.

**Detailed answer:** The project repeats the grayscale OCT signal into three channels instead of creating artificial color. This preserves intensity information while satisfying the model interface.

**Keywords:** grayscale, RGB interface, no invented color.

### 19. How was class imbalance handled?

**Short answer:** The positive-class loss weight was calculated from training counts and passed to `BCEWithLogitsLoss`.

**Detailed answer:** The training set contains 858 AMD and 570 Non-AMD images, giving `pos_weight ≈ 0.664336`. Evaluation metrics remain based on the original labels.

**Keywords:** class weighting, training-only statistics, BCEWithLogitsLoss.

### 20. What optimizer and learning rate were used?

**Short answer:** AdamW with learning rate 0.0001.

**Detailed answer:** These are the controlled training settings in `07_model_training.ipynb`; the earlier architecture notebook has a separate disabled Adam setup and should not be confused with the completed run.

**Keywords:** AdamW, 1e-4, controlled baseline.

### 21. How was early stopping used?

**Short answer:** Patience was four epochs without validation-score improvement.

**Detailed answer:** The run completed all 12 epochs, so early stopping was not triggered. The best checkpoint was selected by validation ROC-AUC.

**Keywords:** patience, validation ROC-AUC, checkpoint.

### 22. How does the frontend connect to the model?

**Short answer:** It does not connect yet; it currently returns mock prediction data.

**Detailed answer:** `App.jsx` creates an object URL for the uploaded image and the analyze action uses a timeout plus a hard-coded AMD/87% result. The code includes a TODO for replacing this with a backend API call.

**Keywords:** React, mock prediction, FastAPI, API seam.

### 23. Why is this called a Digital Twin?

**Short answer:** The intended system maintains a patient-specific digital representation that updates as new examinations arrive.

**Detailed answer:** The current implementation has the concept and a mock dashboard, but not the persistent, longitudinal state engine required for a complete digital twin.

**Keywords:** patient state, historical examinations, continuous update.

### 24. What is currently missing from the Digital Twin?

**Short answer:** Real patient history storage, dated examinations, eye-level state, progression modeling, backend inference, and clinical validation.

**Detailed answer:** Current patient IDs are sufficient for leakage-safe splitting but do not by themselves provide reliable visit chronology. The twin cannot yet make evidence-based progression claims.

**Keywords:** longitudinal data, persistence, temporal model, progression.

### 25. How will longitudinal disease progression work?

**Short answer:** Future visits should be ordered by real examination timestamps, analyzed per eye, aggregated into a patient history, and modeled for state transitions or future risk.

**Detailed answer:** The project must first obtain reliable dated repeated examinations and define progression labels. A rule-based state representation could precede a temporal model, but neither is implemented yet.

**Keywords:** examination date, eye identity, time series, state transition.

### 26. What are the dataset limitations?

**Short answer:** Small single-dataset scale, imbalance, limited metadata, unknown provenance in current files, and no reliable longitudinal timeline.

**Detailed answer:** These limitations restrict generalization and prevent claiming progression prediction from the current OCTDL data alone.

**Keywords:** external validation, metadata completeness, domain shift, longitudinal labels.

### 27. Is the model clinically validated?

**Short answer:** No.

**Detailed answer:** The result is an internal held-out OCTDL evaluation. There is no external cohort, prospective study, clinician adjudication, calibration study, or deployment evaluation in the current project.

**Keywords:** research prototype, internal benchmark, not diagnostic, external validation.

### 28. What makes this different from a simple image classifier?

**Short answer:** The intended contribution is the patient-specific, longitudinal layer around image analysis.

**Detailed answer:** The current baseline is still an image classifier. The differentiating digital-twin layer remains future work: persistent patient/eye history, repeated predictions, current state, trends, and progression risk.

**Keywords:** image model versus patient state, longitudinal monitoring, digital twin.

### 29. Why were unusual aspect-ratio images not removed?

**Short answer:** An aspect-ratio outlier is not automatically a corrupted or clinically invalid image.

**Detailed answer:** The audit found 41 unusual aspect-ratio flags but zero unreadable and zero blank images. They were retained for review rather than deleted without evidence.

**Keywords:** quality flag, human review, no automatic deletion.

### 30. What is the next technically responsible step?

**Short answer:** Connect the frozen checkpoint to a controlled backend inference service, then add patient/eye/examination persistence before progression modeling.

**Detailed answer:** The model should be served with the same preprocessing, return a versioned prediction response, and be evaluated through API tests before any clinical-style dashboard claims are made.

**Keywords:** reproducibility, API contract, model versioning, longitudinal state.

---

## 16. Final Review Checklist

Before presenting, be able to explain:

- Why the target is AMD versus Non-AMD rather than seven-class prediction.
- Why patient-level splitting is more trustworthy than image-level splitting.
- What `usable` means in the manifest.
- Why unusual aspect ratios were flagged but not deleted.
- Why grayscale images become three channels.
- Why ImageNet normalization matches the pretrained model.
- Which parameters were frozen and which were trainable.
- Why the positive-class loss weight is less than 1 here: AMD is the more frequent class in training, so the negative class is the minority and the positive class is down-weighted by the chosen formula.
- That the completed training used AdamW at 0.0001 for 12 epochs.
- That validation ROC-AUC was 0.905193 and test ROC-AUC was 0.922003.
- That test accuracy was 84.69%, but 21 AMD images were missed.
- That the results are promising internal evidence, not clinical validation.
- That the frontend is a mock prototype, not a deployed model interface.
- That a complete digital twin requires real longitudinal patient/eye/examination data and a state engine.

## 17. One-Sentence Project Position

> This project has completed a reproducible, patient-leakage-safe OCTDL baseline for AMD versus Non-AMD classification and a demonstration dashboard, while the backend-connected, longitudinal digital-twin system remains the next major development phase.
