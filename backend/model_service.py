from __future__ import annotations

import base64
import io
import logging
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps
from torchvision.models import efficientnet_b0

from src.oct_preprocessing import IMAGE_SIZE, preprocess_pil_image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = PROJECT_ROOT / "models" / "baseline_efficientnetb0_best.pth"
CLASS_NAMES = ["Non-AMD", "AMD"]
logger = logging.getLogger(__name__)
MODEL_METADATA = {
    "checkpoint": str(MODEL_PATH),
    "architecture": "EfficientNetB0",
    "task": "Binary AMD vs Non-AMD classification",
    "input_image_size": list(IMAGE_SIZE),
    "classes": CLASS_NAMES,
    "notes": "The model is a frozen ImageNet-pretrained EfficientNetB0 with a binary output head. This is a research prototype and not a clinical diagnostic tool.",
}


def build_binary_efficientnet() -> torch.nn.Module:
    """Instantiate the same binary EfficientNetB0 architecture used for the saved checkpoint."""
    model = efficientnet_b0(weights=None)
    if isinstance(model.classifier, torch.nn.Sequential):
        in_features = model.classifier[1].in_features
        model.classifier[1] = torch.nn.Linear(in_features, 1)
    else:
        model.classifier = torch.nn.Linear(model.classifier.in_features, 1)
    return model


class ModelService:
    def __init__(self, model_path: str | Path = MODEL_PATH) -> None:
        self.model_path = Path(model_path)
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model: torch.nn.Module | None = None
        self.model_ready = False
        self.load_error: str | None = None
        self.model_version = self.model_path.stem
        try:
            self.load_model()
        except Exception:
            self.model = None
            self.model_ready = False
            self.load_error = (
                "Unable to load the configured model checkpoint. Check that it exists and is compatible; "
                "see backend logs for details."
            )
            logger.exception("Unable to load model checkpoint %s.", self.model_path)

    def load_model(self) -> None:
        if not self.model_path.exists():
            self.model_ready = False
            raise FileNotFoundError(f"Model checkpoint not found: {self.model_path}")

        model = build_binary_efficientnet()
        checkpoint = torch.load(self.model_path, map_location=self.device)
        state_dict = checkpoint.get("model_state_dict", checkpoint)
        state_dict = {k.replace("module.", ""): v for k, v in state_dict.items()}

        model.load_state_dict(state_dict, strict=True)
        model.to(self.device)
        model.eval()
        self.model = model
        self.model_ready = True
        epoch = checkpoint.get("epoch") if isinstance(checkpoint, dict) else None
        self.model_version = f"{self.model_path.stem}:epoch-{epoch}" if epoch is not None else self.model_path.stem

    def preprocess_pil_image(self, image: Image.Image) -> torch.Tensor:
        array = preprocess_pil_image(image, image_size=IMAGE_SIZE)
        tensor = torch.from_numpy(array).unsqueeze(0).to(self.device)
        return tensor

    def predict_pil_image(self, image: Image.Image) -> dict[str, Any]:
        if self.model is None or not self.model_ready:
            raise RuntimeError("Model is not loaded and ready for inference.")

        tensor = self.preprocess_pil_image(image)
        with torch.no_grad():
            logits = self.model(tensor)
            probability = torch.sigmoid(logits).squeeze(0)
            probability_value = float(probability.item())

        label = CLASS_NAMES[1] if probability_value >= 0.5 else CLASS_NAMES[0]
        probabilities = {
            CLASS_NAMES[0]: float(1.0 - probability_value),
            CLASS_NAMES[1]: float(probability_value),
        }
        confidence = max(probabilities[CLASS_NAMES[0]], probabilities[CLASS_NAMES[1]]) * 100.0
        return {
            "prediction": label,
            "probability": probability_value,
            "confidence": round(confidence, 2),
            "class_probabilities": {
                "Non-AMD": round(probabilities[CLASS_NAMES[0]], 6),
                "AMD": round(probabilities[CLASS_NAMES[1]], 6),
            },
            "logit": float(logits.squeeze(0).item()),
        }

    def generate_gradcam(self, image: Image.Image) -> str:
        if self.model is None or not self.model_ready:
            raise RuntimeError("Model is not loaded and ready for Grad-CAM generation.")

        image = image.convert("RGB")
        width, height = image.size
        tensor = self.preprocess_pil_image(image)
        tensor = tensor.clone().detach().requires_grad_(True)

        self.model.eval()
        self.model.zero_grad()

        feature_map = self.model.features(tensor)
        feature_map.retain_grad()
        pooled = self.model.avgpool(feature_map)
        flattened = torch.flatten(pooled, 1)
        logits = self.model.classifier(flattened)
        target_score = logits.sigmoid().sum()
        target_score.backward()

        gradients = feature_map.grad
        if gradients is None:
            raise RuntimeError("Grad-CAM gradients were not produced for the model output.")

        weights = gradients.mean(dim=(2, 3), keepdim=True)
        gradcam = (weights * feature_map).sum(dim=1, keepdim=True)
        gradcam = torch.relu(gradcam)
        gradcam = F.interpolate(gradcam, size=(height, width), mode="bilinear", align_corners=False)
        gradcam = gradcam.squeeze(0).squeeze(0).detach().cpu().numpy()
        gradcam_min, gradcam_max = gradcam.min(), gradcam.max()
        if gradcam_max > gradcam_min:
            gradcam = (gradcam - gradcam_min) / (gradcam_max - gradcam_min + 1e-8)
        else:
            gradcam = np.zeros_like(gradcam)

        heatmap = (gradcam * 255).astype(np.uint8)
        heatmap_image = Image.fromarray(heatmap, mode="L")
        heatmap_image = ImageOps.colorize(heatmap_image, black="black", white="red", mid="yellow")
        original_image = image.resize((width, height), resample=Image.Resampling.NEAREST)
        overlay = Image.blend(original_image.convert("RGBA"), heatmap_image.convert("RGBA"), alpha=0.45)

        buffer = io.BytesIO()
        overlay.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode("utf-8")
