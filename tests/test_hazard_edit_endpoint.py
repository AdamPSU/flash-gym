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

        self.assertIn(
            "diffusers @ git+https://github.com/huggingface/diffusers.git@6d71b76aceff935192e58fee38c5cc5d8d227cf0",
            dependencies,
        )
        self.assertIn("transformers", dependencies)

    def test_endpoint_body_uses_flux2_klein_pipeline(self):
        source = inspect.getsource(edit_hazards)

        self.assertIn("patch_diffusers_torch_utils_for_flux2", source)
        self.assertIn("maybe_adjust_dtype_for_device", source)
        self.assertIn("from diffusers.pipelines.flux2.pipeline_flux2_klein import Flux2KleinPipeline", source)
        self.assertIn("Flux2KleinPipeline", source)
        self.assertIn("pipeline_cpu_offload", source)
        self.assertIn("low_cpu_mem_usage=False", source)
        self.assertIn("pipeline.enable_model_cpu_offload()", source)
        self.assertNotIn("pipeline.to(\"cuda\")", source)
        self.assertIn("black-forest-labs/FLUX.2-klein-4B", source)
        self.assertNotIn("Step1XEditPipelineV1P2", source)

    def test_endpoint_patches_flux2_klein_guidance_none_bug(self):
        source = inspect.getsource(edit_hazards)

        self.assertIn("patch_flux2_klein_pipeline_guidance", source)
        self.assertIn("_flash_gym_guidance_scale", source)
        self.assertIn("kwargs[\"guidance\"]", source)
        self.assertIn("torch.full(", source)
        self.assertIn("float(self._flash_gym_guidance_scale)", source)


if __name__ == "__main__":
    unittest.main()
