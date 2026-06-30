import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/keyframes/extract/route";

const originalEnv = process.env;

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/keyframes/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("extract keyframes route", () => {
  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("reports partial Runpod config instead of silently dry-running", async () => {
    process.env = { ...originalEnv, RUNPOD_API_KEY: "test-key", RUNPOD_EXTRACT_KEYFRAMES_URL: "" };

    const response = await POST(makeRequest({ jobId: "demo-job", maxKeyframes: 5 }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("RUNPOD_EXTRACT_KEYFRAMES_URL");
  });

  it("unwraps a completed Runpod runsync response for the page", async () => {
    process.env = {
      ...originalEnv,
      RUNPOD_API_KEY: "test-key",
      RUNPOD_EXTRACT_KEYFRAMES_URL: "https://api.runpod.ai/v2/abc123",
    };
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "sync-job",
        status: "COMPLETED",
        output: {
          job_id: "demo-job",
          status: "extracted",
          manifest_path: "/runpod-volume/jobs/demo-job/keyframes_manifest.json",
          keyframes_dir: "/runpod-volume/jobs/demo-job/keyframes",
          extracted_count: 2,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest({ jobId: "demo-job", maxKeyframes: 5 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.runpod.ai/v2/abc123/runsync",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          input: {
            input_data: {
              job_id: "demo-job",
              video_path: "/runpod-volume/jobs/demo-job/input/video.mov",
              max_keyframes: 5,
              prefer_gpu_decode: true,
            },
          },
        }),
      }),
    );
    expect(body).toEqual({
      job_id: "demo-job",
      status: "extracted",
      manifest_path: "/runpod-volume/jobs/demo-job/keyframes_manifest.json",
      keyframes_dir: "/runpod-volume/jobs/demo-job/keyframes",
      extracted_count: 2,
    });
  });

  it("propagates Runpod job failures as HTTP errors", async () => {
    process.env = {
      ...originalEnv,
      RUNPOD_API_KEY: "test-key",
      RUNPOD_EXTRACT_KEYFRAMES_URL: "https://api.runpod.ai/v2/abc123",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "sync-job",
          status: "FAILED",
          error: "video not found: /runpod-volume/jobs/demo-job/input/video.mov",
          output: { success: false },
        }),
      ),
    );

    const response = await POST(makeRequest({ jobId: "demo-job", maxKeyframes: 5 }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("video not found");
    expect(body.details.status).toBe("FAILED");
  });
});
