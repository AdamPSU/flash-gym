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


if __name__ == "__main__":
    unittest.main()
