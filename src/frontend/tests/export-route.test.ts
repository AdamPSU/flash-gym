import { describe, expect, it } from "vitest";

import { POST } from "../app/api/dataset/export/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/dataset/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("dataset export route", () => {
  it("exports segmentation results as COCO and JSONL", async () => {
    const response = await POST(
      makeRequest({
        jobId: "runpod-venue",
        segmentation: {
          job_id: "runpod-venue",
          status: "segmented",
          manifest_path: "/tmp/segmentation_manifest.json",
          masks_dir: "/tmp/masks",
          segmented_count: 1,
          instance_count: 1,
          images: [
            {
              frame_id: "kf_0001",
              edited_path: "/tmp/edited/kf_0001_hazard.png",
              width: 640,
              height: 360,
              instances: [
                {
                  instance_id: "kf_0001_mask_01",
                  mask_path: "/tmp/masks/kf_0001_mask_01.png",
                  bbox_xyxy: [10, 20, 110, 220],
                  score: 0.9,
                  area_pixels: 1200,
                },
              ],
            },
          ],
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.coco.images).toHaveLength(1);
    expect(body.coco.annotations).toEqual([
      expect.objectContaining({
        id: 1,
        image_id: 1,
        category_id: 1,
        bbox: [10, 20, 100, 200],
        area: 1200,
      }),
    ]);
    expect(body.jsonl).toContain('"frame_id":"kf_0001"');
    expect(body.files.coco).toBe("runpod-venue-coco.json");
    expect(body.files.jsonl).toBe("runpod-venue-labels.jsonl");
  });
});
