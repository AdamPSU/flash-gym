import { describe, expect, it } from "vitest";

import { GET } from "../app/api/demo-segmentations/[imageId]/route";

describe("demo segmentations route", () => {
  it("rejects unsafe segmentation image names", async () => {
    const response = await GET(new Request("http://localhost/api/demo-segmentations/../secret.svg"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("imageId");
  });

  it("returns 404 when a generated segmentation image is missing", async () => {
    const response = await GET(new Request("http://localhost/api/demo-segmentations/kf_9999.svg"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("not found");
  });
});
