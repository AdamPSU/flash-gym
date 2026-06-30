---
title: SAM3 demo segmentation API mock design
status: draft
created: 2026-06-30
updated: 2026-06-30
scope: demo-segmentation
---

# SAM3 demo segmentation API mock design

## Goal

Add a demo phase 3 segmentation action that reads static SAM3 outputs generated from hazard-edited images under `media/hazards/`.

The demo must not pass the known inserted hazard label from filenames, phase 2 prompts, or hardcoded per-frame mappings. It should behave as if the pipeline sees only the edited image and asks SAM3 to find the hazard.

## Prompt strategy

Use one broad text prompt for every approved edited image:

```text
object on the floor
```

This keeps the demo simple while loosening the prompt enough for SAM3 to return useful masks on the static hazard edits. It avoids predefined hazard classes and avoids a separate image understanding step.

## API boundary

Add a one-time generator script that calls Roboflow SAM3 and writes static demo artifacts under `media/segmentations/`.

The generator should:

- Require `ROBOFLOW_API_KEY`.
- Read approved demo hazard images from `media/hazards/`.
- Send image data as base64 to Roboflow SAM3 so local demo images do not need public URLs.
- Call `https://serverless.roboflow.com/sam3/concept_segment` with `format: "polygon"` and one prompt: `safety hazard`.
- Write SVG overlays and a segmentation manifest for the mock UI.

The browser should never receive or send the API key. The runtime mock should only read static generated artifacts.

## UI flow

After edited hazard images are approved, the segmentation stage becomes actionable.

Clicking `Approve edits` should start a 5 second mock wait, then switch the artifact review to static generated SAM3 segmentation overlays for the approved edited set.

The UI should show loading, success, and error states using the existing request-state style. The demo can show manifest metadata first; mask visualization can be a later enhancement unless the returned polygons are easy to render with minimal changes.

## Data handling

Demo hazard filenames can still map an approved edited image to a local file, because the local file has to be read. The route must not derive or send the hazard label from the filename.

Returned records should include the edited frame ID, edited image path, prompt used, instance count, scores, boxes, and polygons returned by the API.

## Error handling

If `ROBOFLOW_API_KEY` is missing, return a clear 500 response that names the missing variable.

If a requested demo image is invalid or missing, return 400 or 404 without calling the provider.

If Roboflow returns an error, return 502 with sanitized details. Do not log or return the API key.

## Validation

Add tests for the pure request/manifest helpers where possible.

Run the frontend test suite after implementation. If real Roboflow calls are not run during tests, mock `fetch` and verify the outgoing payload uses the broad `safety hazard` prompt and base64 image input.
