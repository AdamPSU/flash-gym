---
title: Sources
status: active
created: 2026-06-30
updated: 2026-06-30
source_type: bibliography
---

# Sources

Sources captured on 2026-06-30.

## Team notes

- User supplied hackathon brief in this session.
- Adam Chan in person hackathon logistics note supplied in this session.
- User clarified the preferred review loop and serverless pipeline strategy in this session.
- User approved creation of the `flash-gym-artifacts` Runpod network volume for phase 1 in this session.
- User clarified that the current frontend may be deleted and should not drive this consolidation pass.
- User clarified that the frontend should be Next.js and should use backend endpoints under `src/backend/flash_gym/endpoints/` as the contract source.
- User clarified that phase 2 must host the image editing model on Runpod Flash and must not rely on Runpod Public Endpoints as the final execution path.
- Real Flash diagnostics for `edit-hazards` provisioned an RTX 6000 Ada worker with 47.37 GB VRAM through `flash dev --auto-provision` in this session.
- User directed phase 2 toward `black-forest-labs/FLUX.2-klein-4B` as the active self-hosted Flash model.
- Real Flash warmup for `black-forest-labs/FLUX.2-klein-4B` completed after using `low_cpu_mem_usage=False` and `enable_model_cpu_offload()`.
- Real Flash one-frame edit for `job_id=runpod-venue` and `kf_0001` completed after patching the FLUX.2 Klein guidance tensor path. It returned `status=edited` and `edited_count=1`.
- User clarified keyframe manifest visual behavior: no candidate badge, full panel active frame, thumbnail navigation, and no page scrolling.
- User clarified that phase 3 should use Hugging Face `facebook/sam3` and reported that access to the gated model has been granted.
- User clarified frontend visual behavior: loading buttons must be obvious during waits, `local setup` should not appear in the header, upload video should not be a documented stage row, and keyframe previous, next, and remove controls should live inside the manifest preview.
- User added real keyframes from the venue video under `media/` and clarified that demo extraction should show those keyframes when the user clicks `Extract keyframes`.
- User clarified that demo mocks should use API keys for one-time artifact generation, phase 3 should use SAM3 after hazard edits are generated under `media/hazards/`, and the frontend mock should use static generated SAM3 artifacts without using the known inserted hazard label.
- User asked to use WaveSpeed MCP with Wan 2.7 image edit to insert three compact hazards. Generated demo hazard edits were accepted by user inspection and saved under `media/hazards/`.

## Runpod Flash documentation

- Flash overview: https://docs.runpod.io/flash/overview
- Flash quickstart: https://docs.runpod.io/flash/quickstart
- Create endpoints: https://docs.runpod.io/flash/create-endpoints
- Execution model: https://docs.runpod.io/flash/execution-model
- Local testing: https://docs.runpod.io/flash/apps/local-testing
- Deploy Flash apps: https://docs.runpod.io/flash/apps/deploy-apps
- Apps and environments: https://docs.runpod.io/flash/apps/apps-and-environments
- Configuration best practices: https://docs.runpod.io/flash/configuration/best-practices
- Storage: https://docs.runpod.io/flash/configuration/storage
- Endpoint parameters: https://docs.runpod.io/flash/configuration/parameters

## Runpod storage documentation

- S3 compatible API: https://docs.runpod.io/storage/s3-api
- Network volume storage tool: https://docs.runpod.io/community-solutions/runpod-network-volume-storage-tool

## Runpod Public Endpoint documentation

- Flux Kontext Dev: https://docs.runpod.io/public-endpoints/models/flux-kontext-dev
- Qwen Image Edit 2511: https://docs.runpod.io/public-endpoints/models/qwen-image-edit-2511
- P-Image Edit: https://docs.runpod.io/public-endpoints/models/p-image-edit
- Seedream 4.0 Edit: https://docs.runpod.io/public-endpoints/models/seedream-4-edit
- Nano Banana 2 Edit: https://docs.runpod.io/public-endpoints/models/nano-banana-2-edit

## Image editing model research

- Artificial Analysis image editing leaderboard: https://artificialanalysis.ai/image/leaderboard/editing
- Arena AI image editing leaderboard: https://arena.ai/leaderboard/image-edit
- Qwen Image Edit 2511 model card: https://huggingface.co/Qwen/Qwen-Image-Edit-2511
- FLUX.1 Kontext dev model card: https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev
- FLUX.2 Klein model card: https://huggingface.co/black-forest-labs/FLUX.2-klein-4B
- Diffusers pinned FLUX.2 Klein pipeline source: https://raw.githubusercontent.com/huggingface/diffusers/6d71b76aceff935192e58fee38c5cc5d8d227cf0/src/diffusers/pipelines/flux2/pipeline_flux2_klein.py
- Diffusers pinned standard FLUX.2 pipeline source: https://raw.githubusercontent.com/huggingface/diffusers/6d71b76aceff935192e58fee38c5cc5d8d227cf0/src/diffusers/pipelines/flux2/pipeline_flux2.py
- Diffusers pinned FLUX.2 transformer source: https://raw.githubusercontent.com/huggingface/diffusers/6d71b76aceff935192e58fee38c5cc5d8d227cf0/src/diffusers/models/transformers/transformer_flux2.py
- Step1X-Edit repository: https://github.com/stepfun-ai/Step1X-Edit
- Pruna P-Image-Edit docs: https://docs.pruna.ai/en/stable/docs_pruna_endpoints/performance_models/p-image-edit.html

## SAM3 and Transformers documentation

- Hugging Face model page: https://huggingface.co/facebook/sam3
- Official SAM3 repository: https://github.com/facebookresearch/sam3
- Meta SAM3 blog and SAM3.1 update: https://ai.meta.com/blog/segment-anything-model-3/
- Transformers SAM3 documentation: https://github.com/huggingface/transformers/blob/main/docs/source/en/model_doc/sam3.md
- Roboflow SAM3 inference API documentation: https://inference.roboflow.com/foundation/sam3/

## Notes

- Runpod docs were queried through the Runpod documentation MCP server.
- The project context preserves qwen edit 2511 exactly as supplied until a verified source confirms the formal model name.
