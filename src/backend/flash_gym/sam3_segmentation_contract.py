from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os
import re
from typing import Any
from urllib.parse import urlparse


DEFAULT_MODEL_ID = "facebook/sam3"
DEFAULT_MODEL_CACHE_DIR = "/runpod-volume/models/sam3"
DEFAULT_VOLUME_ROOT = "/runpod-volume"
DEFAULT_HF_HOME = "/runpod-volume/.cache/huggingface"
DEFAULT_HF_HUB_CACHE = "/runpod-volume/.cache/huggingface/hub"
MAX_SMOKE_IMAGE_URLS = 8
FRAME_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
JOB_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")


@dataclass(frozen=True)
class Sam3SegmentationJobPaths:
    job_id: str
    edit_manifest_path: str
    masks_dir: str
    manifest_path: str
    progress_path: str
    model_cache_dir: str


@dataclass(frozen=True)
class Sam3SegmentationRequest:
    job_id: str
    edit_manifest_path: str
    approved_frame_ids: tuple[str, ...]
    concept_prompt: str
    max_images: int = 30
    batch_size: int = 4
    score_threshold: float = 0.5
    mask_threshold: float = 0.5
    model_id: str = DEFAULT_MODEL_ID
    model_cache_dir: str = DEFAULT_MODEL_CACHE_DIR

    def __post_init__(self) -> None:
        validate_job_id(self.job_id)
        validate_volume_path(self.edit_manifest_path)
        validate_volume_path(self.model_cache_dir)
        if not self.approved_frame_ids:
            raise ValueError("approved_frame_ids cannot be empty")
        for frame_id in self.approved_frame_ids:
            validate_frame_id(frame_id)
        if not self.concept_prompt.strip():
            raise ValueError("concept_prompt cannot be empty")
        if self.max_images < 1:
            raise ValueError("max_images must be at least 1")
        if self.batch_size < 1:
            raise ValueError("batch_size must be at least 1")
        validate_threshold(self.score_threshold, "score_threshold")
        validate_threshold(self.mask_threshold, "mask_threshold")


def build_sam3_endpoint_env(
    hf_token: str | None = None,
    hf_home: str = DEFAULT_HF_HOME,
    hf_hub_cache: str | None = None,
) -> dict[str, str]:
    hub_cache = hf_hub_cache or str(Path(hf_home) / "hub")
    env = {
        "HF_HOME": hf_home,
        "HF_HUB_CACHE": hub_cache,
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
        "TOKENIZERS_PARALLELISM": "false",
    }
    token = hf_token if hf_token is not None else os.environ.get("HF_TOKEN")
    if token:
        env["HF_TOKEN"] = token
    return env


def validate_smoke_image_urls(image_urls: list[str]) -> tuple[str, ...]:
    if not image_urls:
        raise ValueError("image_urls cannot be empty")
    if len(image_urls) > MAX_SMOKE_IMAGE_URLS:
        raise ValueError(f"image_urls cannot contain more than {MAX_SMOKE_IMAGE_URLS} items")

    validated = []
    for image_url in image_urls:
        parsed = urlparse(image_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("image_urls must be absolute http or https URLs")
        validated.append(image_url)
    return tuple(validated)


def build_sam3_smoke_edit_manifest(job_id: str, image_paths: list[str]) -> dict[str, Any]:
    validate_job_id(job_id)
    if not image_paths:
        raise ValueError("image_paths cannot be empty")

    images = []
    for index, image_path in enumerate(image_paths, start=1):
        validate_volume_path(image_path)
        frame_id = f"kf_{index:04d}"
        images.append(
            {
                "frame_id": frame_id,
                "source_path": image_path,
                "edited_path": image_path,
                "seed": 0,
            }
        )

    return {
        "schema_version": 1,
        "stage": "hazard-edit",
        "job_id": job_id,
        "model_id": "smoke-test-real-images",
        "prompt": "Real public image fixture for SAM3 smoke testing.",
        "source_manifest_path": "smoke-test",
        "status": "smoke-test-fixture",
        "edited_count": len(images),
        "images": images,
    }


def build_sam3_segmentation_paths(
    job_id: str,
    volume_root: str = DEFAULT_VOLUME_ROOT,
    model_cache_dir: str = DEFAULT_MODEL_CACHE_DIR,
) -> Sam3SegmentationJobPaths:
    validate_job_id(job_id)
    root = Path(volume_root) / "jobs" / job_id
    return Sam3SegmentationJobPaths(
        job_id=job_id,
        edit_manifest_path=str(root / "edit_manifest.json"),
        masks_dir=str(root / "masks"),
        manifest_path=str(root / "segmentation_manifest.json"),
        progress_path=str(root / "segmentation_progress.json"),
        model_cache_dir=model_cache_dir,
    )


def select_approved_edited_images(
    edit_manifest: dict[str, Any],
    approved_frame_ids: tuple[str, ...],
    max_images: int,
) -> list[dict[str, Any]]:
    if max_images < 1:
        raise ValueError("max_images must be at least 1")
    if not approved_frame_ids:
        raise ValueError("approved_frame_ids cannot be empty")

    approved = set()
    for frame_id in approved_frame_ids:
        validate_frame_id(frame_id)
        approved.add(frame_id)

    matching = []
    seen = set()
    for image in edit_manifest.get("images", []):
        frame_id = image.get("frame_id")
        if frame_id not in approved:
            continue
        validate_frame_id(frame_id)
        if "source_path" in image:
            validate_volume_path(image["source_path"])
        validate_volume_path(image["edited_path"])
        matching.append(image)
        seen.add(frame_id)

    missing = approved - seen
    if missing:
        missing_list = ", ".join(sorted(missing))
        raise ValueError(f"approved frames were not found in edit manifest: {missing_list}")

    return matching[:max_images]


def build_sam3_segmentation_manifest(
    job_id: str,
    model_id: str,
    concept_prompt: str,
    source_manifest_path: str,
    images: list[dict[str, Any]],
) -> dict[str, Any]:
    validate_job_id(job_id)
    validate_volume_path(source_manifest_path)
    if not concept_prompt.strip():
        raise ValueError("concept_prompt cannot be empty")

    instance_count = 0
    for image in images:
        validate_frame_id(image["frame_id"])
        if "source_path" in image:
            validate_volume_path(image["source_path"])
        validate_volume_path(image["edited_path"])
        if int(image["width"]) < 1 or int(image["height"]) < 1:
            raise ValueError("image width and height must be positive")
        for instance in image.get("instances", []):
            validate_frame_id(instance["instance_id"])
            validate_volume_path(instance["mask_path"])
            bbox = instance["bbox_xyxy"]
            if len(bbox) != 4:
                raise ValueError("bbox_xyxy must contain four values")
            validate_threshold(float(instance["score"]), "score")
            if int(instance["area_pixels"]) < 0:
                raise ValueError("area_pixels cannot be negative")
            instance_count += 1

    return {
        "schema_version": 1,
        "stage": "hazard-segmentation",
        "job_id": job_id,
        "model_id": model_id,
        "concept_prompt": concept_prompt,
        "source_manifest_path": source_manifest_path,
        "segmented_count": len(images),
        "instance_count": instance_count,
        "images": images,
    }


def validate_frame_id(frame_id: str) -> None:
    if not FRAME_ID_PATTERN.fullmatch(frame_id):
        raise ValueError("frame_id must be a safe file-system slug")


def validate_job_id(job_id: str) -> None:
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ValueError("job_id must be a safe file-system slug")


def validate_threshold(value: float, field_name: str) -> None:
    if value < 0 or value > 1:
        raise ValueError(f"{field_name} must be between 0 and 1")


def validate_volume_path(path: str, volume_root: str = DEFAULT_VOLUME_ROOT) -> None:
    resolved = Path(path)
    if not resolved.is_absolute():
        raise ValueError(f"path must be absolute under {volume_root}")

    root = Path(volume_root)
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ValueError(f"path must be under {volume_root}") from error
