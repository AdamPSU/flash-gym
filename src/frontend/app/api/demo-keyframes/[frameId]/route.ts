import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const FRAME_ID_PATTERN = /^kf_\d{4}\.png$/;

export async function GET(request: Request) {
  const frameId = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");

  if (!FRAME_ID_PATTERN.test(frameId)) {
    return NextResponse.json({ error: "frameId must match kf_0001.png" }, { status: 400 });
  }

  try {
    const image = await readFile(path.join(process.cwd(), "..", "..", "media", frameId));
    return new Response(image, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "image/png",
      },
    });
  } catch {
    return NextResponse.json({ error: "demo keyframe not found" }, { status: 404 });
  }
}
