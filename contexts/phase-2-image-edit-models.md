---
title: Phase 2 image edit model research
status: active
created: 2026-06-30
updated: 2026-06-30
source_type: research-note
---

# Phase 2 image edit model research

Phase 2 is the hazard image editing stage after human keyframe review. The user clarified that the model must be hosted through Runpod Flash. Public Runpod image editing endpoints are not acceptable as the final phase 2 execution path.

The first self-hosted Qwen Image Edit 2511 Flash endpoint targeted `GpuGroup.AMPERE_80`, but a real Flash warmup request waited because `AMPERE_80` capacity was unavailable in `US-CA-2`. The backend now targets Step1X-Edit v1.2 on 48 GB GPU pools as the smaller Flash-hosted candidate.

Real Flash diagnostics for the Step1X endpoint succeeded through `flash dev --auto-provision`. The provisioned worker reported `NVIDIA RTX 6000 Ada Generation` with 47.37 GB VRAM and CUDA available. This validated Flash provisioning and endpoint body execution without loading the model.

## Self-hosted candidates

`Qwen/Qwen-Image-Edit-2511` remains the preferred quality target from the original plan. Official sources confirm it is a Diffusers image-to-image model using `QwenImageEditPlusPipeline`, with Apache 2.0 licensing. Hugging Face API metadata reported about 57.7 GB of model storage. It is a poor fit for Flash deployment artifacts and should use network volume or Hugging Face cache storage.

`black-forest-labs/FLUX.1-Kontext-dev` is a 12B image editing model. Runpod docs describe it as a rectified flow transformer for text-instruction edits that preserves overall context and style. Artificial Analysis ranked Flux Kontext above Qwen in one image editing leaderboard snapshot. Hugging Face API metadata reported about 67 GB of model storage, gated access, and a non-commercial Flux dev license. This does not clearly solve the local model storage or deployment complexity problem.

`Step1X-Edit` is a strong open-source candidate with Apache 2.0 licensing. The official repository claims strong open-source benchmark results and reports peak GPU memory around 42.5 GB, 46.5 GB, and 49.8 GB for 512, 786, and 1024 pixel runs. It reports 31 GB to 34 GB with FP8 and 18 GB with FP8 plus offload. The v1.2 model is `stepfun-ai/Step1X-Edit-v1p2`, uses a custom Diffusers branch, and Hugging Face API metadata reported about 41.8 GB of storage. This is now the default Flash-hosted phase 2 candidate.

Older lightweight instruction editors such as InstructPix2Pix are much easier to run, but they are not competitive enough for the current demo goal unless the demo prioritizes speed over edit realism.

## Hosted Runpod Public Endpoint candidates

Runpod Public Endpoints avoid self-hosting the image edit model in our Flash worker. This path is useful for comparison only, not final architecture, because the user explicitly requires hosting the model on Runpod Flash.

A Flash endpoint could still orchestrate stage 2 by sending image URLs to a Runpod Public Endpoint, then downloading the returned temporary image URL into `/runpod-volume/jobs/{job_id}/edited/` and writing the same manifest shape, but this is now out of scope unless the user changes the constraint.

This changes the backend from model execution inside our Flash worker to Flash orchestration plus hosted image editing. It avoids 80 GB GPU availability, large model downloads, and local VRAM tuning. It requires source keyframes to be available as URLs, or a small helper endpoint/storage path that can expose them to the hosted model safely.

Runpod Public Endpoint options found in docs:

- `qwen-image-edit-2511`: `https://api.runpod.ai/v2/qwen-image-edit-2511/runsync`, 0.02 dollars per image, accepts 1 to 3 image URLs.
- `black-forest-labs-flux-1-kontext-dev`: `https://api.runpod.ai/v2/black-forest-labs-flux-1-kontext-dev/runsync`, 0.025 dollars per image, accepts one image URL.
- `p-image-edit`: `https://api.runpod.ai/v2/p-image-edit/runsync`, 0.01 dollars per image, accepts 1 to 5 image URLs and is described by Pruna as under one second with strong prompt adherence and text rendering.
- `seedream-v4-edit`: `https://api.runpod.ai/v2/seedream-v4-edit/runsync`, 0.027 dollars per image, accepts image URL arrays.
- `google-nano-banana-2-edit`: `https://api.runpod.ai/v2/google-nano-banana-2-edit/runsync`, 0.0875 to 0.175 dollars per image depending on resolution, accepts up to 14 images but recommends 1 to 3.

Public endpoint outputs are temporary URLs. The backend must download and persist outputs immediately if this path is used.

## Leaderboard signals

Artificial Analysis says its image editing leaderboard uses blind votes in an image arena. In the scraped snapshot, Flux Kontext was listed at position 12 and Qwen at position 25. The top models were mostly closed hosted models from OpenAI, Microsoft, Google, and others.

Arena AI reported an image edit leaderboard snapshot with 27,812,764 votes dated June 25, 2026. It listed `qwen-image-edit` at position 26 and `qwen-image-edit-2511` at position 28. It listed `flux-1-kontext-pro` at position 41, not necessarily the same as the Runpod `Flux Kontext Dev` endpoint.

These leaderboards are useful for quality direction but do not provide local GPU requirements.

## Recommendation

For the hackathon demo, use a self-hosted Runpod Flash endpoint with Step1X-Edit v1.2 on 48 GB GPU pools. Keep Qwen Image Edit 2511 as the aspirational model if 80 GB capacity becomes available, but do not block phase 2 on it.

Use `mode: "diagnostics"` before `mode: "warmup"` so the endpoint reports the actual provisioned GPU and memory before any long model download or load. Do not run opaque long warmup calls without progress logs.

## Open questions

- How should phase 2 expose selected keyframes as URLs for Runpod Public Endpoints without leaking private user data?
- Can Runpod network volume S3 URLs be used directly by public endpoints, or do we need signed URLs or a short-lived file-serving endpoint?
- Which hosted editor gives the best hazard insertion realism on venue keyframes: Qwen 2511, P-Image Edit, Flux Kontext Dev, Seedream 4 Edit, or Nano Banana 2 Edit?
