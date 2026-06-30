from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any


DEFAULT_MODEL_ID = "black-forest-labs/FLUX.2-klein-4B"
DEFAULT_MODEL_CACHE_DIR = "/runpod-volume/models/flux2-klein-4b"
DEFAULT_VOLUME_ROOT = "/runpod-volume"
FRAME_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
JOB_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")


@dataclass(frozen=True)
class HazardEditJobPaths:
    job_id: str
    keyframe_manifest_path: str
    edited_dir: str
    manifest_path: str
    progress_path: str
    model_cache_dir: str


@dataclass(frozen=True)
class HazardEditRequest:
    job_id: str
    keyframe_manifest_path: str
    approved_frame_ids: tuple[str, ...]
    prompt: str
    max_images: int = 30
    seed: int = 0
    num_inference_steps: int = 4
    true_cfg_scale: float = 4.0
    guidance_scale: float = 1.0
    negative_prompt: str = " "
    model_id: str = DEFAULT_MODEL_ID
    model_cache_dir: str = DEFAULT_MODEL_CACHE_DIR
    max_dimension: int = 768

    def __post_init__(self) -> None:
        validate_job_id(self.job_id)
        validate_volume_path(self.keyframe_manifest_path)
        validate_volume_path(self.model_cache_dir)
        if not self.prompt.strip():
            raise ValueError("prompt cannot be empty")
        if self.max_images < 1:
            raise ValueError("max_images must be at least 1")
        if self.num_inference_steps < 1:
            raise ValueError("num_inference_steps must be at least 1")
        if self.max_dimension < 1:
            raise ValueError("max_dimension must be at least 1")
        if not self.approved_frame_ids:
            raise ValueError("approved_frame_ids cannot be empty")
        for frame_id in self.approved_frame_ids:
            validate_frame_id(frame_id)


def build_hazard_edit_paths(
    job_id: str,
    volume_root: str = DEFAULT_VOLUME_ROOT,
    model_cache_dir: str = DEFAULT_MODEL_CACHE_DIR,
) -> HazardEditJobPaths:
    validate_job_id(job_id)
    root = Path(volume_root) / "jobs" / job_id
    return HazardEditJobPaths(
        job_id=job_id,
        keyframe_manifest_path=str(root / "keyframes_manifest.json"),
        edited_dir=str(root / "edited"),
        manifest_path=str(root / "edit_manifest.json"),
        progress_path=str(root / "edit_progress.json"),
        model_cache_dir=model_cache_dir,
    )


def select_approved_frames(
    keyframe_manifest: dict[str, Any],
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
    for frame in keyframe_manifest.get("frames", []):
        frame_id = frame.get("frame_id")
        if frame_id not in approved:
            continue
        validate_frame_id(frame_id)
        validate_volume_path(frame["path"])
        matching.append(frame)
        seen.add(frame_id)

    missing = approved - seen
    if missing:
        missing_list = ", ".join(sorted(missing))
        raise ValueError(f"approved frames were not found in keyframe manifest: {missing_list}")

    return matching[:max_images]


def build_hazard_edit_manifest(
    job_id: str,
    model_id: str,
    prompt: str,
    source_manifest_path: str,
    images: list[dict[str, Any]],
) -> dict[str, Any]:
    validate_job_id(job_id)
    validate_volume_path(source_manifest_path)
    if not prompt.strip():
        raise ValueError("prompt cannot be empty")
    for image in images:
        validate_frame_id(image["frame_id"])
        validate_volume_path(image["source_path"])
        validate_volume_path(image["edited_path"])

    return {
        "schema_version": 1,
        "stage": "hazard-edit",
        "job_id": job_id,
        "model_id": model_id,
        "prompt": prompt,
        "source_manifest_path": source_manifest_path,
        "edited_count": len(images),
        "images": images,
    }


def validate_frame_id(frame_id: str) -> None:
    if not FRAME_ID_PATTERN.fullmatch(frame_id):
        raise ValueError("frame_id must be a safe file-system slug")


def validate_job_id(job_id: str) -> None:
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ValueError("job_id must be a safe file-system slug")


def validate_volume_path(path: str, volume_root: str = DEFAULT_VOLUME_ROOT) -> None:
    resolved = Path(path)
    if not resolved.is_absolute():
        raise ValueError(f"path must be absolute under {volume_root}")

    root = Path(volume_root)
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ValueError(f"path must be under {volume_root}") from error
