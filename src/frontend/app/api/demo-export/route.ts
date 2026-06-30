import { NextResponse } from "next/server";

type ExportFrame = {
  frameId?: unknown;
  path?: unknown;
  previewUrl?: unknown;
  timestampMs?: unknown;
  deleted?: unknown;
  sourceFrameId?: unknown;
  prompt?: unknown;
};

type ExportRequestBody = {
  jobId?: unknown;
  frames?: unknown;
};

const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const IMAGE_WIDTH = 720;
const IMAGE_HEIGHT = 1280;
const BBOX = [180, 640, 360, 384];
const SEGMENTATION = [[180, 640, 540, 640, 540, 1024, 180, 1024]];

export async function POST(request: Request) {
  const body = (await request.json()) as ExportRequestBody;
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";

  if (!JOB_ID_PATTERN.test(jobId)) {
    return NextResponse.json({ error: "jobId must be a safe file-system slug" }, { status: 400 });
  }

  if (!Array.isArray(body.frames)) {
    return NextResponse.json({ error: "frames must be an array" }, { status: 400 });
  }

  const frames = body.frames.map(normalizeFrame).filter(isApprovedFrame);
  if (frames.length === 0) {
    return NextResponse.json({ error: "at least one approved frame is required" }, { status: 400 });
  }

  const coco = {
    info: {
      description: "Flash Gym demo hazard dataset",
      version: "demo",
    },
    images: frames.map((frame, index) => ({
      id: index + 1,
      file_name: `${frame.sourceFrameId}.png`,
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      source_frame_id: frame.sourceFrameId,
      timestamp_ms: frame.timestampMs,
    })),
    annotations: frames.map((frame, index) => ({
      id: index + 1,
      image_id: index + 1,
      category_id: 1,
      bbox: BBOX,
      area: BBOX[2] * BBOX[3],
      segmentation: SEGMENTATION,
      iscrowd: 0,
      mask_path: frame.path,
      prompt: frame.prompt,
    })),
    categories: [{ id: 1, name: "hazard", supercategory: "safety" }],
  };

  const jsonl = frames
    .map((frame) =>
      JSON.stringify({
        job_id: jobId,
        frame_id: frame.sourceFrameId,
        image: frame.previewUrl,
        mask: frame.path,
        category: "hazard",
        prompt: frame.prompt,
        bbox: BBOX,
        risk: "trip_or_slip",
        affordance: "avoid_or_clean",
      }),
    )
    .join("\n");

  return NextResponse.json({
    files: [
      {
        name: `${jobId}-coco.json`,
        contentType: "application/json",
        content: JSON.stringify(coco, null, 2),
      },
      {
        name: `${jobId}-labels.jsonl`,
        contentType: "application/jsonl",
        content: jsonl,
      },
    ],
  });
}

function normalizeFrame(frame: ExportFrame) {
  const sourceFrameId = typeof frame.sourceFrameId === "string" ? frame.sourceFrameId : typeof frame.frameId === "string" ? frame.frameId : "";
  const path = typeof frame.path === "string" ? frame.path : "";
  const prompt = typeof frame.prompt === "string" ? frame.prompt : "object on the floor";

  if (!sourceFrameId || !path) {
    return null;
  }

  return {
    deleted: frame.deleted === true,
    path,
    previewUrl: typeof frame.previewUrl === "string" ? frame.previewUrl : "",
    prompt,
    sourceFrameId,
    timestampMs: typeof frame.timestampMs === "number" ? frame.timestampMs : null,
  };
}

type NormalizedFrame = NonNullable<ReturnType<typeof normalizeFrame>>;

function isApprovedFrame(frame: NormalizedFrame | null): frame is NormalizedFrame {
  return frame !== null && !frame.deleted;
}
