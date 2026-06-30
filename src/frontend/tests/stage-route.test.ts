import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as editPOST } from "../app/api/hazards/edit/route";
import { POST as segmentPOST } from "../app/api/segmentations/segment/route";

const originalEnv = process.env;

function makeRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("real stage Runpod proxy routes", () => {
  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("calls edit-hazards with approved frames and unwraps completed output", async () => {
    process.env = {
      ...originalEnv,
      RUNPOD_API_KEY: "test-key",
      RUNPOD_EDIT_HAZARDS_URL: "https://api.runpod.ai/v2/edit123",
    };
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "edit-job",
        status: "COMPLETED",
        output: {
          job_id: "runpod-venue",
          status: "edited",
          manifest_path: "/runpod-volume/jobs/runpod-venue/edit_manifest.json",
          edited_dir: "/runpod-volume/jobs/runpod-venue/edited",
          edited_count: 1,
          images: [],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await editPOST(
      makeRequest("http://localhost/api/hazards/edit", {
        jobId: "runpod-venue",
        approvedFrameIds: ["kf_0001"],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.runpod.ai/v2/edit123/runsync");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).input.input_data).toMatchObject({
      job_id: "runpod-venue",
      keyframe_manifest_path: "/runpod-volume/jobs/runpod-venue/keyframes_manifest.json",
      approved_frame_ids: ["kf_0001"],
      max_images: 1,
    });
    expect(body.status).toBe("edited");
  });

  it("calls segment-hazards with approved edits and unwraps completed output", async () => {
    process.env = {
      ...originalEnv,
      RUNPOD_API_KEY: "test-key",
      RUNPOD_SEGMENT_HAZARDS_URL: "https://api.runpod.ai/v2/segment123",
    };
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "segment-job",
        status: "COMPLETED",
        output: {
          job_id: "runpod-venue",
          status: "segmented",
          manifest_path: "/runpod-volume/jobs/runpod-venue/segmentation_manifest.json",
          masks_dir: "/runpod-volume/jobs/runpod-venue/masks",
          segmented_count: 1,
          instance_count: 1,
          images: [],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await segmentPOST(
      makeRequest("http://localhost/api/segmentations/segment", {
        jobId: "runpod-venue",
        frames: [
          {
            frameId: "kf_0001",
            previewUrl: "data:image/png;base64,abc",
            timestampMs: 5000,
          },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.runpod.ai/v2/segment123/runsync");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).input.input_data).toMatchObject({
      job_id: "runpod-venue",
      mode: "inline",
      frame_ids: ["kf_0001"],
      image_data_urls: ["data:image/png;base64,abc"],
      timestamps_ms: [5000],
      concept_prompt: "object on the floor",
      max_images: 1,
    });
    expect(body.status).toBe("segmented");
  });

  it("propagates Runpod stage failures", async () => {
    process.env = {
      ...originalEnv,
      RUNPOD_API_KEY: "test-key",
      RUNPOD_EDIT_HAZARDS_URL: "https://api.runpod.ai/v2/edit123",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "FAILED", error: "model load failed", output: { success: false } })),
    );

    const response = await editPOST(
      makeRequest("http://localhost/api/hazards/edit", {
        jobId: "runpod-venue",
        approvedFrameIds: ["kf_0001"],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("model load failed");
  });
});
