import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const IMAGE_ID_PATTERN = /^kf_\d{4}\.svg$/;

export async function GET(request: Request) {
  const imageId = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");

  if (!IMAGE_ID_PATTERN.test(imageId)) {
    return NextResponse.json({ error: "imageId must match kf_0001.svg" }, { status: 400 });
  }

  try {
    const image = await readFile(path.join(process.cwd(), "..", "..", "media", "segmentations", imageId));
    return new Response(image, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "image/svg+xml",
      },
    });
  } catch {
    return NextResponse.json({ error: "demo segmentation image not found" }, { status: 404 });
  }
}
