import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "src" / "backend"
sys.path.insert(0, str(BACKEND_SRC))

from flash_gym.runpod_volume_upload import (  # noqa: E402
    RunpodVolumeConfig,
    build_s3_endpoint_url,
    build_video_mount_path,
    build_video_object_key,
    upload_video_to_volume,
)


class FakeS3Client:
    def __init__(self):
        self.calls = []

    def upload_file(self, file_path, bucket_name, object_key):
        self.calls.append((file_path, bucket_name, object_key))


class RunpodVolumeUploadTests(unittest.TestCase):
    def test_builds_runpod_s3_endpoint_url_from_datacenter(self):
        self.assertEqual(
            build_s3_endpoint_url("US-CA-2"),
            "https://s3api-us-ca-2.runpod.io/",
        )

    def test_builds_video_object_key_and_mount_path(self):
        self.assertEqual(
            build_video_object_key("demo-job"),
            "jobs/demo-job/input/video.mov",
        )
        self.assertEqual(
            build_video_mount_path("demo-job"),
            "/runpod-volume/jobs/demo-job/input/video.mov",
        )

    def test_rejects_unsafe_job_ids(self):
        with self.assertRaises(ValueError):
            build_video_object_key("../bad")

    def test_upload_uses_volume_id_as_bucket_and_returns_paths(self):
        fake_client = FakeS3Client()
        config = RunpodVolumeConfig(volume_id="37wxu5itek", datacenter_id="US-CA-2")

        with tempfile.NamedTemporaryFile(suffix=".mov") as video:
            result = upload_video_to_volume(
                local_video_path=video.name,
                job_id="demo-job",
                config=config,
                s3_client=fake_client,
            )

        self.assertEqual(
            fake_client.calls,
            [(video.name, "37wxu5itek", "jobs/demo-job/input/video.mov")],
        )
        self.assertEqual(result.object_key, "jobs/demo-job/input/video.mov")
        self.assertEqual(result.volume_path, "/runpod-volume/jobs/demo-job/input/video.mov")
        self.assertEqual(result.endpoint_url, "https://s3api-us-ca-2.runpod.io/")

    def test_upload_requires_existing_local_video(self):
        config = RunpodVolumeConfig(volume_id="37wxu5itek", datacenter_id="US-CA-2")

        with self.assertRaises(FileNotFoundError):
            upload_video_to_volume(
                local_video_path="/tmp/does-not-exist.mov",
                job_id="demo-job",
                config=config,
                s3_client=FakeS3Client(),
            )


if __name__ == "__main__":
    unittest.main()
