---
title: Phase 3 SAM3 segmentation
status: active
created: 2026-06-30
updated: 2026-06-30
source_type: implementation-note
---

# Phase 3 SAM3 segmentation

Phase 3 is the hazard segmentation stage. It uses Hugging Face `facebook/sam3` through Transformers, not Ultralytics `sam3.pt`.

The user reported that access to the gated Hugging Face model has been granted. Runtime workers still need Hugging Face authentication available through `HF_TOKEN` or an equivalent authenticated Hugging Face cache. Do not commit the token.

The endpoint config forwards `HF_TOKEN` from the local process environment when it is present. If the token only lives in `~/.zshrc`, run Flash from a shell that loads that file, or export `HF_TOKEN` in the session before `flash dev` or `flash deploy`.

## Files

Current phase 3 files:

- `src/backend/flash_gym/sam3_segmentation_contract.py`
- `src/backend/flash_gym/endpoints/segment_hazards.py`
- `tests/test_sam3_segmentation_contract.py`
- `tests/test_sam3_segmentation_endpoint.py`

The Flash endpoint is configured as a queue based GPU endpoint named `segment-hazards`. It uses `[GpuGroup.ADA_48_PRO, GpuGroup.AMPERE_48, GpuGroup.ADA_80_PRO, GpuGroup.AMPERE_80, GpuGroup.BLACKWELL_96, GpuGroup.HOPPER_141, GpuGroup.BLACKWELL_180]`, `workers=(0, 1)`, `idle_timeout=1200`, the `flash-gym-artifacts` network volume in `US-CA-2`, and a 100 GB container disk. This avoids blocking on one scarce GPU pool during the demo.

## Contract

The request contract is intentionally small:

- `job_id`
- `approved_frame_ids`
- `concept_prompt`
- optional `edit_manifest_path`
- optional `max_images`
- optional `batch_size`
- optional `score_threshold`
- optional `mask_threshold`
- optional `model_id`
- optional `model_cache_dir`

Default paths:

```text
/runpod-volume/jobs/{job_id}/edit_manifest.json
/runpod-volume/jobs/{job_id}/masks/
/runpod-volume/jobs/{job_id}/segmentation_manifest.json
/runpod-volume/jobs/{job_id}/segmentation_progress.json
/runpod-volume/models/sam3
```

The endpoint reads phase 2 `edit_manifest.json`, selects approved edited images by `frame_id`, segments each edited image with the same text concept prompt, writes binary PNG masks, and writes `segmentation_manifest.json`.

The manifest includes schema version, stage, job ID, model ID, concept prompt, source manifest path, segmented image count, instance count, image records, mask paths, `xyxy` boxes, scores, and mask areas.

## Runtime notes

The endpoint lazy loads `Sam3Model` and `Sam3Processor` once per worker and reuses them for the batch. Model and Hugging Face cache paths point at `/runpod-volume/` so the model is not part of the Flash artifact.

Meta's official SAM3 release provides code, checkpoints, and a playground, not a confirmed hosted production API. Roboflow documents a hosted SAM3 HTTP API at `https://serverless.roboflow.com/sam3/concept_segment`, plus related visual segmentation endpoints. This is useful as a reference or fallback, but the project baseline remains the Runpod Flash `segment-hazards` endpoint because the hackathon constraint is to use Flash for cloud execution.

For the demo mock path, SAM3 should run once offline against the hazard edits under `media/hazards/` and write static overlays plus a manifest under `media/segmentations/`. The frontend mock should only read those static generated artifacts. The offline generation uses the broad prompt `object on the floor` and must not send the known hazard labels from demo filenames or the phase 2 edit prompt.

Warmup mode is supported with:

```json
{"mode": "warmup"}
```

Real segmentation mode should be one Flash request for the reviewed edited image set, not one request per image.

Smoke test mode is supported with real public image URLs:

```json
{
  "mode": "smoke_test",
  "job_id": "sam3-smoke-cats",
  "image_urls": [
    "https://images.cocodataset.org/val2017/000000039769.jpg",
    "https://images.cocodataset.org/val2017/000000077595.jpg"
  ],
  "concept_prompt": "cat"
}
```

This mode downloads the images on the worker, writes a phase 2 shaped `edit_manifest.json`, then runs the normal segmentation path.

## Validation completed

The following checks passed locally with `.venv/bin/python`:

```bash
.venv/bin/python -m unittest discover tests
.venv/bin/python -m unittest tests/test_sam3_segmentation_contract.py
.venv/bin/python -m unittest tests/test_sam3_segmentation_endpoint.py
.venv/bin/python -m py_compile src/backend/flash_gym/sam3_segmentation_contract.py src/backend/flash_gym/endpoints/segment_hazards.py
```

Local interactive zsh reported that `HF_TOKEN` is present without printing the token value.

Real SAM3 inference has not completed yet. Attempts with `AMPERE_80`, then 48 GB and broader fallback pools, remained queued with no worker after bounded polling. The smoke job was cancelled and local `flash dev` was stopped. Current blocker is Runpod worker capacity/provisioning for the `segment-hazards` endpoint in `US-CA-2`, not a SAM3 inference error.

A later dev-only smoke endpoint using `GpuGroup.ANY` provisioned quickly and reached Python. It exposed two implementation issues: worker-side HTTPS certificate mismatch for `https://images.cocodataset.org/...`, avoided by using `http://` for COCO smoke images, and a NumPy binary incompatibility in the dependency layer. The SAM3 endpoints now pin `numpy==2.2.6`; the dev smoke endpoint also force reinstalls that wheel and runs SAM3 inference in a child Python process so the worker does not use a mixed NumPy import state.

The dev-only smoke endpoint completed successfully on real COCO images with `concept_prompt` set to `cat`:

```text
job_id: sam3-smoke-any-cats-subprocess
model_id: facebook/sam3
image_count: 2
instance_count: 3
elapsed_seconds: 55.903
```

The output mask paths were under `/tmp/flash-gym/jobs/sam3-smoke-any-cats-subprocess/masks/` on the worker. This validates Hugging Face gated model access, model load, promptable segmentation, mask writing, and response serialization for a no-volume smoke path. It does not yet validate the production `/runpod-volume/` path because that endpoint is still constrained by the `US-CA-2` network volume and GPU availability.
