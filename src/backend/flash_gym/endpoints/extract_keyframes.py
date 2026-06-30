from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import re

from runpod_flash import DataCenter, Endpoint, GpuGroup, NetworkVolume


VOLUME_ROOT = "/runpod-volume"
JOB_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")


@dataclass(frozen=True)
class KeyframeJobPaths:
    job_id: str
    video_path: str
    keyframes_dir: str
    manifest_path: str


@dataclass(frozen=True)
class KeyframeExtractionRequest:
    job_id: str
    video_path: str
    max_keyframes: int = 30
    prefer_gpu_decode: bool = True

    def __post_init__(self) -> None:
        validate_job_id(self.job_id)
        validate_volume_path(self.video_path)
        if self.max_keyframes < 1:
            raise ValueError("max_keyframes must be at least 1")


def build_job_paths(
    job_id: str,
    volume_root: str = VOLUME_ROOT,
    input_filename: str = "video.mov",
) -> KeyframeJobPaths:
    validate_job_id(job_id)
    root = Path(volume_root) / "jobs" / job_id
    return KeyframeJobPaths(
        job_id=job_id,
        video_path=str(root / "input" / input_filename),
        keyframes_dir=str(root / "keyframes"),
        manifest_path=str(root / "keyframes_manifest.json"),
    )


def build_keyframe_manifest(
    job_id: str,
    decode_mode: str,
    frames: list[dict[str, Any]],
) -> dict[str, Any]:
    validate_job_id(job_id)
    for frame in frames:
        validate_volume_path(frame["path"])

    return {
        "schema_version": 1,
        "stage": "keyframe-extraction",
        "job_id": job_id,
        "decode_mode": decode_mode,
        "extracted_count": len(frames),
        "frames": frames,
    }


def validate_job_id(job_id: str) -> None:
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ValueError("job_id must be a safe file-system slug")


def validate_volume_path(path: str, volume_root: str = VOLUME_ROOT) -> None:
    resolved = Path(path)
    if not resolved.is_absolute():
        raise ValueError(f"path must be absolute under {volume_root}")

    root = Path(volume_root)
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ValueError(f"path must be under {volume_root}") from error


phase1_volume = NetworkVolume(
    name="flash-gym-artifacts",
    size=100,
    datacenter=DataCenter.US_CA_2,
)


@Endpoint(
    name="extract-keyframes",
    gpu=GpuGroup.ADA_24,
    datacenter=DataCenter.US_CA_2,
    volume=phase1_volume,
    workers=(0, 1),
    idle_timeout=1200,
    execution_timeout_ms=600000,
    system_dependencies=["ffmpeg"],
)
async def extract_keyframes(input_data: dict) -> dict:
    from pathlib import Path
    import json
    import subprocess
    import time

    volume_root = Path(VOLUME_ROOT).resolve()
    job_id = input_data.get("job_id")
    if not isinstance(job_id, str):
        raise ValueError("job_id must be a safe file-system slug")
    validate_job_id(job_id)

    default_video_path = volume_root / "jobs" / job_id / "input" / "video.mov"
    video_path = Path(input_data.get("video_path") or default_video_path).resolve()
    try:
        video_path.relative_to(volume_root)
    except ValueError as error:
        raise ValueError("video_path must be under /runpod-volume") from error

    if not video_path.is_file():
        raise FileNotFoundError(f"video not found: {video_path}")

    max_keyframes = int(input_data.get("max_keyframes", 30))
    if max_keyframes < 1:
        raise ValueError("max_keyframes must be at least 1")

    job_root = volume_root / "jobs" / job_id
    paths = {
        "keyframes_dir": job_root / "keyframes",
        "manifest_path": job_root / "keyframes_manifest.json",
    }
    paths["keyframes_dir"].mkdir(parents=True, exist_ok=True)
    for previous_keyframe in paths["keyframes_dir"].glob("kf_*.jpg"):
        previous_keyframe.unlink()

    started_at = time.time()
    ffprobe_result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=width,height,nb_frames,r_frame_rate,codec_type",
            "-of",
            "json",
            str(video_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    ffprobe = json.loads(ffprobe_result.stdout)

    cuda_decode_available = subprocess.run(
        ["ffmpeg", "-hide_banner", "-hwaccels"],
        check=False,
        capture_output=True,
        text=True,
    )
    prefer_gpu_decode = bool(input_data.get("prefer_gpu_decode", True))
    decode_mode = "cuda" if prefer_gpu_decode and "cuda" in cuda_decode_available.stdout else "cpu"

    keyframe_probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-skip_frame",
            "nokey",
            "-show_frames",
            "-show_entries",
            "frame=best_effort_timestamp_time,pkt_pts_time,pict_type",
            "-of",
            "json",
            str(video_path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    keyframe_metadata = []
    if keyframe_probe.returncode == 0 and keyframe_probe.stdout:
        for frame in json.loads(keyframe_probe.stdout).get("frames", []):
            if frame.get("pict_type") != "I":
                continue
            timestamp = frame.get("best_effort_timestamp_time") or frame.get("pkt_pts_time")
            timestamp_ms = None
            if timestamp and timestamp != "N/A":
                timestamp_ms = round(float(timestamp) * 1000)
            keyframe_metadata.append({"timestamp_ms": timestamp_ms})
            if len(keyframe_metadata) >= max_keyframes:
                break

    output_pattern = paths["keyframes_dir"] / "kf_%04d.jpg"

    def build_ffmpeg_command(use_cuda: bool) -> list[str]:
        command = ["ffmpeg", "-hide_banner", "-y"]
        if use_cuda:
            command.extend(["-hwaccel", "cuda"])
        command.extend(
            [
                "-skip_frame",
                "nokey",
                "-i",
                str(video_path),
                "-map",
                "0:v:0",
                "-frames:v",
                str(max_keyframes),
                "-q:v",
                "2",
                str(output_pattern),
            ]
        )
        return command

    ffmpeg_result = subprocess.run(
        build_ffmpeg_command(decode_mode == "cuda"),
        check=False,
        capture_output=True,
        text=True,
    )
    if decode_mode == "cuda" and ffmpeg_result.returncode != 0:
        decode_mode = "cpu"
        ffmpeg_result = subprocess.run(
            build_ffmpeg_command(False),
            check=False,
            capture_output=True,
            text=True,
        )
    if ffmpeg_result.returncode != 0:
        raise RuntimeError(f"ffmpeg keyframe extraction failed: {ffmpeg_result.stderr}")

    frames = []
    keyframe_files = sorted(paths["keyframes_dir"].glob("kf_*.jpg"))
    for index, keyframe_path in enumerate(keyframe_files[:max_keyframes]):
        frame = {
            "frame_id": keyframe_path.stem,
            "path": str(keyframe_path),
        }
        if index < len(keyframe_metadata) and keyframe_metadata[index]["timestamp_ms"] is not None:
            frame["timestamp_ms"] = keyframe_metadata[index]["timestamp_ms"]
        frames.append(frame)

    manifest = build_keyframe_manifest(job_id=job_id, decode_mode=decode_mode, frames=frames)
    manifest.update(
        {
            "status": "extracted" if frames else "no-keyframes-extracted",
            "source_video_path": str(video_path),
            "max_keyframes": max_keyframes,
            "ffprobe": ffprobe,
            "elapsed_seconds": round(time.time() - started_at, 3),
        }
    )

    manifest_path = paths["manifest_path"]
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    return {
        "job_id": job_id,
        "status": manifest["status"],
        "manifest_path": str(manifest_path),
        "keyframes_dir": str(paths["keyframes_dir"]),
        "decode_mode": decode_mode,
        "extracted_count": len(frames),
    }
