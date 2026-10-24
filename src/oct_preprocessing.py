"""Reusable preprocessing utilities for OCT retinal images.

The module is intentionally independent of a deep-learning framework. It returns
CHW NumPy arrays that can later be wrapped by a PyTorch, TensorFlow, or other
model-specific dataset adapter.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

import numpy as np
from PIL import Image, ImageEnhance, UnidentifiedImageError

IMAGE_SIZE: Tuple[int, int] = (224, 224)
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def _conservative_augmentation(
    image: Image.Image,
    rng: np.random.Generator,
) -> Image.Image:
    """Apply anatomy-preserving training augmentation to a grayscale image."""
    angle = float(rng.uniform(-5.0, 5.0))
    image = image.rotate(angle, resample=Image.Resampling.BILINEAR, fillcolor=0)

    brightness_factor = float(rng.uniform(0.90, 1.10))
    contrast_factor = float(rng.uniform(0.90, 1.10))
    image = ImageEnhance.Brightness(image).enhance(brightness_factor)
    image = ImageEnhance.Contrast(image).enhance(contrast_factor)

    width, height = image.size
    max_x_shift = max(1, int(round(width * 0.03)))
    max_y_shift = max(1, int(round(height * 0.03)))
    x_shift = int(rng.integers(-max_x_shift, max_x_shift + 1))
    y_shift = int(rng.integers(-max_y_shift, max_y_shift + 1))
    image = image.transform(
        image.size,
        Image.Transform.AFFINE,
        (1.0, 0.0, -x_shift, 0.0, 1.0, -y_shift),
        resample=Image.Resampling.BILINEAR,
        fillcolor=0,
    )
    return image


def preprocess_image(
    image_path: str | Path,
    *,
    image_size: Tuple[int, int] = IMAGE_SIZE,
    augment: bool = False,
    rng: Optional[np.random.Generator] = None,
) -> np.ndarray:
    """Load and preprocess one OCT image into a normalized CHW float32 array.

    Images are read as grayscale because OCT intensity is the signal of
    interest, then converted to three identical channels for pretrained CNNs.
    ImageNet mean/std normalization matches the planned EfficientNet baseline.
    Augmentation is disabled by default and should only be enabled for training.
    """
    path = Path(image_path)
    try:
        with Image.open(path) as source:
            image = source.copy()
    except (OSError, UnidentifiedImageError) as error:
        raise ValueError(f"Could not read OCT image: {path}") from error

    if augment:
        if rng is None:
            rng = np.random.default_rng()
        image = _conservative_augmentation(image.convert("L"), rng)

    return preprocess_pil_image(image, image_size=image_size)


def preprocess_pil_image(
    image: Image.Image,
    *,
    image_size: Tuple[int, int] = IMAGE_SIZE,
) -> np.ndarray:
    """Preprocess a PIL image using the same deterministic path as training."""
    grayscale_image = image.convert("L")
    resized_image = grayscale_image.resize(image_size, resample=Image.Resampling.LANCZOS)
    rgb_image = resized_image.convert("RGB")
    array = np.asarray(rgb_image, dtype=np.float32) / 255.0
    array = (array - IMAGENET_MEAN) / IMAGENET_STD
    array = np.transpose(array, (2, 0, 1)).astype(np.float32, copy=False)

    expected_shape = (3, image_size[1], image_size[0])
    if array.shape != expected_shape:
        raise ValueError(f"Unexpected preprocessed shape {array.shape}")
    if not np.isfinite(array).all():
        raise ValueError("Non-finite pixel values produced during preprocessing")
    return array


def denormalize_image(array: np.ndarray) -> np.ndarray:
    """Convert a normalized CHW array into an HWC float image for plotting."""
    if array.ndim != 3 or array.shape[0] != 3:
        raise ValueError(f"Expected a normalized CHW array with 3 channels, got {array.shape}")
    image = np.transpose(array, (1, 2, 0))
    image = image * IMAGENET_STD + IMAGENET_MEAN
    return np.clip(image, 0.0, 1.0)


def validate_preprocessed_array(array: np.ndarray, image_size: Tuple[int, int] = IMAGE_SIZE) -> bool:
    """Return whether an array has the expected model-ready shape and values."""
    expected_shape = (3, image_size[1], image_size[0])
    return bool(array.shape == expected_shape and np.isfinite(array).all())
