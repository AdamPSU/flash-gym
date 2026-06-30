import sys
import unittest
import inspect
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "src" / "backend"
sys.path.insert(0, str(BACKEND_SRC))

from flash_gym.endpoints.segment_hazards import (  # noqa: E402
    segment_hazards,
    segment_hazards_smoke,
)


class Sam3SegmentationEndpointTests(unittest.TestCase):
    def test_endpoint_is_importable_for_flash(self):
        self.assertTrue(callable(segment_hazards))

    def test_smoke_endpoint_is_importable_for_flash(self):
        self.assertTrue(callable(segment_hazards_smoke))

    def test_smoke_endpoint_body_does_not_import_local_package(self):
        source = inspect.getsource(segment_hazards_smoke)

        self.assertNotIn("from flash_gym", source)

    def test_endpoint_returns_reviewable_segmentation_records(self):
        source = inspect.getsource(segment_hazards)

        self.assertIn("preview_url", source)
        self.assertIn("data:image/png;base64", source)
        self.assertIn('"images": segmentation_images', source)

    def test_smoke_endpoint_supports_inline_images_for_real_ui_pipeline(self):
        source = inspect.getsource(segment_hazards_smoke)

        self.assertIn('mode == "inline"', source)
        self.assertIn("image_data_urls", source)
        self.assertIn("frame_ids", source)
        self.assertIn("preview_url", source)


if __name__ == "__main__":
    unittest.main()
