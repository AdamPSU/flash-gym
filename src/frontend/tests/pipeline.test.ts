import { describe, expect, it } from "vitest";

import {
  buildExtractKeyframesPayload,
  buildDemoExtractResponse,
  buildDemoHazardFrames,
  buildDemoSegmentationFrames,
  buildEditHazardsPayload,
  buildDemoRunMetadata,
  buildLoadingButtonState,
  buildPipelineRun,
  buildRunTitle,
  buildSegmentHazardsPayload,
  buildVolumeVideoPath,
  countApprovedFrames,
  createSafeJobId,
  framesFromExtractResponse,
  framesFromEditResponse,
  framesFromSegmentationResponse,
  toggleFrameDeleted,
} from "../lib/pipeline";

describe("pipeline helpers", () => {
  it("creates a safe lowercase job id from a video file name", () => {
    expect(createSafeJobId("Venue Walkthrough 01.mov")).toBe("venue-walkthrough-01");
    expect(createSafeJobId("###.mov")).toBe("flash-gym-job");
  });

  it("builds the Runpod network-volume video path", () => {
    expect(buildVolumeVideoPath("runpod-venue")).toBe("/runpod-volume/jobs/runpod-venue/input/video.mov");
  });

  it("builds the extract-keyframes request payload from the endpoint contract", () => {
    expect(buildExtractKeyframesPayload("runpod-venue", 5, false)).toEqual({
      job_id: "runpod-venue",
      video_path: "/runpod-volume/jobs/runpod-venue/input/video.mov",
      max_keyframes: 5,
      prefer_gpu_decode: false,
    });
  });

  it("builds the edit-hazards request payload from approved review frames", () => {
    expect(
      buildEditHazardsPayload("runpod-venue", [
        { frameId: "kf_0001", path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0001.jpg", deleted: false },
        { frameId: "kf_0002", path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0002.jpg", deleted: true },
      ]),
    ).toEqual({
      job_id: "runpod-venue",
      keyframe_manifest_path: "/runpod-volume/jobs/runpod-venue/keyframes_manifest.json",
      approved_frame_ids: ["kf_0001"],
      prompt: "Add one realistic floor safety hazard to the scene while preserving camera angle, lighting, and venue layout.",
      max_images: 1,
      seed: 7,
      num_inference_steps: 4,
      guidance_scale: 1,
      max_dimension: 768,
    });
  });

  it("builds the segment-hazards request payload from approved hazard edits", () => {
    expect(
      buildSegmentHazardsPayload("runpod-venue", [
        {
          frameId: "kf_0001",
          path: "/runpod-volume/jobs/runpod-venue/edited/kf_0001_hazard.png",
          deleted: false,
          sourceFrameId: "kf_0001",
        },
      ]),
    ).toEqual({
      job_id: "runpod-venue",
      edit_manifest_path: "/runpod-volume/jobs/runpod-venue/edit_manifest.json",
      approved_frame_ids: ["kf_0001"],
      concept_prompt: "object on the floor",
      max_images: 1,
      batch_size: 2,
      score_threshold: 0.35,
      mask_threshold: 0.5,
    });
  });

  it("marks async button state as busy with clear loading copy", () => {
    expect(buildLoadingButtonState("idle", "Extract keyframes", "Extracting keyframes")).toEqual({
      busy: false,
      label: "Extract keyframes",
    });
    expect(buildLoadingButtonState("submitting", "Extract keyframes", "Extracting keyframes")).toEqual({
      busy: true,
      label: "Extracting keyframes...",
    });
  });

  it("uses upload prompt as the default visible run title before a file is selected", () => {
    expect(buildRunTitle("")).toBe("upload video");
    expect(buildRunTitle("runpod-venue.mov")).toBe("runpod-venue.mov");
  });

  it("builds demo run metadata for presentation mode", () => {
    expect(buildDemoRunMetadata()).toEqual({
      fileName: "runpod-venue.mov",
      jobId: "runpod-venue",
      maxKeyframes: 5,
      preferGpuDecode: true,
    });
  });

  it("builds a local demo extraction response from venue keyframes", () => {
    expect(buildDemoExtractResponse("runpod-venue", 5)).toEqual({
      job_id: "runpod-venue",
      status: "demo-extracted",
      manifest_path: "/runpod-volume/jobs/runpod-venue/keyframes_manifest.json",
      keyframes_dir: "/runpod-volume/jobs/runpod-venue/keyframes",
      extracted_count: 5,
      dry_run: true,
      request: {
        job_id: "runpod-venue",
        video_path: "/runpod-volume/jobs/runpod-venue/input/video.mov",
        max_keyframes: 5,
        prefer_gpu_decode: true,
      },
      frames: [
        {
          frame_id: "kf_0001",
          path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0001.png",
          preview_url: "/api/demo-keyframes/kf_0001.png",
          timestamp_ms: 5000,
        },
        {
          frame_id: "kf_0002",
          path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0002.png",
          preview_url: "/api/demo-keyframes/kf_0002.png",
          timestamp_ms: 10000,
        },
        {
          frame_id: "kf_0003",
          path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0003.png",
          preview_url: "/api/demo-keyframes/kf_0003.png",
          timestamp_ms: 15000,
        },
        {
          frame_id: "kf_0004",
          path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0004.png",
          preview_url: "/api/demo-keyframes/kf_0004.png",
          timestamp_ms: 20000,
        },
        {
          frame_id: "kf_0005",
          path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0005.png",
          preview_url: "/api/demo-keyframes/kf_0005.png",
          timestamp_ms: 25000,
        },
      ],
    });
  });

  it("builds local demo hazard edits from approved keyframes", () => {
    expect(
      buildDemoHazardFrames("runpod-venue", [
        { frameId: "kf_0001", path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0001.png", deleted: false },
        { frameId: "kf_0002", path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0002.png", deleted: true },
        { frameId: "kf_0003", path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0003.png", deleted: false },
      ]),
    ).toEqual([
      {
        frameId: "kf_0001",
        imageId: "kf_0001_wet-floor",
        path: "/runpod-volume/jobs/runpod-venue/edited/kf_0001_wet-floor.png",
        previewUrl: "/api/demo-hazards/kf_0001_wet-floor.png",
        timestampMs: 5000,
        deleted: false,
        sourceFrameId: "kf_0001",
      },
      {
        frameId: "kf_0003",
        imageId: "kf_0003_broken-glass",
        path: "/runpod-volume/jobs/runpod-venue/edited/kf_0003_broken-glass.png",
        previewUrl: "/api/demo-hazards/kf_0003_broken-glass.png",
        timestampMs: 15000,
        deleted: false,
        sourceFrameId: "kf_0003",
      },
    ]);
  });

  it("builds static demo SAM3 segmentation frames without hazard labels", () => {
    expect(
      buildDemoSegmentationFrames("runpod-venue", [
        {
          frameId: "kf_0001",
          imageId: "kf_0001_wet-floor",
          path: "/runpod-volume/jobs/runpod-venue/edited/kf_0001_wet-floor.png",
          previewUrl: "/api/demo-hazards/kf_0001_wet-floor.png",
          timestampMs: 5000,
          deleted: false,
          sourceFrameId: "kf_0001",
        },
        {
          frameId: "kf_0002",
          imageId: "kf_0002_loose-cable",
          path: "/runpod-volume/jobs/runpod-venue/edited/kf_0002_loose-cable.png",
          previewUrl: "/api/demo-hazards/kf_0002_loose-cable.png",
          timestampMs: 10000,
          deleted: true,
          sourceFrameId: "kf_0002",
        },
      ]),
    ).toEqual([
      {
        frameId: "kf_0001",
        path: "/runpod-volume/jobs/runpod-venue/masks/kf_0001_sam3-object-on-the-floor.svg",
        previewUrl: "/api/demo-segmentations/kf_0001.svg",
        timestampMs: 5000,
        deleted: false,
        sourceFrameId: "kf_0001",
        prompt: "object on the floor",
      },
    ]);
  });

  it("models the current real stage order", () => {
    expect(buildPipelineRun("runpod-venue")).toEqual([
      {
        id: "extract-keyframes",
        label: "extract-keyframes",
        detail: "FFmpeg/NVDEC keyframes from /runpod-volume/jobs/runpod-venue/input/video.mov",
        state: "waiting",
      },
      {
        id: "hazard-editing",
        label: "image editing",
        detail: "Runpod Flash hazard edits from approved keyframes.",
        state: "waiting",
      },
      {
        id: "segmentation",
        label: "image segmentation",
        detail: "Runpod Flash SAM3 masks with a broad object-on-the-floor prompt.",
        state: "waiting",
      },
    ]);
  });

  it("toggles frame deletion without mutating the original frame list", () => {
    const frames = [
      { frameId: "kf_0001", path: "/runpod-volume/jobs/demo/keyframes/kf_0001.jpg", deleted: false },
      { frameId: "kf_0002", path: "/runpod-volume/jobs/demo/keyframes/kf_0002.jpg", deleted: false },
    ];

    const nextFrames = toggleFrameDeleted(frames, "kf_0002");

    expect(nextFrames).toEqual([
      { frameId: "kf_0001", path: "/runpod-volume/jobs/demo/keyframes/kf_0001.jpg", deleted: false },
      { frameId: "kf_0002", path: "/runpod-volume/jobs/demo/keyframes/kf_0002.jpg", deleted: true },
    ]);
    expect(frames[1].deleted).toBe(false);
    expect(countApprovedFrames(nextFrames)).toBe(1);
  });

  it("builds review frames from an extraction response", () => {
    expect(
      framesFromExtractResponse({
        job_id: "demo",
        status: "extracted",
        manifest_path: "/runpod-volume/jobs/demo/keyframes_manifest.json",
        keyframes_dir: "/runpod-volume/jobs/demo/keyframes",
        extracted_count: 2,
        frames: [
          {
            frame_id: "kf_0001",
            path: "/runpod-volume/jobs/demo/keyframes/kf_0001.jpg",
            preview_url: "data:image/jpeg;base64,abc",
            timestamp_ms: 1000,
          },
          { frame_id: "kf_0002", path: "/runpod-volume/jobs/demo/keyframes/kf_0002.jpg" },
        ],
      }),
    ).toEqual([
      {
        frameId: "kf_0001",
        path: "/runpod-volume/jobs/demo/keyframes/kf_0001.jpg",
        previewUrl: "data:image/jpeg;base64,abc",
        timestampMs: 1000,
        deleted: false,
      },
      { frameId: "kf_0002", path: "/runpod-volume/jobs/demo/keyframes/kf_0002.jpg", deleted: false },
    ]);
  });

  it("builds hazard review frames from a real edit response", () => {
    expect(
      framesFromEditResponse({
        job_id: "demo",
        status: "edited",
        manifest_path: "/runpod-volume/jobs/demo/edit_manifest.json",
        edited_dir: "/runpod-volume/jobs/demo/edited",
        edited_count: 1,
        images: [
          {
            frame_id: "kf_0001",
            source_path: "/runpod-volume/jobs/demo/keyframes/kf_0001.jpg",
            edited_path: "/runpod-volume/jobs/demo/edited/kf_0001_hazard.png",
            preview_url: "data:image/png;base64,abc",
            timestamp_ms: 5000,
          },
        ],
      }),
    ).toEqual([
      {
        frameId: "kf_0001",
        path: "/runpod-volume/jobs/demo/edited/kf_0001_hazard.png",
        previewUrl: "data:image/png;base64,abc",
        timestampMs: 5000,
        deleted: false,
        sourceFrameId: "kf_0001",
      },
    ]);
  });

  it("builds segmentation review frames from a real SAM3 response", () => {
    expect(
      framesFromSegmentationResponse({
        job_id: "demo",
        status: "segmented",
        manifest_path: "/runpod-volume/jobs/demo/segmentation_manifest.json",
        masks_dir: "/runpod-volume/jobs/demo/masks",
        segmented_count: 1,
        instance_count: 1,
        images: [
          {
            frame_id: "kf_0001",
            edited_path: "/runpod-volume/jobs/demo/edited/kf_0001_hazard.png",
            preview_url: "data:image/png;base64,mask",
            timestamp_ms: 5000,
            instances: [
              {
                instance_id: "kf_0001_mask_01",
                mask_path: "/runpod-volume/jobs/demo/masks/kf_0001_mask_01.png",
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        frameId: "kf_0001",
        path: "/runpod-volume/jobs/demo/masks/kf_0001_mask_01.png",
        previewUrl: "data:image/png;base64,mask",
        timestampMs: 5000,
        deleted: false,
        sourceFrameId: "kf_0001",
        prompt: "object on the floor",
      },
    ]);
  });
});
