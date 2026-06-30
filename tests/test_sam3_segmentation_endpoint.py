import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "src" / "backend"
sys.path.insert(0, str(BACKEND_SRC))

from flash_gym.endpoints.segment_hazards import segment_hazards  # noqa: E402


class Sam3SegmentationEndpointTests(unittest.TestCase):
    def test_endpoint_is_importable_for_flash(self):
        self.assertTrue(callable(segment_hazards))


if __name__ == "__main__":
    unittest.main()
