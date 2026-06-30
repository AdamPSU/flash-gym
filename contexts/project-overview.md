---
title: Project overview
status: active
created: 2026-06-30
updated: 2026-06-30
source_type: synthesis
---

# Project overview

This file is the main project memory. It merges the event notes, project brief, serverless constraints, pipeline strategy, and open questions.

## Event context

The in person event is Tuesday, June 30, 2026 at the Web Data Loft by Bright Data. The remote hackathon will begin in 2 to 3 weeks. Updates are expected from the organizers.

The project must use Runpod Flash. Regular Runpod flows are out of scope unless the team changes that constraint.

Runpod Flash was described by the team as a Python SDK that turns a function into a live autoscaling serverless endpoint. Builders specify GPU choice and dependencies in Python. They do not write a Dockerfile or manage a container image for normal Flash work.

The event focuses on real workflows with Flash. It includes a technical walkthrough, guided build sprint, mentorship, checkpoints, demos, and prizes.

Event topics:

- Python first serverless endpoints for GPU and CPU workloads.
- Queue based jobs and low latency API patterns.
- Scaling, reliability, observability, and cost awareness.
- Shipping working projects.

Prize notes:

- First place: 4000 dollars cash plus 4000 dollars credits.
- Second place: 2000 dollars cash plus 2000 dollars credits.
- Third place: 1000 dollars cash plus 1000 dollars credits.
- Bonus prizes may exist for miscellaneous categories.

Food and schedule notes from Adam Chan:

- In person kickoff is expected at 10 AM.
- Coffee is provided.
- Full breakfast is not provided.
- Lunch is provided.
- Dinner is provided.

## Product seed

The current idea is a dataset generation workflow for hazard recognition or safety training. Treat this as a seed, not final architecture.

Seed workflow:

- Accept a user submitted video of a venue.
- Extract review frames with FFmpeg/NVDEC, capped to 5 frames for the demo and spaced 5 seconds apart.
- Let the user review extracted keyframes one image at a time, move forward and backward, and delete or restore frames before later stages.
- Edit realistic hazards into selected keyframes using qwen edit 2511.
- Let the user review edited images one image at a time, move forward and backward, and delete or restore generated images before labeling.
- Segment the hazard with SAM-3.
- Label affordance and risk with a local LLM, probably Gemma.
- Export a supervised training dataset in COCO and JSONL formats.

Current stage order:

- `extract-keyframes`
- Hazard editing stage, exact endpoint name and runtime still undecided.
- Hazard segmentation stage uses the backend `segment-hazards` Flash endpoint with Hugging Face `facebook/sam3`; real model validation is still pending a Flash worker with Hugging Face authentication.
- Dataset export stage, exact endpoint name and runtime still undecided.

## Frontend boundary

The frontend is a Next.js app under `src/frontend/`. It is not the source of truth for backend phase logic; backend contracts and Flash endpoints remain authoritative.

Current frontend notes:

- The page lets the user select a video file, derives a safe job ID, and shows the expected Runpod volume path.
- The page submits a phase 1 request through `POST /api/keyframes/extract`.
- The route returns a dry run response unless `RUNPOD_EXTRACT_KEYFRAMES_URL` and `RUNPOD_API_KEY` are set.
- The review console lets the user move through keyframe candidates, delete or restore frames, and inspect manifest metadata.
- The frontend uses `src/backend/flash_gym/endpoints/extract_keyframes.py` as the phase 1 endpoint contract source.
- Qwen edit has a contract in `src/backend/flash_gym/hazard_edit_contract.py`, but should not be an active frontend action until a Flash endpoint is wired.
- SAM3 now has a backend contract and Flash endpoint. Frontend workflow wiring should still wait for the active frontend work to integrate the backend contract.
- The visual direction adapts the saved fal.ai Copycat profile without copying fal.ai identity assets, mascots, source copy, logos, or generated images.
- The keyframe manifest preview should not show a candidate badge. The active frame should fill the left preview panel, and frame navigation should use compact image thumbnails instead of visible frame names while preserving the no-scroll page layout.
- The visible frontend pipeline should show three documented steps: extract keyframes, image editing, and image segmentation. Upload video is explained by the source video panel and should not appear as a stage row.
- Keyframe review actions should live inside the manifest frame: previous and next arrows over the preview, plus an X button in the top right to remove or restore the active frame. Do not show an isolated review buffer box in the left pane.
- Buttons that start a wait should show clear loading feedback. The pipeline run header should not show the `local setup` status pill.
- Demo mode uses the real venue keyframes under `media/`. In demo mode, clicking `Extract keyframes` should populate the keyframe manifest from those local images instead of calling the Runpod proxy.

## Serverless constraints

This project must run serverlessly through Runpod Flash. The design should respect Flash worker lifecycle, deployment packaging, storage, and cost behavior.

Hard constraints:

- Use Runpod Flash, not regular Runpod workflows.
- Avoid a design that loads huge models from scratch for every request.
- Keep cloud resource behavior explicit because hackathon demos can fail from slow cold starts or unexpected scaling.
- Keep deployment artifacts under the Flash limit.
- Do not assume generated datasets fit in request payloads.
- Do not assume one endpoint can or should run every model stage.
- Do not assume all stages need GPU acceleration.
- Do not submit one Flash job per image when a stage level batch can process the approved set.

Known risk:

The pipeline may involve large models across image editing, segmentation, and local language labeling. The team does not want to load those huge models from scratch on every request. Possible workarounds exist in Flash, but model runtimes, input sizes, latency target, and demo flow still need verification.

## Pipeline strategy

Use one Flash request per stage per approved set, not one request per image.

For a demo capped at 5 review frames, the target shape is:

- One GPU Flash job extracts review frames from the uploaded video with FFmpeg/NVDEC.
- One Qwen image edit Flash job processes all approved keyframes as a batch.
- One SAM-3 Flash job processes all approved edited images as a batch.
- One export job writes COCO and JSONL outputs after the reviewed labels are accepted.

The practical goal is one cold start per stage when needed, not one cold start per image.

Stage boundaries:

- `extract-keyframes`: GPU endpoint for FFmpeg/NVDEC video keyframe extraction and manifest writing.
- Hazard editing: likely GPU stage with the image editing model loaded once per worker.
- Hazard segmentation: GPU stage with Hugging Face `facebook/sam3` loaded once per worker.
- Dataset export: CPU or GPU stage depending on whether local LLM labeling is part of export.

Do not assume Qwen edit, SAM-3, and Gemma should live in one worker until VRAM, dependency, and latency constraints are verified.

Default heavy model endpoint settings should preserve scale to zero:

```python
workers=(0, 1)
idle_timeout=1200
```

This keeps idle cost low while preserving a warm window during an active user session. If throughput is too slow, use `workers=(0, 2)` and split the approved image list across two batches. That can create two worker cold starts, but each worker still processes many images.

Avoid `workers=(1, n)` as the default. Keeping workers active all the time may be useful during demos, but it is a cost and latency tradeoff, not the baseline design.

## Warmup strategy

Use session scoped warmup jobs to hide the next stage cold start during human review time.

- After keyframes are extracted and the user begins reviewing them, trigger a hazard editing warmup job in the background.
- After edited images are generated and the user begins reviewing them, trigger a hazard segmentation warmup job in the background.
- Warmup jobs should load model weights into the worker process and return a small readiness result.
- Real stage jobs should run within the `idle_timeout` window when possible.

This preserves scale to zero for inactive periods while avoiding cold starts at every approved image.

## Storage strategy

Use Runpod side storage, not laptop local storage.

Model weights and job artifacts should live on a Flash network volume mounted at `/runpod-volume/`, or in another remote storage system that Flash workers can access. A remote Runpod GPU cannot directly use model weights stored only on the user's laptop.

Suggested network volume layout:

```text
/runpod-volume/models/qwen-edit/
/runpod-volume/models/sam3/
/runpod-volume/models/gemma/
/runpod-volume/jobs/{job_id}/keyframes/
/runpod-volume/jobs/{job_id}/edited/
/runpod-volume/jobs/{job_id}/masks/
/runpod-volume/jobs/{job_id}/dataset/
```

Request payloads should pass job IDs, paths, and manifests. They should not pass full videos, full image batches, model weights, or full exported datasets when a storage reference can be used.

Each heavy endpoint should lazy load its model once per worker process and reuse it for the whole batch.

```python
global model

if "model" not in globals():
    model = load_model("/runpod-volume/models/model-name")

for image_path in approved_image_paths:
    process_one_image(model, image_path)
```

The model may still load once for each new worker. The network volume avoids repeated downloads, but each worker has its own RAM and VRAM.

Avoid these patterns:

- Do not call Flash once per image.
- Do not load a model inside the per image loop.
- Do not put large model weights in the Flash deployment artifact.
- Do not send full image or video payloads through endpoint requests when path references will work.
- Do not keep all workers warm by default unless the team chooses that cost tradeoff for demo reliability.

## Open questions

Model and runtime questions:

- What exact model is meant by qwen edit 2511?
- Is qwen edit 2511 available through a public endpoint, local weights, an API, or another distribution path?
- What are the GPU memory requirements for qwen edit 2511?
- What exact SAM-3 package, checkpoint, and license should be used?
- Can SAM-3 run in the same worker as the image editing stage, or should it be separate?
- Which Gemma model size should be used for affordance and risk labeling?
- Does the local LLM need structured output guarantees?

Data questions:

- What video formats and size limits should the workflow accept?
- Should users upload a local file, provide a URL, or select from object storage?
- What makes a hazard realistic enough for the generated training data?
- What label taxonomy should COCO categories use?
- What fields should the JSONL output include?
- Should masks, bounding boxes, edited images, original frames, and metadata all be retained?

Flash deployment questions:

- Which stages need GPU workers and which can run on CPU workers?
- What latency is acceptable for the demo?
- What worker minimum should be kept warm during demo time?
- What maximum worker count protects cost while keeping the demo reliable?
- How large should each stage level batch be after the 5 frame demo path works reliably?
- Should model weights live on a Flash network volume, in a build artifact, or behind an external model API?
- Should later phases stay in `US-CA-2` with the phase 1 network volume, or should another datacenter be chosen for model availability?
- Does the project need multi datacenter deployment?

Product questions:

- Who is the demo user?
- Is the main demo a web app, CLI, API, notebook, or recorded workflow?
- Should the system show intermediate artifacts or only export the dataset?
- How will failures be surfaced during a long running generation job?
- What is the minimum useful output for a hackathon demo if a full model chain is too slow?
