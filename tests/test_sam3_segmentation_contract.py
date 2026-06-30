import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "src" / "backend"
sys.path.insert(0, str(BACKEND_SRC))

from flash_gym.sam3_segmentation_contract import (  # noqa: E402
    Sam3SegmentationRequest,
    build_sam3_endpoint_env,
    build_sam3_smoke_edit_manifest,
    build_sam3_segmentation_manifest,
    build_sam3_segmentation_paths,
    select_approved_edited_images,
    validate_smoke_image_urls,
)


class Sam3SegmentationContractTests(unittest.TestCase):
    def test_build_endpoint_env_forwards_hf_token_only_when_present(self):
        self.assertNotIn("HF_TOKEN", build_sam3_endpoint_env(hf_token=""))

        env = build_sam3_endpoint_env(hf_token="fake-token-for-test")

        self.assertEqual(env["HF_TOKEN"], "fake-token-for-test")
        self.assertEqual(env["HF_HOME"], "/runpod-volume/.cache/huggingface")

    def test_validate_smoke_image_urls_allows_only_small_http_batches(self):
        urls = validate_smoke_image_urls(
            [
                "https://images.cocodataset.org/val2017/000000039769.jpg",
                "http://images.cocodataset.org/val2017/000000077595.jpg",
            ]
        )

        self.assertEqual(len(urls), 2)

        with self.assertRaises(ValueError):
            validate_smoke_image_urls(["file:///tmp/image.jpg"])

        with self.assertRaises(ValueError):
            validate_smoke_image_urls([])

        with self.assertRaises(ValueError):
            validate_smoke_image_urls(["https://example.com/image.jpg"] * 9)

    def test_build_smoke_edit_manifest_matches_phase_2_shape(self):
        manifest = build_sam3_smoke_edit_manifest(
            job_id="demo-job",
            image_paths=[
                "/runpod-volume/jobs/demo-job/edited/kf_0001_hazard.jpg",
                "/runpod-volume/jobs/demo-job/edited/kf_0002_hazard.jpg",
            ],
        )

        self.assertEqual(manifest["schema_version"], 1)
        self.assertEqual(manifest["stage"], "hazard-edit")
        self.assertEqual(manifest["status"], "smoke-test-fixture")
        self.assertEqual(manifest["edited_count"], 2)
        self.assertEqual(manifest["images"][0]["frame_id"], "kf_0001")
        self.assertEqual(
            manifest["images"][0]["edited_path"],
            "/runpod-volume/jobs/demo-job/edited/kf_0001_hazard.jpg",
        )

    def test_build_paths_uses_expected_volume_layout(self):
        paths = build_sam3_segmentation_paths("demo-job")

        self.assertEqual(
            paths.edit_manifest_path,
            "/runpod-volume/jobs/demo-job/edit_manifest.json",
        )
        self.assertEqual(paths.masks_dir, "/runpod-volume/jobs/demo-job/masks")
        self.assertEqual(
            paths.manifest_path,
            "/runpod-volume/jobs/demo-job/segmentation_manifest.json",
        )
        self.assertEqual(
            paths.progress_path,
            "/runpod-volume/jobs/demo-job/segmentation_progress.json",
        )
        self.assertEqual(paths.model_cache_dir, "/runpod-volume/models/sam3")

    def test_request_validates_paths_prompt_thresholds_and_batch_size(self):
        request = Sam3SegmentationRequest(
            job_id="demo-job",
            edit_manifest_path="/runpod-volume/jobs/demo-job/edit_manifest.json",
            approved_frame_ids=("kf_0001", "kf_0002"),
            concept_prompt="wet floor hazard",
        )

        self.assertEqual(request.max_images, 30)
        self.assertEqual(request.batch_size, 4)
        self.assertEqual(request.score_threshold, 0.5)
        self.assertEqual(request.mask_threshold, 0.5)
        self.assertEqual(request.model_id, "facebook/sam3")

    def test_request_rejects_unsafe_or_empty_inputs(self):
        with self.assertRaises(ValueError):
            Sam3SegmentationRequest(
                job_id="../bad",
                edit_manifest_path="/runpod-volume/jobs/bad/edit_manifest.json",
                approved_frame_ids=("kf_0001",),
                concept_prompt="hazard",
            )

        with self.assertRaises(ValueError):
            Sam3SegmentationRequest(
                job_id="demo-job",
                edit_manifest_path="/tmp/edit_manifest.json",
                approved_frame_ids=("kf_0001",),
                concept_prompt="hazard",
            )

        with self.assertRaises(ValueError):
            Sam3SegmentationRequest(
                job_id="demo-job",
                edit_manifest_path="/runpod-volume/jobs/demo-job/edit_manifest.json",
                approved_frame_ids=("../bad",),
                concept_prompt="hazard",
            )

        with self.assertRaises(ValueError):
            Sam3SegmentationRequest(
                job_id="demo-job",
                edit_manifest_path="/runpod-volume/jobs/demo-job/edit_manifest.json",
                approved_frame_ids=("kf_0001",),
                concept_prompt="   ",
            )

        with self.assertRaises(ValueError):
            Sam3SegmentationRequest(
                job_id="demo-job",
                edit_manifest_path="/runpod-volume/jobs/demo-job/edit_manifest.json",
                approved_frame_ids=("kf_0001",),
                concept_prompt="hazard",
                score_threshold=1.1,
            )

    def test_select_approved_edited_images_filters_manifest_order_and_caps_count(self):
        edit_manifest = {
            "images": [
                {
                    "frame_id": "kf_0001",
                    "source_path": "/runpod-volume/jobs/demo-job/keyframes/kf_0001.jpg",
                    "edited_path": "/runpod-volume/jobs/demo-job/edited/kf_0001_hazard.png",
                    "seed": 1,
                },
                {
                    "frame_id": "kf_0002",
                    "source_path": "/runpod-volume/jobs/demo-job/keyframes/kf_0002.jpg",
                    "edited_path": "/runpod-volume/jobs/demo-job/edited/kf_0002_hazard.png",
                    "seed": 2,
                },
                {
                    "frame_id": "kf_0003",
                    "source_path": "/runpod-volume/jobs/demo-job/keyframes/kf_0003.jpg",
                    "edited_path": "/runpod-volume/jobs/demo-job/edited/kf_0003_hazard.png",
                    "seed": 3,
                },
            ]
        }

        selected = select_approved_edited_images(
            edit_manifest,
            approved_frame_ids=("kf_0003", "kf_0001"),
            max_images=1,
        )

        self.assertEqual([image["frame_id"] for image in selected], ["kf_0001"])

    def test_select_approved_edited_images_rejects_missing_or_unsafe_images(self):
        with self.assertRaises(ValueError):
            select_approved_edited_images(
                {"images": [{"frame_id": "kf_0001", "edited_path": "/tmp/kf_0001.png"}]},
                approved_frame_ids=("kf_0001",),
                max_images=30,
            )

        with self.assertRaises(ValueError):
            select_approved_edited_images(
                {
                    "images": [
                        {
                            "frame_id": "kf_0001",
                            "edited_path": "/runpod-volume/jobs/demo-job/edited/kf_0001_hazard.png",
                        }
                    ]
                },
                approved_frame_ids=("kf_9999",),
                max_images=30,
            )

    def test_build_segmentation_manifest_is_dataset_export_ready(self):
        manifest = build_sam3_segmentation_manifest(
            job_id="demo-job",
            model_id="facebook/sam3",
            concept_prompt="wet floor hazard",
            source_manifest_path="/runpod-volume/jobs/demo-job/edit_manifest.json",
            images=[
                {
                    "frame_id": "kf_0001",
                    "edited_path": "/runpod-volume/jobs/demo-job/edited/kf_0001_hazard.png",
                    "width": 1280,
                    "height": 720,
                    "instances": [
                        {
                            "instance_id": "kf_0001_mask_01",
                            "mask_path": "/runpod-volume/jobs/demo-job/masks/kf_0001_mask_01.png",
                            "bbox_xyxy": [10.0, 20.0, 100.0, 200.0],
                            "score": 0.91,
                            "area_pixels": 1200,
                        }
                    ],
                }
            ],
        )

        self.assertEqual(manifest["schema_version"], 1)
        self.assertEqual(manifest["stage"], "hazard-segmentation")
        self.assertEqual(manifest["job_id"], "demo-job")
        self.assertEqual(manifest["model_id"], "facebook/sam3")
        self.assertEqual(manifest["segmented_count"], 1)
        self.assertEqual(manifest["instance_count"], 1)
        self.assertEqual(manifest["images"][0]["instances"][0]["instance_id"], "kf_0001_mask_01")


if __name__ == "__main__":
    unittest.main()
