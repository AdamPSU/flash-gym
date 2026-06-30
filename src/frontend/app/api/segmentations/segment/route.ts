import { NextResponse } from "next/server";

import { buildInlineSegmentHazardsPayload, ReviewFrame } from "../../../../lib/pipeline";
import { FRAME_ID_PATTERN, JOB_ID_PATTERN, parseApprovedFrameIds, proxyRunpodStage } from "../../runpod";

type SegmentRequestBody = {
  jobId?: unknown;
  approvedFrameIds?: unknown;
  frames?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json()) as SegmentRequestBody;
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  if (!JOB_ID_PATTERN.test(jobId)) {
    return NextResponse.json({ error: "jobId must be a safe file-system slug" }, { status: 400 });
  }

  const frames = parseInlineFrames(body.frames);
  const approvedFrameIds = frames.length > 0 ? frames.map((frame) => frame.frameId) : parseApprovedFrameIds(body.approvedFrameIds);
  if (approvedFrameIds.length === 0) {
    return NextResponse.json({ error: "frames or approvedFrameIds must contain at least one safe frame ID" }, { status: 400 });
  }
  if (approvedFrameIds.length > 5) {
    return NextResponse.json({ error: "approvedFrameIds cannot contain more than 5 frames" }, { status: 400 });
  }

  const endpointUrl = process.env.RUNPOD_SEGMENT_HAZARDS_URL?.trim();
  const apiKey = process.env.RUNPOD_API_KEY?.trim();
  if (!endpointUrl || !apiKey) {
    const missing = [!endpointUrl && "RUNPOD_SEGMENT_HAZARDS_URL", !apiKey && "RUNPOD_API_KEY"].filter(Boolean);
    return NextResponse.json({ error: `Missing ${missing.join(" and ")}` }, { status: 500 });
  }

  const routeFrames: ReviewFrame[] = frames.length
    ? frames
    : approvedFrameIds.map((frameId) => ({
        frameId,
        path: `/runpod-volume/jobs/${jobId}/edited/${frameId}_hazard.png`,
        deleted: false,
        sourceFrameId: frameId,
      }));
  const payload = buildInlineSegmentHazardsPayload(jobId, routeFrames);

  return proxyRunpodStage(endpointUrl, apiKey, payload, "segment-hazards");
}

function parseInlineFrames(value: unknown): ReviewFrame[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): ReviewFrame[] => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const frameId = typeof record.frameId === "string" ? record.frameId : "";
    const previewUrl = typeof record.previewUrl === "string" ? record.previewUrl : "";
    if (!FRAME_ID_PATTERN.test(frameId) || !previewUrl || !previewUrl.startsWith("data:image/")) {
      return [];
    }
    return [
      {
        frameId,
        path: typeof record.path === "string" ? record.path : "",
        previewUrl,
        timestampMs: typeof record.timestampMs === "number" ? record.timestampMs : undefined,
        deleted: false,
        sourceFrameId: typeof record.sourceFrameId === "string" ? record.sourceFrameId : frameId,
      },
    ];
  });
}
