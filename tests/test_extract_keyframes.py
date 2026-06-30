import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "src" / "backend"
sys.path.insert(0, str(BACKEND_SRC))

from flash_gym.endpoints.extract_keyframes import (  # noqa: E402
    KeyframeExtractionRequest,
    build_job_paths,
    build_keyframe_manifest,
)


class KeyframeContractTests(unittest.TestCase):
    def test_request_requires_video_under_runpod_volume(self):
        with self.assertRaises(ValueError) as error:
            KeyframeExtractionRequest(
                job_id="demo-job",
                video_path="/tmp/video.mov",
                max_keyframes=5,
            )

        self.assertIn("/runpod-volume", str(error.exception))

    def test_request_only_tracks_ffmpeg_extraction_controls(self):
        fields = KeyframeExtractionRequest.__dataclass_fields__

        self.assertIn("max_keyframes", fields)
        self.assertIn("prefer_gpu_decode", fields)
        self.assertEqual(KeyframeExtractionRequest("demo-job", "/runpod-volume/jobs/demo-job/input/video.mov").max_keyframes, 5)
        self.assertNotIn("candidate_multiplier", fields)
        self.assertNotIn("min_spacing_seconds", fields)
        self.assertNotIn("max_dimension", fields)

    def test_build_job_paths_uses_expected_volume_layout(self):
        paths = build_job_paths("demo-job")

        self.assertEqual(
            paths.video_path,
            "/runpod-volume/jobs/demo-job/input/video.mov",
        )
        self.assertEqual(paths.keyframes_dir, "/runpod-volume/jobs/demo-job/keyframes")
        self.assertEqual(
            paths.manifest_path,
            "/runpod-volume/jobs/demo-job/keyframes_manifest.json",
        )
        self.assertFalse(hasattr(paths, "candidates_dir"))
        self.assertFalse(hasattr(paths, "thumbnails_dir"))

    def test_manifest_is_review_ready(self):
        manifest = build_keyframe_manifest(
            job_id="demo-job",
            decode_mode="cuda",
            frames=[
                {
                    "frame_id": "kf_0001",
                    "path": "/runpod-volume/jobs/demo-job/keyframes/kf_0001.jpg",
                    "timestamp_ms": 1000,
                }
            ],
        )

        self.assertEqual(manifest["schema_version"], 1)
        self.assertEqual(manifest["job_id"], "demo-job")
        self.assertEqual(manifest["decode_mode"], "cuda")
        self.assertEqual(manifest["extracted_count"], 1)
        self.assertNotIn("selected_count", manifest)
        self.assertEqual(manifest["frames"][0]["frame_id"], "kf_0001")


if __name__ == "__main__":
    unittest.main()
