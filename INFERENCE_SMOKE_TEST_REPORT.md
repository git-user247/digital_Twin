# AMD Digital Twin — Saved Model Inference Smoke-Test Report

## Scope

This report verifies whether the saved EfficientNetB0 checkpoint can load and produce an inference result using the project's existing inference code. It separates checks that were actually executed from conclusions drawn by inspecting source and saved artifacts.

No source code, notebook, dataset, split, model checkpoint, or evaluation output was modified. The smoke test did not train, tune, or alter the model. It used an image from the training split, not the held-out test split.

This is an engineering smoke test, not clinical validation.

## Result summary

| Check | Result |
| --- | --- |
| Checkpoint | Loaded successfully |
| Checkpoint epoch recorded in artifact | 12 |
| Device used | CPU |
| Smoke-test image | `data\raw\OCTDL\AMD\amd_1047099_1.jpg` |
| Split membership | Train; confirmed absent from `data\Processed\test.csv` |
| Preprocessed input tensor | `(1, 3, 224, 224)` |
| Model logits tensor | `(1, 1)` |
| Output probability | `sigmoid(0.9240139127) = 0.7158592939` |
| Predicted class | AMD |
| AMD probability | 0.7158592939 (71.59%) |
| Non-AMD probability | 0.284141 (28.41%) |
| Inference completed | Yes |

The successful execution used the existing `ModelService` implementation in [backend/model_service.py](backend/model_service.py), not a separately reconstructed prediction routine.

## Checks actually executed

### Checkpoint and architecture loading

The checkpoint was opened read-only and loaded through `ModelService()`:

- Path: [models/baseline_efficientnetb0_best.pth](models/baseline_efficientnetb0_best.pth)
- Checkpoint type: Python dictionary
- Keys observed: `model_state_dict`, `optimizer_state_dict`, `epoch`, `validation_metrics`, `validation_loss`, and `random_seed`
- Recorded epoch: `12`
- Model state dictionary: 360 entries
- Final classifier weight shape: `(1, 1280)`
- Final classifier bias shape: `(1,)`
- `ModelService.model_ready`: `True`
- Device: CPU

`build_binary_efficientnet()` constructs EfficientNetB0 with a one-output classifier, and `load_model()` loads the checkpoint state with `strict=True`. This strict load succeeded, confirming that the inference model's parameter names and tensor shapes are compatible with the saved state dictionary.

### One-image inference

The smoke-test image was selected from the first usable row in [data/Processed/train.csv](data/Processed/train.csv). The script also checked that the selected relative image path was not present in [data/Processed/test.csv](data/Processed/test.csv).

Observed values from the project inference implementation:

```text
preprocessed input shape: (1, 3, 224, 224)
model output shape:       (1, 1)
logit:                    0.9240139126777649
sigmoid probability:      0.7158592939376831
prediction:               AMD
confidence:               71.59%
class probabilities:      Non-AMD 0.284141, AMD 0.715859
```

The single sample demonstrates that the checkpoint can perform inference on a suitable project OCT image. It does not establish generalization, reliability, or clinical performance.

### Preprocessing parity on the tested image

Training and evaluation use `preprocess_image()` from [src/oct_preprocessing.py](src/oct_preprocessing.py). That function reads the OCT image as grayscale, resizes it to 224×224 with LANCZOS, converts the grayscale image to three channels, and applies ImageNet mean/std normalization.

`ModelService.preprocess_pil_image()` in [backend/model_service.py](backend/model_service.py) converts its PIL image directly to RGB, resizes with LANCZOS, and applies the same ImageNet normalization and CHW layout.

For the tested image:

- PIL reported the source mode as RGB.
- Its three color channels were pixel-identical.
- The max absolute difference between the training preprocessing tensor and service preprocessing tensor was `0.0`.
- Running the model with either tensor produced the same probability, `0.7158592939`.

Therefore the two preprocessing paths were exactly equivalent for this tested OCT image. The code paths are not textually identical: the shared training function explicitly converts to grayscale, whereas the service converts to RGB. This smoke test verifies parity for the selected monochrome image only; it does not prove parity for arbitrary future color images.

## Code-inspection conclusions

### Architecture and checkpoint format

In [notebooks/07_model_training.ipynb](notebooks/07_model_training.ipynb), the baseline is created with `efficientnet_b0(weights=EfficientNet_B0_Weights.DEFAULT)`. The feature extractor parameters are frozen, and the classifier is replaced with `Dropout(p=0.30)` followed by `Linear(1280, 1)`. The optimizer is AdamW, and the loss is `BCEWithLogitsLoss` with a positive-class weight derived from training labels.

The training notebook saves a dictionary containing at least the model state, epoch, and validation metrics. The inspected checkpoint is epoch 12 and has the expected `classifier.1` one-logit weights.

The inference constructor uses `efficientnet_b0(weights=None)` and strictly loads the complete saved state dictionary. This is expected: loading the checkpoint restores the trained parameters, so the constructor does not need to download ImageNet weights at inference time.

The training notebook sets dropout probability to 0.30, while the inference constructor retains EfficientNetB0's default classifier dropout probability (0.20) and replaces only the linear layer. Both models are put into evaluation mode before prediction, where dropout is disabled. The checkpoint has no dropout parameters, and strict loading succeeded. The difference in configured dropout probability therefore does not change this evaluation-mode inference computation.

### Class mapping, probability, and threshold

The mapping is consistent across the inspected code:

1. The manifest-generation code in [notebooks/02_data_cleaning_and_manifest.ipynb](notebooks/02_data_cleaning_and_manifest.ipynb) defines `target_amd = 1` for AMD and `0` otherwise.
2. The training/evaluation notebooks treat the single output as a logit and apply sigmoid to obtain the AMD probability.
3. The evaluation code in [notebooks/08_model_evaluation.ipynb](notebooks/08_model_evaluation.ipynb) maps probability `>= 0.5` to class `1`, and calls `classification_report()` with `class_names = ["Non-AMD", "AMD"]`.
4. `ModelService.predict_pil_image()` applies sigmoid, maps `>= 0.5` to `CLASS_NAMES[1]` (`AMD`), and returns the complementary `1 - p` as Non-AMD probability.

For the smoke-test logit, sigmoid gives approximately `0.7158593`, which is above 0.5, so the returned AMD prediction is consistent with the evaluation convention. The returned value is a binary model probability, not a clinically validated risk score.

## Evaluation source and saved metric consistency

The evaluation notebook reconstructs EfficientNetB0 with a one-logit head, loads `checkpoint["model_state_dict"]`, evaluates the test split in `eval()` mode without gradients, applies sigmoid to logits, and uses a 0.5 threshold for discrete metrics. ROC-AUC is calculated from continuous probabilities. The notebook writes the confusion matrix with labels `[0, 1]` and class names `["Non-AMD", "AMD"]`.

The saved artifacts inspected were:

- [results/evaluation/test_metrics.csv](results/evaluation/test_metrics.csv)
- [results/evaluation/classification_report.csv](results/evaluation/classification_report.csv)
- [results/evaluation/confusion_matrix.csv](results/evaluation/confusion_matrix.csv)

The saved confusion matrix, with rows as actual class and columns as predicted class, is:

| Actual \\ Predicted | Non-AMD | AMD |
| --- | ---: | ---: |
| Non-AMD | 107 | 26 |
| AMD | 21 | 153 |

The matrix supports the saved thresholded metrics:

- Accuracy: `(107 + 153) / 307 = 0.8469055` (84.69%)
- AMD precision: `153 / (153 + 26) = 0.8547486` (85.47%)
- AMD recall: `153 / (153 + 21) = 0.8793103` (87.93%)
- AMD F1: `0.8668555` (86.69%)
- Test support: 133 Non-AMD and 174 AMD images; 307 images total
- The metrics file records 123 unique test patients.

These values agree with `test_metrics.csv` and the class-level values in `classification_report.csv`. The saved ROC-AUC is `0.9220033`; the evaluation source computes ROC-AUC from continuous probabilities, which is the appropriate calculation. This smoke test did not rerun the held-out evaluation or independently recompute ROC-AUC from test images.

No inconsistency was established between the inspected evaluation code and the saved test metrics. The code and saved results are consistent on the recorded split counts, class ordering, 0.5 threshold, confusion matrix, and threshold-dependent metrics.

## Limitations and qualifications

- Only one training-split image was used for inference; this is a smoke test, not a statistical assessment.
- The test set was not used for this inference test and was not used to tune or alter the model.
- Preprocessing equivalence was measured for the selected monochrome image only. The inference service's RGB conversion could diverge from the grayscale training path for a genuinely color OCT image.
- Saved test metrics were checked against the evaluation code and stored confusion matrix, but the evaluation notebook was not re-executed.
- No notebook was run, no training was performed, and no output or model artifact was regenerated.
- Results are internal dataset performance and do not constitute clinical validation.

## Exact lightweight smoke-test command

From the project root in PowerShell, the following command loads the actual inference service and predicts on the same training-split image used above. It does not modify the project:

```powershell
@'
from pathlib import Path
from PIL import Image
from backend.model_service import ModelService

service = ModelService()
image_path = Path("data/Processed/train.csv")
import csv
with image_path.open(newline="", encoding="utf-8-sig") as handle:
    row = next(row for row in csv.DictReader(handle) if row["usable"].lower() == "true")
with Image.open(Path(row["image_path"])) as image:
    print(service.predict_pil_image(image))
'@ | .\.venv\Scripts\python.exe -
```

## Final conclusion

The saved EfficientNetB0 checkpoint loaded successfully through the project's inference service and completed a real prediction on a non-test OCT image. The output shape, sigmoid probability, class mapping, and 0.5 decision threshold are consistent with the inspected evaluation pipeline. The tested image's service preprocessing exactly matched the training preprocessing. The project has a verified inference smoke test, but this is not clinical validation or evidence of model performance beyond the separately saved held-out evaluation.
