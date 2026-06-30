---
title: Phase 1 keyframes
status: active
created: 2026-06-30
updated: 2026-06-30
source_type: implementation-note
---

# Phase 1 keyframes

Phase 1 is the FFmpeg/NVDEC keyframe extraction stage. The backend contract, endpoint, and tests are the source of truth for this phase.

Phase 1 does not perform automated quality scoring, ranking, diversity selection, thumbnail generation, or model based frame analysis. The human reviewer decides which extracted keyframes are useful.

## Runpod storage

A Runpod network volume has been created for phase 1 artifacts.

- Name: `flash-gym-artifacts`
- ID: `37wxu5itek`
- Datacenter: `US-CA-2`
- Size: 100 GB
- Worker mount path: `/runpod-volume/`

The Runpod create call returned a 500 response, but a follow up volume list showed the volume exists. Do not retry creation unless the volume is missing.

The upload path for a demo video should be:

```text
/runpod-volume/jobs/{job_id}/input/video.mov
```

Runpod S3 compatible upload can copy a local video into this volume without using AWS storage. The bucket value is the Runpod network volume ID, and the endpoint should match the volume datacenter.

## Files

Current phase 1 files:

- `src/backend/flash_gym/endpoints/extract_keyframes.py`
- `src/backend/flash_gym/runpod_volume_upload.py`
- `src/backend/requirements.txt`
- `tests/test_extract_keyframes.py`
- `tests/test_runpod_volume_upload.py`

Frontend files are not authoritative for this phase. The Next.js API route proxies or dry-runs the backend endpoint request shape.

The Flash endpoint is configured as a queue based GPU endpoint named `extract-keyframes`. It uses `GpuGroup.ADA_24`, `workers=(0, 1)`, `idle_timeout=1200`, `ffmpeg`, and the `flash-gym-artifacts` network volume in `US-CA-2`.

The current endpoint validates the input video path, probes video metadata with `ffprobe`, attempts FFmpeg CUDA decode when available, falls back to CPU FFmpeg if needed, extracts video keyframes, writes a manifest with extracted frame paths and timestamps when available, and returns storage paths.

The request contract is intentionally small: `job_id`, optional `video_path`, `max_keyframes`, and `prefer_gpu_decode`.

The manifest is review ready. It includes schema version, stage, job ID, decode mode, extracted count, and frame records with file paths and timestamps when available.

The upload helper copies a local video into the Runpod network volume through the Runpod S3 compatible API. It uses the volume ID as the bucket and returns the worker path to pass into Flash.

## Local development

Use Python 3.12 for this project because the Flash context notes document lower GPU cold start overhead for Python 3.12 workers.

Local dependency setup uses `uv`:

```bash
uv venv --python python3.12 --clear .venv
uv pip install -r src/backend/requirements.txt
```

## Validation completed

The following checks passed locally with `.venv/bin/python`:

```bash
.venv/bin/python -m unittest tests/test_extract_keyframes.py
.venv/bin/python -m unittest tests/test_runpod_volume_upload.py
.venv/bin/python -m py_compile src/backend/flash_gym/endpoints/extract_keyframes.py src/backend/flash_gym/runpod_volume_upload.py
PYTHONPATH=src/backend .venv/bin/python -c "from flash_gym.endpoints.extract_keyframes import extract_keyframes; print(extract_keyframes)"
```

## Next backend steps

- Upload `runpod-venue.mov` to `/runpod-volume/jobs/{job_id}/input/video.mov`.
- Run the endpoint through `flash dev --auto-provision` against the uploaded video.
- Verify extracted keyframe images under `/runpod-volume/jobs/{job_id}/keyframes/`.
- Confirm NVDEC is used on the remote worker or record the CPU fallback reason.
