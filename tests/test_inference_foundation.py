from __future__ import annotations

import base64
import io
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import torch
from fastapi import HTTPException
from fastapi.datastructures import UploadFile
from PIL import Image
from starlette.datastructures import Headers

from backend import app as backend_app
from backend.model_service import MODEL_PATH, CLASS_NAMES, ModelService
from src.oct_preprocessing import IMAGE_SIZE, preprocess_image, preprocess_pil_image


def _png_bytes() -> bytes:
    image = Image.new("RGB", (37, 19))
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            pixels[x, y] = (x * 6 % 256, y * 13 % 256, (x + y) * 9 % 256)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _upload(
    content: bytes,
    *,
    filename: str = "oct.png",
    content_type: str = "image/png",
) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(content),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


class _FixedLogitModel(torch.nn.Module):
    def __init__(self, logit: float) -> None:
        super().__init__()
        self.logit = logit

    def forward(self, tensor: torch.Tensor) -> torch.Tensor:
        return torch.full((tensor.shape[0], 1), self.logit, device=tensor.device)


class InferenceModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not MODEL_PATH.is_file():
            raise unittest.SkipTest(f"Saved checkpoint is unavailable: {MODEL_PATH}")
        cls.service = ModelService()

    def test_checkpoint_loads_strictly_and_model_is_in_eval_mode(self) -> None:
        self.assertTrue(self.service.model_ready)
        self.assertIsNotNone(self.service.model)
        self.assertFalse(self.service.model.training)
        self.assertEqual(self.service.model.classifier[1].out_features, 1)

    def test_missing_checkpoint_keeps_service_available_but_not_ready(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            missing_checkpoint = Path(directory) / "missing.pth"
            with self.assertLogs("backend.model_service", level="ERROR"):
                service = ModelService(missing_checkpoint)

        self.assertFalse(service.model_ready)
        self.assertIsNone(service.model)
        self.assertIn("Unable to load", service.load_error)

    def test_valid_oct_preprocessing_has_expected_tensor_shape(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "oct.png"
            path.write_bytes(_png_bytes())
            array = preprocess_image(path, augment=False)

        self.assertEqual(array.shape, (3, IMAGE_SIZE[1], IMAGE_SIZE[0]))
        self.assertEqual(array.dtype, np.float32)
        self.assertTrue(np.isfinite(array).all())

    def test_service_preprocessing_matches_training_preprocessing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "oct.png"
            path.write_bytes(_png_bytes())
            expected = preprocess_image(path, augment=False)

            with Image.open(path) as image:
                actual = preprocess_pil_image(image)
                service_tensor = self.service.preprocess_pil_image(image)

        self.assertTrue(np.array_equal(actual, expected))
        self.assertEqual(tuple(service_tensor.shape), (1, 3, IMAGE_SIZE[1], IMAGE_SIZE[0]))
        self.assertTrue(np.array_equal(service_tensor.cpu().numpy()[0], expected))

    def test_prediction_probability_shape_and_class_mapping(self) -> None:
        image = Image.open(io.BytesIO(_png_bytes()))
        original_model = self.service.model
        try:
            for logit, expected_label in ((0.4, "AMD"), (-0.4, "Non-AMD")):
                self.service.model = _FixedLogitModel(logit).to(self.service.device).eval()
                tensor = self.service.preprocess_pil_image(image)
                with torch.no_grad():
                    logits = self.service.model(tensor)
                result = self.service.predict_pil_image(image)

                self.assertEqual(tuple(logits.shape), (1, 1))
                self.assertEqual(result["prediction"], expected_label)
                self.assertAlmostEqual(result["probability"], 1.0 / (1.0 + math.exp(-logit)))
                self.assertGreaterEqual(result["probability"], 0.0)
                self.assertLessEqual(result["probability"], 1.0)
                self.assertEqual(CLASS_NAMES, ["Non-AMD", "AMD"])
                self.assertAlmostEqual(
                    result["class_probabilities"]["Non-AMD"]
                    + result["class_probabilities"]["AMD"],
                    1.0,
                    places=5,
                )
        finally:
            self.service.model = original_model

    def test_gradcam_returns_decodable_png(self) -> None:
        image = Image.open(io.BytesIO(_png_bytes()))
        encoded = self.service.generate_gradcam(image)
        decoded = base64.b64decode(encoded, validate=True)
        with Image.open(io.BytesIO(decoded)) as overlay:
            self.assertEqual(overlay.format, "PNG")
            self.assertEqual(overlay.size, image.size)


class UploadValidationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.image = _png_bytes()
        self.temp_directory = tempfile.TemporaryDirectory()
        self.history_path = Path(self.temp_directory.name) / "patient_history.json"
        self.fake_service = unittest.mock.Mock()
        self.fake_service.model_ready = True
        self.fake_service.load_error = None
        self.fake_service.predict_pil_image.return_value = {
            "prediction": "AMD",
            "probability": 0.7,
            "confidence": 70.0,
            "class_probabilities": {"Non-AMD": 0.3, "AMD": 0.7},
        }
        self.fake_service.generate_gradcam.return_value = base64.b64encode(b"overlay").decode("ascii")
        self.service_patch = patch("backend.app.model_service", self.fake_service)
        self.history_patch = patch.object(backend_app, "PATIENT_HISTORY_PATH", self.history_path)
        self.service_patch.start()
        self.history_patch.start()
        self.addCleanup(self.service_patch.stop)
        self.addCleanup(self.history_patch.stop)
        self.addCleanup(self.temp_directory.cleanup)

    async def _call_endpoint(self, endpoint_name: str, upload: UploadFile):
        if endpoint_name == "predict":
            return await backend_app.predict_image(file=upload, patient_code="")
        return await backend_app.gradcam(file=upload)

    async def test_valid_png_is_accepted_by_predict_and_gradcam(self) -> None:
        prediction = await self._call_endpoint("predict", _upload(self.image))
        gradcam = await self._call_endpoint("gradcam", _upload(self.image))
        self.assertEqual(prediction["result"]["prediction"], "AMD")
        self.assertEqual(gradcam["status"], "ok")

    async def test_invalid_image_bytes_return_clear_400(self) -> None:
        for endpoint in ("predict", "gradcam"):
            with self.subTest(endpoint=endpoint):
                with self.assertRaises(HTTPException) as caught:
                    await self._call_endpoint(endpoint, _upload(b"not an image"))
                self.assertEqual(caught.exception.status_code, 400)
                self.assertIn("valid JPEG or PNG", caught.exception.detail)

    async def test_empty_upload_returns_clear_400(self) -> None:
        with self.assertRaises(HTTPException) as caught:
            await self._call_endpoint("predict", _upload(b""))
        self.assertEqual(caught.exception.status_code, 400)
        self.assertIn("empty", caught.exception.detail)

    async def test_unsupported_image_types_return_415(self) -> None:
        gif_buffer = io.BytesIO()
        Image.new("RGB", (2, 2)).save(gif_buffer, format="GIF")
        for endpoint in ("predict", "gradcam"):
            with self.subTest(endpoint=endpoint):
                with self.assertRaises(HTTPException) as caught:
                    await self._call_endpoint(
                        endpoint,
                        _upload(gif_buffer.getvalue(), filename="oct.gif", content_type="image/gif"),
                    )
                self.assertEqual(caught.exception.status_code, 415)
                self.assertIn("JPEG or PNG", caught.exception.detail)

    async def test_unsupported_image_content_is_rejected_even_with_allowed_mime_type(self) -> None:
        gif_buffer = io.BytesIO()
        Image.new("RGB", (2, 2)).save(gif_buffer, format="GIF")
        with self.assertRaises(HTTPException) as caught:
            await self._call_endpoint(
                "predict",
                _upload(gif_buffer.getvalue(), filename="oct.png", content_type="image/png"),
            )
        self.assertEqual(caught.exception.status_code, 415)
        self.assertIn("JPEG or PNG", caught.exception.detail)

    async def test_oversized_uploads_return_413_for_both_endpoints(self) -> None:
        oversized = b"x" * (backend_app.MAX_IMAGE_BYTES + 1)
        for endpoint in ("predict", "gradcam"):
            with self.subTest(endpoint=endpoint):
                with self.assertRaises(HTTPException) as caught:
                    await self._call_endpoint(endpoint, _upload(oversized))
                self.assertEqual(caught.exception.status_code, 413)
                self.assertIn("20 MB", caught.exception.detail)

    async def test_inference_errors_do_not_expose_internal_error_details(self) -> None:
        self.fake_service.predict_pil_image.side_effect = RuntimeError("internal checkpoint detail")
        with self.assertLogs("backend.app", level="ERROR"):
            with self.assertRaises(HTTPException) as caught:
                await self._call_endpoint("predict", _upload(self.image))
        self.assertEqual(caught.exception.status_code, 500)
        self.assertNotIn("internal checkpoint detail", caught.exception.detail)

    async def test_unavailable_model_returns_service_unavailable(self) -> None:
        self.fake_service.model_ready = False
        self.fake_service.load_error = "Model checkpoint is unavailable."
        with self.assertRaises(HTTPException) as caught:
            await self._call_endpoint("predict", _upload(self.image))

        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(caught.exception.detail, "Model checkpoint is unavailable.")
        self.fake_service.predict_pil_image.assert_not_called()

    async def test_model_info_does_not_expose_checkpoint_filesystem_path(self) -> None:
        response = backend_app.model_info()
        checkpoint = response["model"]["checkpoint"]

        self.assertEqual(checkpoint, Path(backend_app.MODEL_METADATA["checkpoint"]).name)
        self.assertNotIn(str(backend_app.PROJECT_ROOT), checkpoint)


if __name__ == "__main__":
    unittest.main()
