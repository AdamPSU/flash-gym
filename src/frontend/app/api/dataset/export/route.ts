import { NextResponse } from "next/server";

type ExportRequestBody = {
  jobId?: unknown;
  segmentation?: unknown;
};

type SegmentationInstance = {
  instance_id?: unknown;
  mask_path?: unknown;
  bbox_xyxy?: unknown;
  score?: unknown;
  area_pixels?: unknown;
};

type SegmentationImage = {
  frame_id?: unknown;
  edited_path?: unknown;
  width?: unknown;
  height?: unknown;
  timestamp_ms?: unknown;
  instances?: unknown;
};

const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export async function POST(request: Request) {
  const body = (await request.json()) as ExportRequestBody;
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  if (!JOB_ID_PATTERN.test(jobId)) {
    return NextResponse.json({ error: "jobId must be a safe file-system slug" }, { status: 400 });
  }

  const segmentation = normalizeSegmentation(body.segmentation);
  if (segmentation.images.length === 0) {
    return NextResponse.json({ error: "segmentation must contain at least one image" }, { status: 400 });
  }

  let annotationId = 1;
  const annotations = segmentation.images.flatMap((image, imageIndex) =>
    image.instances.map((instance) => {
      const [x1, y1, x2, y2] = instance.bbox_xyxy;
      const width = Math.max(0, x2 - x1);
      const height = Math.max(0, y2 - y1);
      return {
        id: annotationId++,
        image_id: imageIndex + 1,
        category_id: 1,
        bbox: [x1, y1, width, height],
        area: instance.area_pixels,
        segmentation: [],
        iscrowd: 0,
        attributes: {
          instance_id: instance.instance_id,
          mask_path: instance.mask_path,
          score: instance.score,
        },
      };
    }),
  );

  const coco = {
    info: {
      description: "Flash Gym hazard dataset",
      version: "1",
    },
    images: segmentation.images.map((image, index) => ({
      id: index + 1,
      file_name: image.edited_path,
      width: image.width,
      height: image.height,
      frame_id: image.frame_id,
      timestamp_ms: image.timestamp_ms,
    })),
    annotations,
    categories: [{ id: 1, name: "hazard", supercategory: "safety" }],
  };

  const jsonl = segmentation.images
    .flatMap((image) =>
      image.instances.map((instance) =>
        JSON.stringify({
          job_id: jobId,
          frame_id: image.frame_id,
          image_path: image.edited_path,
          mask_path: instance.mask_path,
          bbox_xyxy: instance.bbox_xyxy,
          score: instance.score,
          category: "hazard",
          risk: "trip_or_slip",
          affordance: "avoid_or_remediate",
        }),
      ),
    )
    .join("\n");

  return NextResponse.json({
    coco,
    jsonl,
    files: {
      coco: `${jobId}-coco.json`,
      jsonl: `${jobId}-labels.jsonl`,
    },
    files_download: [
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

function normalizeSegmentation(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return { images: [] as NormalizedImage[] };
  }
  const record = value as { images?: unknown };
  const images = Array.isArray(record.images) ? record.images : [];
  return { images: images.map(normalizeImage).filter((image): image is NormalizedImage => image !== null) };
}

function normalizeImage(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const image = value as SegmentationImage;
  const frameId = typeof image.frame_id === "string" ? image.frame_id : "";
  const editedPath = typeof image.edited_path === "string" ? image.edited_path : "";
  const width = typeof image.width === "number" ? image.width : 0;
  const height = typeof image.height === "number" ? image.height : 0;
  const instances = Array.isArray(image.instances) ? image.instances.map(normalizeInstance).filter(isNormalizedInstance) : [];
  if (!frameId || !editedPath || width < 1 || height < 1) {
    return null;
  }
  return {
    frame_id: frameId,
    edited_path: editedPath,
    width,
    height,
    timestamp_ms: typeof image.timestamp_ms === "number" ? image.timestamp_ms : null,
    instances,
  };
}

function normalizeInstance(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const instance = value as SegmentationInstance;
  const bbox = Array.isArray(instance.bbox_xyxy) ? instance.bbox_xyxy.map(Number).slice(0, 4) : [];
  if (bbox.length !== 4 || bbox.some((coordinate) => !Number.isFinite(coordinate))) {
    return null;
  }
  return {
    instance_id: typeof instance.instance_id === "string" ? instance.instance_id : "",
    mask_path: typeof instance.mask_path === "string" ? instance.mask_path : "",
    bbox_xyxy: bbox,
    score: typeof instance.score === "number" ? instance.score : 0,
    area_pixels: typeof instance.area_pixels === "number" ? instance.area_pixels : 0,
  };
}

type NormalizedImage = NonNullable<ReturnType<typeof normalizeImage>>;
type NormalizedInstance = NonNullable<ReturnType<typeof normalizeInstance>>;

function isNormalizedInstance(instance: NormalizedInstance | null): instance is NormalizedInstance {
  return instance !== null && Boolean(instance.instance_id && instance.mask_path);
}
