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

The Flash endpoint is configured as a queue based GPU endpoint named `segment-hazards`. It uses `[GpuGroup.ADA_48_PRO, GpuGroup.AMPERE_48]`, `workers=(0, 1)`, `idle_timeout=1200`, the `flash-gym-artifacts` network volume in `US-CA-2`, and a 100 GB container disk. This avoids blocking on scarce `AMPERE_80` availability during the demo.

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

Warmup mode is supported with:

```json
{"mode": "warmup"}
```

Real segmentation mode should be one Flash request for the reviewed edited image set, not one request per image.

## Validation completed

The following checks passed locally with `.venv/bin/python`:

```bash
.venv/bin/python -m unittest discover tests
.venv/bin/python -m unittest tests/test_sam3_segmentation_contract.py
.venv/bin/python -m unittest tests/test_sam3_segmentation_endpoint.py
.venv/bin/python -m py_compile src/backend/flash_gym/sam3_segmentation_contract.py src/backend/flash_gym/endpoints/segment_hazards.py
```

Local interactive zsh reported that `HF_TOKEN` is present without printing the token value.

Real SAM3 inference has not been run yet. It requires `HF_TOKEN` to be forwarded to the Flash worker and at least one phase 2 edited image manifest on the Runpod network volume.
