import { describe, expect, it } from "vitest";

import {
  buildExtractKeyframesPayload,
  buildDemoRunMetadata,
  buildLoadingButtonState,
  buildPipelineRun,
  buildRunTitle,
  buildVolumeVideoPath,
  countApprovedFrames,
  createSafeJobId,
  framesFromExtractResponse,
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
    expect(buildExtractKeyframesPayload("runpod-venue", 24, false)).toEqual({
      job_id: "runpod-venue",
      video_path: "/runpod-volume/jobs/runpod-venue/input/video.mov",
      max_keyframes: 24,
      prefer_gpu_decode: false,
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

  it("models the current stage order without making future stages actionable", () => {
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
        detail: "Qwen edit contract exists; Flash endpoint is not wired yet.",
        state: "contract",
      },
      {
        id: "segmentation",
        label: "image segmentation",
        detail: "SAM-3 contract exists; segment-hazards Flash endpoint is not wired here yet.",
        state: "locked",
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
});
