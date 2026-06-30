import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const IMAGE_ID_PATTERN = /^kf_\d{4}_(wet-floor|loose-cable|broken-glass)\.png$/;

export async function GET(request: Request) {
  const imageId = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");

  if (!IMAGE_ID_PATTERN.test(imageId)) {
    return NextResponse.json({ error: "imageId must match a demo hazard image" }, { status: 400 });
  }

  try {
    const image = await readFile(path.join(process.cwd(), "..", "..", "media", "hazards", imageId));
    return new Response(image, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "image/png",
      },
    });
  } catch {
    return NextResponse.json({ error: "demo hazard image not found" }, { status: 404 });
  }
}
