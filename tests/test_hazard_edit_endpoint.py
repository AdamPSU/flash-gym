import sys
import unittest
import inspect
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "src" / "backend"
sys.path.insert(0, str(BACKEND_SRC))

from flash_gym.endpoints.edit_hazards import edit_hazards  # noqa: E402


class HazardEditEndpointTests(unittest.TestCase):
    def test_endpoint_is_importable_for_flash(self):
        self.assertTrue(callable(edit_hazards))

    def test_endpoint_body_does_not_import_local_project_modules(self):
        source = inspect.getsource(edit_hazards)

        self.assertNotIn("from flash_gym.", source)

    def test_flux2_runtime_dependencies_are_declared(self):
        dependencies = edit_hazards.__remote_config__["dependencies"]

        self.assertIn("git+https://github.com/huggingface/diffusers.git", dependencies)
        self.assertIn("transformers", dependencies)

    def test_endpoint_body_uses_flux2_klein_pipeline(self):
        source = inspect.getsource(edit_hazards)

        self.assertIn("from diffusers.pipelines.flux2.pipeline_flux2_klein import Flux2KleinPipeline", source)
        self.assertIn("Flux2KleinPipeline", source)
        self.assertIn("black-forest-labs/FLUX.2-klein-4B", source)
        self.assertNotIn("Step1XEditPipelineV1P2", source)


if __name__ == "__main__":
    unittest.main()
