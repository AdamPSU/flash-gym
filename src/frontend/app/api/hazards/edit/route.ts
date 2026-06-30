import { NextResponse } from "next/server";

import { buildEditHazardsPayload, ReviewFrame } from "../../../../lib/pipeline";
import { JOB_ID_PATTERN, parseApprovedFrameIds, proxyRunpodStage } from "../../runpod";

type EditRequestBody = {
  jobId?: unknown;
  approvedFrameIds?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json()) as EditRequestBody;
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  if (!JOB_ID_PATTERN.test(jobId)) {
    return NextResponse.json({ error: "jobId must be a safe file-system slug" }, { status: 400 });
  }

  const approvedFrameIds = parseApprovedFrameIds(body.approvedFrameIds);
  if (approvedFrameIds.length === 0) {
    return NextResponse.json({ error: "approvedFrameIds must contain at least one safe frame ID" }, { status: 400 });
  }
  if (approvedFrameIds.length > 5) {
    return NextResponse.json({ error: "approvedFrameIds cannot contain more than 5 frames" }, { status: 400 });
  }

  const endpointUrl = process.env.RUNPOD_EDIT_HAZARDS_URL?.trim();
  const apiKey = process.env.RUNPOD_API_KEY?.trim();
  if (!endpointUrl || !apiKey) {
    const missing = [!endpointUrl && "RUNPOD_EDIT_HAZARDS_URL", !apiKey && "RUNPOD_API_KEY"].filter(Boolean);
    return NextResponse.json({ error: `Missing ${missing.join(" and ")}` }, { status: 500 });
  }

  const frames: ReviewFrame[] = approvedFrameIds.map((frameId) => ({
    frameId,
    path: `/runpod-volume/jobs/${jobId}/keyframes/${frameId}.jpg`,
    deleted: false,
  }));
  const payload = buildEditHazardsPayload(jobId, frames);

  return proxyRunpodStage(endpointUrl, apiKey, payload, "edit-hazards");
}
