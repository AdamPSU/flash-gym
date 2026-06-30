from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
import argparse
import os
import re


DEFAULT_VOLUME_ROOT = "/runpod-volume"
JOB_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")


class S3Client(Protocol):
    def upload_file(self, file_path: str, bucket_name: str, object_key: str) -> None: ...


@dataclass(frozen=True)
class RunpodVolumeConfig:
    volume_id: str
    datacenter_id: str
    endpoint_url: str | None = None

    @property
    def resolved_endpoint_url(self) -> str:
        return self.endpoint_url or build_s3_endpoint_url(self.datacenter_id)


@dataclass(frozen=True)
class UploadResult:
    local_video_path: str
    bucket_name: str
    object_key: str
    volume_path: str
    endpoint_url: str


def build_s3_endpoint_url(datacenter_id: str) -> str:
    datacenter_slug = datacenter_id.strip().lower()
    if not re.fullmatch(r"[a-z0-9-]+", datacenter_slug):
        raise ValueError("datacenter_id must contain only letters, numbers, and hyphens")

    return f"https://s3api-{datacenter_slug}.runpod.io/"


def build_video_object_key(job_id: str, destination_filename: str = "video.mov") -> str:
    validate_job_id(job_id)
    validate_destination_filename(destination_filename)
    return f"jobs/{job_id}/input/{destination_filename}"


def build_video_mount_path(job_id: str, destination_filename: str = "video.mov") -> str:
    return f"{DEFAULT_VOLUME_ROOT}/{build_video_object_key(job_id, destination_filename)}"


def upload_video_to_volume(
    local_video_path: str,
    job_id: str,
    config: RunpodVolumeConfig,
    s3_client: S3Client | None = None,
    destination_filename: str = "video.mov",
) -> UploadResult:
    local_path = Path(local_video_path)
    if not local_path.is_file():
        raise FileNotFoundError(f"video not found: {local_video_path}")

    object_key = build_video_object_key(job_id, destination_filename)
    endpoint_url = config.resolved_endpoint_url
    client = s3_client or create_s3_client(config)
    client.upload_file(str(local_path), config.volume_id, object_key)

    return UploadResult(
        local_video_path=str(local_path),
        bucket_name=config.volume_id,
        object_key=object_key,
        volume_path=build_video_mount_path(job_id, destination_filename),
        endpoint_url=endpoint_url,
    )


def create_s3_client(config: RunpodVolumeConfig) -> S3Client:
    import boto3

    access_key_id = os.environ.get("RUNPOD_S3_ACCESS_KEY_ID") or os.environ.get("AWS_ACCESS_KEY_ID")
    secret_access_key = os.environ.get("RUNPOD_S3_SECRET_ACCESS_KEY") or os.environ.get("AWS_SECRET_ACCESS_KEY")

    if not access_key_id or not secret_access_key:
        raise EnvironmentError(
            "Set RUNPOD_S3_ACCESS_KEY_ID and RUNPOD_S3_SECRET_ACCESS_KEY, or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY."
        )

    return boto3.client(
        "s3",
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name=config.datacenter_id,
        endpoint_url=config.resolved_endpoint_url,
    )


def validate_job_id(job_id: str) -> None:
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ValueError("job_id must be a safe file-system slug")


def validate_destination_filename(destination_filename: str) -> None:
    if Path(destination_filename).name != destination_filename:
        raise ValueError("destination_filename must not contain path separators")
    if not destination_filename:
        raise ValueError("destination_filename cannot be empty")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Upload a local video to a Runpod network volume.")
    parser.add_argument("local_video_path", help="Local video file to upload.")
    parser.add_argument("--job-id", required=True, help="Safe job ID used in /runpod-volume/jobs/{job_id}.")
    parser.add_argument("--volume-id", required=True, help="Runpod network volume ID used as the S3 bucket.")
    parser.add_argument("--datacenter-id", default="US-CA-2", help="Runpod datacenter ID for the network volume.")
    parser.add_argument("--endpoint-url", default=None, help="Override the Runpod S3-compatible endpoint URL.")
    parser.add_argument("--destination-filename", default="video.mov", help="Filename under jobs/{job_id}/input/.")
    args = parser.parse_args(argv)

    result = upload_video_to_volume(
        local_video_path=args.local_video_path,
        job_id=args.job_id,
        config=RunpodVolumeConfig(
            volume_id=args.volume_id,
            datacenter_id=args.datacenter_id,
            endpoint_url=args.endpoint_url,
        ),
        destination_filename=args.destination_filename,
    )

    print(result.volume_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
