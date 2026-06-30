import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "src" / "backend"
sys.path.insert(0, str(BACKEND_SRC))

from flash_gym.hazard_edit_contract import (  # noqa: E402
    HazardEditRequest,
    build_hazard_edit_manifest,
    build_hazard_edit_paths,
    select_approved_frames,
)


class HazardEditContractTests(unittest.TestCase):
    def test_build_hazard_edit_paths_uses_expected_volume_layout(self):
        paths = build_hazard_edit_paths("demo-job")

        self.assertEqual(
            paths.keyframe_manifest_path,
            "/runpod-volume/jobs/demo-job/keyframes_manifest.json",
        )
        self.assertEqual(paths.edited_dir, "/runpod-volume/jobs/demo-job/edited")
        self.assertEqual(
            paths.manifest_path,
            "/runpod-volume/jobs/demo-job/edit_manifest.json",
        )
        self.assertEqual(
            paths.progress_path,
            "/runpod-volume/jobs/demo-job/edit_progress.json",
        )
        self.assertEqual(
            paths.model_cache_dir,
            "/runpod-volume/models/flux2-klein-4b",
        )

    def test_request_validates_paths_and_edit_controls(self):
        request = HazardEditRequest(
            job_id="demo-job",
            keyframe_manifest_path="/runpod-volume/jobs/demo-job/keyframes_manifest.json",
            approved_frame_ids=("kf_0001", "kf_0003"),
            prompt="Add a realistic wet floor hazard near the walkway.",
        )

        self.assertEqual(request.max_images, 30)
        self.assertEqual(request.model_id, "black-forest-labs/FLUX.2-klein-4B")
        self.assertEqual(request.num_inference_steps, 4)
        self.assertEqual(request.true_cfg_scale, 4.0)
        self.assertEqual(request.guidance_scale, 1.0)
        self.assertEqual(request.negative_prompt, " ")
        self.assertEqual(request.max_dimension, 768)

    def test_request_rejects_unsafe_inputs(self):
        with self.assertRaises(ValueError):
            HazardEditRequest(
                job_id="../bad",
                keyframe_manifest_path="/runpod-volume/jobs/bad/keyframes_manifest.json",
                approved_frame_ids=("kf_0001",),
                prompt="Add a realistic hazard.",
            )

        with self.assertRaises(ValueError):
            HazardEditRequest(
                job_id="demo-job",
                keyframe_manifest_path="/tmp/keyframes_manifest.json",
                approved_frame_ids=("kf_0001",),
                prompt="Add a realistic hazard.",
            )

        with self.assertRaises(ValueError):
            HazardEditRequest(
                job_id="demo-job",
                keyframe_manifest_path="/runpod-volume/jobs/demo-job/keyframes_manifest.json",
                approved_frame_ids=("../bad",),
                prompt="Add a realistic hazard.",
            )

        with self.assertRaises(ValueError):
            HazardEditRequest(
                job_id="demo-job",
                keyframe_manifest_path="/runpod-volume/jobs/demo-job/keyframes_manifest.json",
                approved_frame_ids=("kf_0001",),
                prompt="   ",
            )

        with self.assertRaises(ValueError):
            HazardEditRequest(
                job_id="demo-job",
                keyframe_manifest_path="/runpod-volume/jobs/demo-job/keyframes_manifest.json",
                approved_frame_ids=("kf_0001",),
                prompt="Add a realistic hazard.",
                max_dimension=0,
            )

    def test_select_approved_frames_filters_manifest_order_and_caps_count(self):
        keyframe_manifest = {
            "frames": [
                {
                    "frame_id": "kf_0001",
                    "path": "/runpod-volume/jobs/demo-job/keyframes/kf_0001.jpg",
                    "timestamp_ms": 1000,
                },
                {
                    "frame_id": "kf_0002",
                    "path": "/runpod-volume/jobs/demo-job/keyframes/kf_0002.jpg",
                    "timestamp_ms": 2000,
                },
                {
                    "frame_id": "kf_0003",
                    "path": "/runpod-volume/jobs/demo-job/keyframes/kf_0003.jpg",
                    "timestamp_ms": 3000,
                },
            ]
        }

        selected = select_approved_frames(
            keyframe_manifest,
            approved_frame_ids=("kf_0003", "kf_0001"),
            max_images=1,
        )

        self.assertEqual([frame["frame_id"] for frame in selected], ["kf_0001"])

    def test_select_approved_frames_rejects_missing_or_unsafe_manifest_frames(self):
        with self.assertRaises(ValueError):
            select_approved_frames(
                {"frames": [{"frame_id": "kf_0001", "path": "/tmp/kf_0001.jpg"}]},
                approved_frame_ids=("kf_0001",),
                max_images=30,
            )

        with self.assertRaises(ValueError):
            select_approved_frames(
                {"frames": [{"frame_id": "kf_0001", "path": "/runpod-volume/jobs/demo-job/keyframes/kf_0001.jpg"}]},
                approved_frame_ids=("kf_9999",),
                max_images=30,
            )

    def test_build_hazard_edit_manifest_is_review_ready(self):
        manifest = build_hazard_edit_manifest(
            job_id="demo-job",
            model_id="black-forest-labs/FLUX.2-klein-4B",
            prompt="Add a realistic cable trip hazard.",
            source_manifest_path="/runpod-volume/jobs/demo-job/keyframes_manifest.json",
            images=[
                {
                    "frame_id": "kf_0001",
                    "source_path": "/runpod-volume/jobs/demo-job/keyframes/kf_0001.jpg",
                    "edited_path": "/runpod-volume/jobs/demo-job/edited/kf_0001_hazard.jpg",
                    "seed": 7,
                }
            ],
        )

        self.assertEqual(manifest["schema_version"], 1)
        self.assertEqual(manifest["stage"], "hazard-edit")
        self.assertEqual(manifest["job_id"], "demo-job")
        self.assertEqual(manifest["model_id"], "black-forest-labs/FLUX.2-klein-4B")
        self.assertEqual(manifest["edited_count"], 1)
        self.assertEqual(manifest["images"][0]["frame_id"], "kf_0001")


if __name__ == "__main__":
    unittest.main()
