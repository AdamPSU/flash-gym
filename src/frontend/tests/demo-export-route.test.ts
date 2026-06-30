import { describe, expect, it } from "vitest";

import { POST } from "../app/api/demo-export/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/demo-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("demo export route", () => {
  it("exports approved segmentation frames as COCO JSON and JSONL files", async () => {
    const response = await POST(
      makeRequest({
        jobId: "runpod-venue",
        frames: [
          {
            frameId: "kf_0001",
            path: "/runpod-volume/jobs/runpod-venue/masks/kf_0001_sam3-object-on-the-floor.svg",
            previewUrl: "/api/demo-segmentations/kf_0001.svg",
            timestampMs: 5000,
            deleted: false,
            sourceFrameId: "kf_0001",
            prompt: "object on the floor",
          },
          {
            frameId: "kf_0002",
            path: "/runpod-volume/jobs/runpod-venue/masks/kf_0002_sam3-object-on-the-floor.svg",
            deleted: true,
            sourceFrameId: "kf_0002",
            prompt: "object on the floor",
          },
        ],
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.files).toHaveLength(2);
    expect(body.files[0].name).toBe("runpod-venue-coco.json");
    expect(body.files[0].contentType).toBe("application/json");
    expect(JSON.parse(body.files[0].content)).toEqual({
      info: {
        description: "Flash Gym demo hazard dataset",
        version: "demo",
      },
      images: [
        {
          id: 1,
          file_name: "kf_0001.png",
          width: 720,
          height: 1280,
          source_frame_id: "kf_0001",
          timestamp_ms: 5000,
        },
      ],
      annotations: [
        {
          id: 1,
          image_id: 1,
          category_id: 1,
          bbox: [180, 640, 360, 384],
          area: 138240,
          segmentation: [[180, 640, 540, 640, 540, 1024, 180, 1024]],
          iscrowd: 0,
          mask_path: "/runpod-volume/jobs/runpod-venue/masks/kf_0001_sam3-object-on-the-floor.svg",
          prompt: "object on the floor",
        },
      ],
      categories: [{ id: 1, name: "hazard", supercategory: "safety" }],
    });
    expect(body.files[1]).toEqual({
      name: "runpod-venue-labels.jsonl",
      contentType: "application/jsonl",
      content:
        '{"job_id":"runpod-venue","frame_id":"kf_0001","image":"/api/demo-segmentations/kf_0001.svg","mask":"/runpod-volume/jobs/runpod-venue/masks/kf_0001_sam3-object-on-the-floor.svg","category":"hazard","prompt":"object on the floor","bbox":[180,640,360,384],"risk":"trip_or_slip","affordance":"avoid_or_clean"}',
    });
  });
});
