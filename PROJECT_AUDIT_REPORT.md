# AMD Digital Twin — Complete Project Audit and Implementation Report

## Scope and evidence basis

This report is based on the files currently present in the project workspace, saved result tables, and the project understanding notes. It distinguishes between:

- Verified facts: present in committed artifacts, CSV outputs, notebooks, and saved model metadata.
- Code-based inferences: conclusions that directly follow from the code path but are not directly verified in a live execution.
- Unknowns: items that cannot be confirmed from the available project files.

No source code, notebooks, split files, model weights, datasets, or report outputs were modified while preparing this audit.

---

## Executive summary

This project has a legitimate and technically meaningful ML foundation:

- It contains a cleaned OCT dataset pipeline and patient-level split logic.
- It includes a documented EfficientNetB0 transfer-learning baseline.
- It stores training and held-out evaluation artifacts showing measurable performance on an internal test split.
- It has a React/Vite dashboard prototype, but it is still a demonstration front end rather than a verified clinical or digital-twin system.

The strongest verified achievements are the data pipeline, leakage-safe split design, preprocessing, and the trained baseline model plus held-out evaluation.

The most important gap is that the project does not yet contain a real longitudinal digital twin. It is not a genuine longitudinal patient model, progression predictor, or clinical system. The current implementation is best described as a solid academic binary-classification baseline with a mock application layer, not a clinically valid digital twin.

---

## 1. Project structure and implementation status

### Top-level structure

| Path | Purpose | Implementation status |
| --- | --- | --- |
| [data/raw/OCTDL](data/raw/OCTDL) | Original source OCT image dataset and labels | Verified as source data |
| [data/Processed](data/Processed) | Cleaned manifest, patient splits, quality audit outputs, preprocessing validation outputs | Verified |
| [notebooks](notebooks) | Sequential project workflow notebooks | Verified for analysis/training stages |
| [src](src) | Reusable preprocessing code | Verified |
| [models](models) | Saved model checkpoint(s) | Verified |
| [results](results) | Training history and evaluation metrics | Verified |
| [docs](docs) | Research and project understanding notes | Verified |
| [Frontend](Frontend) | React/Vite front-end dashboard | Partially implemented; mostly static/mock UI with real backend connection added later in the active app branch, but not in the repository snapshot audited here |
| [backend](backend) | FastAPI backend and inference logic | Not present in the repository snapshot audited here; the repository currently includes the directory but it is part of the later prototype task, not the original project snapshot |
| [apps](apps) | Reserved application area | Not started |
| [tests](tests) | Test directory | Not observed in the current repository snapshot |

### Important files and artifacts

| File / directory | Role | Status |
| --- | --- | --- |
| [data/raw/OCTDL/OCTDL_labels.csv](data/raw/OCTDL/OCTDL_labels.csv) | Source image labels and patient metadata | Verified |
| [data/Processed/manifest.csv](data/Processed/manifest.csv) | Cleaned image manifest with target_amd and usability flags | Verified |
| [data/Processed/train.csv](data/Processed/train.csv) | Training split | Verified |
| [data/Processed/validation.csv](data/Processed/validation.csv) | Validation split | Verified |
| [data/Processed/test.csv](data/Processed/test.csv) | Held-out test split | Verified |
| [data/Processed/split_report.csv](data/Processed/split_report.csv) | Split statistics | Verified |
| [data/Processed/split_patient_overlap.csv](data/Processed/split_patient_overlap.csv) | Zero patient overlap across train/val/test | Verified |
| [data/Processed/quality_inspection/inspection_report.csv](data/Processed/quality_inspection/inspection_report.csv) | Image-readability and quality summary | Verified |
| [src/oct_preprocessing.py](src/oct_preprocessing.py) | Reusable OCT preprocessing pipeline | Verified |
| [notebooks/01_data_exploration.ipynb](notebooks/01_data_exploration.ipynb) | Dataset exploration | Verified as project file |
| [notebooks/02_data_cleaning_and_manifest.ipynb](notebooks/02_data_cleaning_and_manifest.ipynb) | Manifest creation | Verified |
| [notebooks/03_image_quality_inspection.ipynb](notebooks/03_image_quality_inspection.ipynb) | Quality review | Verified |
| [notebooks/04_patient_level_split.ipynb](notebooks/04_patient_level_split.ipynb) | Patient-level splitting | Verified |
| [notebooks/05_preprocessing_pipeline.ipynb](notebooks/05_preprocessing_pipeline.ipynb) | Preprocessing pipeline | Verified |
| [notebooks/06_baseline_model.ipynb](notebooks/06_baseline_model.ipynb) | Architecture and baseline selection | Verified |
| [notebooks/07_model_training.ipynb](notebooks/07_model_training.ipynb) | Training execution | Verified as part of the project workflow |
| [notebooks/08_model_evaluation.ipynb](notebooks/08_model_evaluation.ipynb) | Final evaluation | Verified as part of the project workflow |
| [models/baseline_efficientnetb0_best.pth](models/baseline_efficientnetb0_best.pth) | Best checkpoint from training | Verified |
| [results/baseline_training_history.csv](results/baseline_training_history.csv) | Per-epoch metrics | Verified |
| [results/evaluation/test_metrics.csv](results/evaluation/test_metrics.csv) | Final held-out metrics | Verified |
| [results/evaluation/classification_report.csv](results/evaluation/classification_report.csv) | Precision/recall/F1 report | Verified |
| [docs/project_understanding.md](docs/project_understanding.md) | Project summary and interpretation | Verified |
| [docs/amd_research.md](docs/amd_research.md) | Research context and digital twin framing | Verified |
| [Frontend/src/App.jsx](Frontend/src/App.jsx) | Dashboard UI | Partial/prototype; seen as mock/illustrative in the original project snapshot |

### Actual workflow: what is implemented

Observed project flow in the available artifacts:

1. Source OCTDL images + metadata are loaded.
2. Image files and labels are cleaned into a manifest.
3. Quality checks are performed on image readability and unusual dimensions/aspect ratios.
4. Patients are assigned to train, validation, and test splits without cross-split patient overlap.
5. A reusable OCT preprocessing pipeline converts grayscale OCT to RGB, resizes to 224×224, and applies ImageNet normalization.
6. EfficientNetB0 is selected as a transfer-learning baseline.
7. Training is executed with validation monitoring and model checkpointing.
8. Final held-out evaluation is performed on a separate test set.

Important qualification: this flow ends at binary classification. There is no verified patient longitudinal timeline, progression model, or clinical monitoring engine in the current project snapshot.

### What is mock, placeholder, or not implemented

The repository snapshot shows these as not truly implemented in the original project scope:

- Patient-specific multivisit digital twin logic: not present.
- Longitudinal disease progression prediction: not present.
- Backend inference API: not present in the core project snapshot.
- Real upload + model prediction via a functioning FastAPI service: not present in the original project files.
- Clinical or patient risk-score calibration: not present.
- Real monitoring of changes across months or visits: not present.

The frontend may look polished, but the project understanding document explicitly describes it as a mock React/Vite dashboard rather than a verified production-ready app.

---

## 2. Dataset and data quality

### Dataset source and scale

The project uses the OCTDL dataset, organized under [data/raw/OCTDL](data/raw/OCTDL), with labels stored in [data/raw/OCTDL/OCTDL_labels.csv](data/raw/OCTDL/OCTDL_labels.csv).

From the saved project notes and manifest outputs:

- Total labeled raw images: 2,064
- Unique patients: 820
- Usable images after cleaning: 2,062
- Binary label target: AMD vs Non-AMD
- Split sizes:
  - Train: 1,428 images, 574 patients
  - Validation: 327 images, 123 patients
  - Test: 307 images, 123 patients

The project defines `target_amd = (disease == "AMD").astype("int8")` in the cleaning process as shown in the notebook and project notes, so the labeling task is binary classification.

### Class distribution and imbalance

From [data/Processed/split_report.csv](data/Processed/split_report.csv):

- Train: 858 AMD / 570 Non-AMD
- Validation: 197 AMD / 130 Non-AMD
- Test: 174 AMD / 133 Non-AMD

This is moderately imbalanced but not extreme. The project does not appear to use a heavily skewed class distribution without any correction, but the training history and final metrics remain reportable. It is not a balanced dataset by class, and the project should be interpreted with that in mind.

### Missing, corrupted, unusual images, and quality checks

The project includes an explicit quality audit:

- [data/Processed/quality_inspection/inspection_report.csv](data/Processed/quality_inspection/inspection_report.csv) reports:
  - Total images: 2064
  - Readable images: 2064
  - Unreadable or missing: 0
  - Blank or near-blank images: 0
  - Unusual aspect-ratio images: 41
  - Unusual-dimension images: 1
  - Potentially unusual images: 41

This means the dataset is largely usable as provided, with no unreadable or missing images in the audited manifest. The project did perform a quality inspection and flagged unusual cases, but the data itself was not modified in the original source directory.

### Patient-level leakage and split safety

This is one of the strongest project aspects.

The project explicitly reports patient-level splitting and zero patient overlap across split pairs:

- [data/Processed/split_patient_overlap.csv](data/Processed/split_patient_overlap.csv)
  - train_validation: 0
  - train_test: 0
  - validation_test: 0

This is the correct design for patient-aware ML evaluation and prevents direct leakage from same-patient images appearing across partitions.

### Potential evaluation weaknesses and data leakage concerns

The split logic is clearly designed to avoid patient leakage. However, a few caveats remain:

- The dataset is still image-level classification, not visit-level or longitudinal modeling.
- The model is trained and evaluated on a binary image-level task rather than a patient timeline.
- A patient could still have multiple OCT images within the same split, which is acceptable for image-level training but means the model is learning from repeated observations from the same patient within one partition.
- The project does not present a separate external validation cohort or multi-site validation dataset.

This means the project is a sound internal biomedical ML project, but not a clinically validated system.

---

## 3. Model implementation

### Architecture and pretrained weights

The project uses a pretrained EfficientNetB0 backbone. The project notes and code indicate:

- Architecture: EfficientNetB0
- Source weights: ImageNet-pretrained
- Task: binary AMD versus Non-AMD classification
- Model head: a binary logit/classifier output adapted to one output value in the final layer

The implementation and project notes support the following technical picture:

- Backbone: EfficientNetB0 with pretrained ImageNet weights
- Feature extractor: frozen in the baseline setup
- Classifier: replacement network head trained for binary classification
- Loss: binary cross-entropy via BCEWithLogitsLoss (as described in the project understanding notes)
- Optimizer: AdamW with learning rate 0.0001 (per project notes)
- Epochs: 12
- Batch size: 16 (per project understanding notes)
- Random seed: 42 (per project notes)

The saved checkpoint is [models/baseline_efficientnetb0_best.pth](models/baseline_efficientnetb0_best.pth). The project notes describe it as a model checkpoint with epoch information and validation metrics.

### Preprocessing pipeline

The processing logic is in [src/oct_preprocessing.py](src/oct_preprocessing.py).

The project preprocessing is explicitly:

- Read image with Pillow
- Convert grayscale OCT to RGB
- Resize to 224×224
- Normalize to ImageNet mean and standard deviation
- Output as float32 CHW tensor

This matches the pretrained CNN input contract and is a standard transfer-learning setup.

The quality-audit artifact [data/Processed/preprocessing_inspection/preprocessing_summary.csv](data/Processed/preprocessing_inspection/preprocessing_summary.csv) confirms:

- Output image size: 224×224
- Number of channels: 3
- Normalization method: ImageNet mean/std
- Training augmentations: rotation, brightness/contrast variation, and translation
- Validation/test method: no augmentation, deterministic preprocessing

### Training execution status

The project appears to have actually executed training, not just written an untested training script.

Evidence:

- [results/baseline_training_history.csv](results/baseline_training_history.csv) contains epoch-by-epoch training metrics for 12 epochs.
- The final epoch metrics show real train/validation curves.
- [models/baseline_efficientnetb0_best.pth](models/baseline_efficientnetb0_best.pth) exists and is referenced as the best checkpoint.
- [results/evaluation/test_metrics.csv](results/evaluation/test_metrics.csv) contains final held-out metrics from the saved checkpoint.

This shows the project did train a baseline model and save the model artifact.

### Model capability limits

The code and artifacts support only this scope:

- Binary AMD vs Non-AMD classification on OCT images
- Single-image prediction
- No multiclass grading system
- No severity grading pipeline
- No progression prediction model
- No multi-visit or patient-history forecasting

The project is not verified to support disease staging, progression estimates, or clinically calibrated risk prediction.

---

## 4. Model performance and reliability

### Verified metrics from saved outputs

These metrics are present in the saved evaluation artifacts and are therefore verifiable.

| Metric | Value | Source |
| --- | ---: | --- |
| Test images | 307 | [results/evaluation/test_metrics.csv](results/evaluation/test_metrics.csv) |
| Test patients | 123 | [results/evaluation/test_metrics.csv](results/evaluation/test_metrics.csv) |
| Accuracy | 0.8469055374592834 (84.69%) | [results/evaluation/test_metrics.csv](results/evaluation/test_metrics.csv) |
| Precision (AMD-positive class) | 0.8547486033519553 (85.47%) | [results/evaluation/test_metrics.csv](results/evaluation/test_metrics.csv) |
| Recall (AMD-positive class) | 0.8793103448275862 (87.93%) | [results/evaluation/test_metrics.csv](results/evaluation/test_metrics.csv) |
| F1-score (AMD-positive class) | 0.8668555240793201 (86.69%) | [results/evaluation/test_metrics.csv](results/evaluation/test_metrics.csv) |
| ROC-AUC | 0.9220032840722495 | [results/evaluation/test_metrics.csv](results/evaluation/test_metrics.csv) |

The classification report provides class-level detail:

- Non-AMD precision: 0.8359375
- Non-AMD recall: 0.8045112781954887
- Non-AMD F1: 0.8199233716475096
- AMD precision: 0.8547486033519553
- AMD recall: 0.8793103448275862
- AMD F1: 0.8668555240793201

The project understanding notes explicitly summarize the confusion-matrix-level interpretation:

- 107 Non-AMD correctly classified
- 153 AMD correctly classified
- 26 false AMD predictions
- 21 missed AMD cases

### What these results mean

These metrics are strong for an internal baseline in a constrained OCT classification task. They are meaningful evidence that the model learned something useful and that the split and preprocessing pipeline are coherent.

However:

- The result is still a binary classification metric, not a longitudinal prognosis.
- It is not clinical validation.
- It should be interpreted as a strong internal ML benchmark, not as a deployment-grade clinical performance claim.

### Reliability and evaluation quality

The project appears to follow a reasonable evaluation discipline:

- Training uses training images.
- Validation is used for checkpoint/selection decisions.
- Final held-out test is separate.
- Patient overlap is zero across splits.

This reduces common leakage errors. Still, the project does not include external validation, prospective deployment testing, calibration, or clinical utility assessment. Those remain missing.

### Known weaknesses

The project does not appear to include:

- Statistical uncertainty intervals for metrics
- Calibration curves or reliability diagrams
- Sensitivity/specificity analysis at clinically tuned thresholds
- External validation on a separate dataset
- Patient-level risk calibration or longitudinal outcome modeling

These are important if the project is to be presented as clinically reliable, but they are not required to call it a strong internal research project.

---

## 5. Explainability and Digital Twin functionality

The following classifications are based on the current project evidence and should be read as either verified, partially implemented, or absent.

| Capability | Classification | Justification |
| --- | --- | --- |
| OCT image upload and validation | Partially implemented / not verified in the original snapshot | The project includes preprocessing and data pipelines, but no verified backend upload pipeline exists in the original repository snapshot. The front-end dashboard is a prototype/mock UI. |
| Real inference using the trained model | Partially implemented / not verified in the original snapshot | The model and checkpoint exist, and the project notes describe a run pipeline, but the repository snapshot does not include a confirmed live inference service loading the exact checkpoint for end-to-end use. |
| AMD probability or risk score | Working and verified at the model-output level | The saved evaluation metrics and model design produce a probability score and prediction threshold; this is a binary classification probability, not a clinical risk score. |
| Prediction threshold and interpretation | Working and verified at the code level | The project interprets AMD vs Non-AMD using a binary decision with thresholding. The class output is a probability threshold, not a clinical disease-risk model. |
| Grad-CAM or another explanation method | Not implemented or not verified in the original snapshot | The project does not show a verified Grad-CAM artifact or a reproducible explanation pipeline in the audited repository snapshot. |
| Patient profile and patient-specific data | Partially implemented | The dataset includes patient metadata, and the project used patient-level splits. But no verified patient profile system or structured digital twin database is present. |
| Longitudinal patient history and visualization | Not implemented | No verified time-series, repeated examinations, visit timeline, or longitudinal patient record system is present. |
| Monitoring changes across multiple visits | Not implemented | The project does not have a verified visit-tracking or repeated-measurement framework. |
| Disease progression prediction | Not implemented | No progression model or temporal predictive target is present. |
| Backend API and frontend integration | Not implemented in the original snapshot | The original project understanding specifically states that a FastAPI backend is not present. |
| Error handling and user feedback | Partially implemented / not verified | The frontend may have UI behaviors, but the original snapshot does not demonstrate a validated production-grade error-handling layer. |

### Important distinction

The project is a binary imaging classifier, not a true digital twin. A digital twin requires:

- patient-specific state,
- repeated observation history,
- date-stamped visits,
- longitudinal logic,
- trajectory estimation,
- and clinical data fusion.

None of these are verified in the present project files.

---

## 6. Reproducibility and software quality

### Dependencies and environment

The project references a Python ML environment using packages such as:

- PyTorch
- TorchVision
- PIL/Pillow
- NumPy
- pandas
- scikit-learn
- Jupyter
- matplotlib

The environment directories [ .venv ](.venv) and [venv](venv) are present, indicating a working ML environment existed for the project. However, the repository snapshot does not show a clean, single reproducibility manifest such as a pinned requirements file or lock file for the exact environment used in training.

### Paths and runtime assumptions

The project appears to rely on local relative paths such as:

- [data/raw/OCTDL](data/raw/OCTDL)
- [data/Processed](data/Processed)
- [models/baseline_efficientnetb0_best.pth](models/baseline_efficientnetb0_best.pth)
- [results](results)

This is workable for a local project but not portable without the same folder layout. The project did not provide a fully normalized startup script or environment bootstrap for fresh reproduction.

### Security and privacy concerns

The project appears to use a public research dataset, not patient identifiers in the direct prediction workflow. However:

- Patient IDs are present in raw metadata and could be sensitive if reidentified.
- A real app layer would need careful security/privacy rules before any clinical or patient data is stored.
- No protected health information handling protocol was observed.

For a research prototype, the current approach is acceptable, but it is not a clinical-grade patient-data system.

### Missing tests and validation coverage

The repository snapshot does not show a robust automated test suite for:

- model loading,
- preprocessing correctness,
- split integrity,
- CLI entrypoints,
- API endpoints,
- or frontend rendering.

This is a common limitation in research notebooks and prototype repos, but it does reduce software confidence.

### Safe lightweight checks performed

The following checks were limited, safe, and non-destructive:

- Directory inspection of project structure
- Verification of saved split CSVs and evaluation CSVs
- Validation of file existence and reported counts in the project’s saved outputs
- Confirmation that the project contains a patient-level split artifact, image-quality inspection files, and a saved baseline checkpoint

### Audit checks that could not be completed

The following cannot be confidently checked from the repository snapshot alone without running notebooks or app code:

- Full notebook execution confirmation for all eight notebooks
- End-to-end model training rerun from scratch
- Frontend interaction in a browser
- Real live inference through a backend service
- Clinical performance or cross-dataset generalization beyond the saved outputs
- UI behavior in a launched browser session

This is not a flaw in the audit; it is a limitation of the available project evidence.

---

## 7. Project-worthiness assessment

### What has genuinely been achieved

The project has achieved a credible research foundation:

- Data cleaning and manifest creation
- Image-quality auditing
- Patient-aware split generation
- Reusable preprocessing pipeline
- EfficientNetB0 baseline training
- Training history recording
- Held-out evaluation on a stable internal test split
- Organizing the project around reproducible ML artifacts

This is a solid, technically meaningful academic ML project.

### What is technically meaningful

The most meaningful parts are:

- patient-level data partitioning,
- binary AMD classification on OCT images,
- transfer learning with EfficientNetB0,
- reproducible saved metrics,
- and a workflow that is understandable and auditable.

### What is still basic, incomplete, or overstated

The project is still basic in the following areas:

- no true digital twin state model,
- no longitudinal progression prediction,
- no verified live API back end,
- no clinical calibration,
- no real patient tracking beyond a mock dashboard or static demonstration,
- no external validation.

It is overstated to call this a digital twin or a clinically validated diagnostic system.

### Strongest existing features to demonstrate to a college project panel

The strongest project features are:

1. Data-quality and split integrity workflow.
2. Patient-aware leakage-safe evaluation strategy.
3. EfficientNetB0 transfer-learning baseline with real metrics.
4. Training and validation curves plus held-out test evaluation.
5. Clear separation between research prototype and non-clinical claims.

These are all strong evidence-based project contributions.

### Five most important gaps to fix, ranked by priority

1. Implement a verified end-to-end inference pipeline from image input to model output and not just notebook logic.
2. Replace mock or placeholder app behavior with a real live backend/front-end integration if the project intends to be interactive.
3. Add a true patient/timeline model or at minimum a formal patient-state representation with timestamped observations.
4. Establish a more rigorous evaluation story: calibration, external validation, and threshold selection.
5. Clarify the actual scope in the project narrative so it is framed as a binary OCT classifier, not an end-to-end clinical digital twin.

### Best description of the current project

This current project is best classified as:

- A solid academic ML project for binary OCT classification
- A prototype research pipeline with careful data hygiene and patient-aware evaluation
- Not yet a credible clinical-grade digital twin or monitoring system

The project is not yet a complete digital twin prototype in the clinical or operational sense.

### Practical next-step roadmap

A realistic roadmap, based on the project as it stands, is:

1. Keep the data pipeline, split integrity, and evaluation results as the project’s foundation.
2. Add a real backend inference service that loads the saved checkpoint and returns probabilities.
3. Add a patient-state schema with timestamped scans and observation records.
4. Add a longitudinal tracking layer that is clearly labeled as a prototype, not a clinical risk engine.
5. Expand evaluation from single-image binary classification to a properly framed patient-level monitoring workflow.

---

## 8. Evidence and report quality

### Verified facts

The following are directly supported by the project artifacts reviewed:

- The project contains a valid OCT image dataset and metadata in [data/raw/OCTDL](data/raw/OCTDL).
- [data/Processed/split_patient_overlap.csv](data/Processed/split_patient_overlap.csv) shows zero patient overlap across train/validation/test.
- [data/Processed/quality_inspection/inspection_report.csv](data/Processed/quality_inspection/inspection_report.csv) shows no unreadable or missing images.
- [src/oct_preprocessing.py](src/oct_preprocessing.py) implements grayscale-to-RGB resizing and ImageNet normalization.
- [results/baseline_training_history.csv](results/baseline_training_history.csv) contains epoch-wise training metrics.
- [results/evaluation/test_metrics.csv](results/evaluation/test_metrics.csv) contains final held-out performance values.
- [models/baseline_efficientnetb0_best.pth](models/baseline_efficientnetb0_best.pth) exists and is the saved baseline checkpoint.

### Code-based inferences

The following are reasonably supported by code and notes but were not re-executed in a full live environment:

- The model architecture is EfficientNetB0 with a binary output head.
- The project likely ran 12 training epochs with AdamW and BCEWithLogitsLoss.
- The front-end dashboard is a mock/prototype layer rather than a verified live application.

### Unknowns / limitations

The following cannot be confirmed beyond the saved artifacts and project notes:

- Whether every notebook executed cleanly from top to bottom without a runtime error
- Whether all visualizations are generated from fresh data and not stale outputs
- Whether the later backend/frontend implementation exists in the project snapshot being audited
- Whether a true digital twin or longitudinal model exists in a live repository branch not included in this snapshot

---

## Final assessment

This project is best characterized as a strong, audited binary AMD classification pipeline with careful data handling and solid training/evaluation artifacts. It is not yet a credible clinical digital twin or a clinically validated prediction system.

It is meaningful enough to defend as an academic ML project and a research prototype, but it must be presented honestly as a single-image AMD classifier with patient-aware evaluation, not as a complete digital twin.

---

## Report path

This report was created at:

[PROJECT_AUDIT_REPORT.md](PROJECT_AUDIT_REPORT.md)

## Audit checks that could not be completed

The following audit steps were not completed because they would require running notebook cells, retraining the model, or launching a live app environment beyond the safe, read-only evidence collection requested:

- full notebook execution confirmation,
- fresh training rerun from scratch,
- browser-based UI verification,
- live backend inference verification in a running app,
- external validation or clinical benchmarking beyond the saved artifacts,
- any modification of datasets, model files, split files, or outputs.
