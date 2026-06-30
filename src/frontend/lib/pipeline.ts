export type PipelineState = "ready" | "running" | "done" | "waiting" | "contract" | "locked" | "error";

export type RequestState = "idle" | "submitting" | "error";

export type PipelineStage = {
  id: string;
  label: string;
  detail: string;
  state: PipelineState;
};

export type ReviewFrame = {
  frameId: string;
  imageId?: string;
  path: string;
  previewUrl?: string;
  timestampMs?: number;
  deleted: boolean;
  sourceFrameId?: string;
  prompt?: string;
};

export type ExtractKeyframesPayload = {
  job_id: string;
  video_path: string;
  max_keyframes: number;
  prefer_gpu_decode: boolean;
};

export type EditHazardsPayload = {
  job_id: string;
  keyframe_manifest_path: string;
  approved_frame_ids: string[];
  prompt: string;
  max_images: number;
  seed: number;
  num_inference_steps: number;
  guidance_scale: number;
  max_dimension: number;
};

export type SegmentHazardsPayload = {
  job_id: string;
  edit_manifest_path: string;
  approved_frame_ids: string[];
  concept_prompt: string;
  max_images: number;
  batch_size: number;
  score_threshold: number;
  mask_threshold: number;
};

export type InlineSegmentHazardsPayload = {
  mode: "inline";
  job_id: string;
  frame_ids: string[];
  image_data_urls: string[];
  timestamps_ms: number[];
  concept_prompt: string;
  max_images: number;
  batch_size: number;
  score_threshold: number;
  mask_threshold: number;
};

export type ExtractedKeyframe = {
  frame_id: string;
  path: string;
  preview_url?: string;
  timestamp_ms?: number;
};

export type ExtractKeyframesResponse = {
  job_id: string;
  status: string;
  manifest_path: string;
  keyframes_dir: string;
  decode_mode?: string;
  extracted_count: number;
  frames?: ExtractedKeyframe[];
  dry_run?: boolean;
  request?: ExtractKeyframesPayload;
  error?: string;
  details?: unknown;
};

export type EditedHazardImage = {
  frame_id: string;
  source_path?: string;
  edited_path: string;
  preview_url?: string;
  timestamp_ms?: number;
};

export type EditHazardsResponse = {
  job_id: string;
  status: string;
  manifest_path: string;
  edited_dir: string;
  edited_count: number;
  images?: EditedHazardImage[];
  error?: string;
  details?: unknown;
};

export type SegmentationInstance = {
  instance_id: string;
  mask_path: string;
};

export type SegmentationImage = {
  frame_id: string;
  edited_path: string;
  preview_url?: string;
  timestamp_ms?: number;
  width?: number;
  height?: number;
  instances?: SegmentationInstance[];
};

export type SegmentHazardsResponse = {
  job_id: string;
  status: string;
  manifest_path: string;
  masks_dir: string;
  segmented_count: number;
  instance_count: number;
  images?: SegmentationImage[];
  error?: string;
  details?: unknown;
};

export type LoadingButtonState = {
  busy: boolean;
  label: string;
};

export type DemoRunMetadata = {
  fileName: string;
  jobId: string;
  maxKeyframes: number;
  preferGpuDecode: boolean;
};

const DEMO_FRAME_IDS = ["kf_0001", "kf_0002", "kf_0003", "kf_0004", "kf_0005"];
export const SAM3_DEMO_CONCEPT_PROMPT = "object on the floor";
export const HAZARD_EDIT_PROMPT =
  "Add one realistic floor safety hazard to the scene while preserving camera angle, lighting, and venue layout.";
const DEMO_HAZARDS: Record<string, string> = {
  kf_0001: "wet floor",
  kf_0002: "loose cable",
  kf_0003: "broken glass",
  kf_0004: "wet floor",
  kf_0005: "loose cable",
};

export function createSafeJobId(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const slug = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);

  return slug || "flash-gym-job";
}

export function buildRunTitle(fileName: string): string {
  return fileName.trim() || "upload video";
}

export function buildDemoRunMetadata(): DemoRunMetadata {
  return {
    fileName: "runpod-venue.mov",
    jobId: "runpod-venue",
    maxKeyframes: 5,
    preferGpuDecode: true,
  };
}

export function buildDemoExtractResponse(jobId: string, maxKeyframes: number): ExtractKeyframesResponse {
  const keyframesDir = buildKeyframesDir(jobId);
  const frames = DEMO_FRAME_IDS.slice(0, maxKeyframes).map((frameId, index) => ({
    frame_id: frameId,
    path: `${keyframesDir}/${frameId}.png`,
    preview_url: `/api/demo-keyframes/${frameId}.png`,
    timestamp_ms: (index + 1) * 5000,
  }));

  return {
    job_id: jobId,
    status: "demo-extracted",
    manifest_path: buildManifestPath(jobId),
    keyframes_dir: keyframesDir,
    extracted_count: frames.length,
    dry_run: true,
    request: buildExtractKeyframesPayload(jobId, maxKeyframes, true),
    frames,
  };
}

export function buildDemoHazardFrames(jobId: string, frames: ReviewFrame[]): ReviewFrame[] {
  return frames
    .filter((frame) => !frame.deleted)
    .map((frame) => {
      const hazard = DEMO_HAZARDS[frame.frameId] ?? "wet floor";
      const hazardSlug = hazard.replace(/\s+/g, "-");
      const imageId = `${frame.frameId}_${hazardSlug}`;

      return {
        frameId: frame.frameId,
        imageId,
        path: `/runpod-volume/jobs/${jobId}/edited/${imageId}.png`,
        previewUrl: `/api/demo-hazards/${imageId}.png`,
        timestampMs: frame.timestampMs ?? demoTimestampMs(frame.frameId),
        deleted: false,
        sourceFrameId: frame.frameId,
      };
    });
}

export function buildDemoSegmentationFrames(jobId: string, frames: ReviewFrame[]): ReviewFrame[] {
  return frames
    .filter((frame) => !frame.deleted)
    .map((frame) => {
      const sourceFrameId = frame.sourceFrameId ?? frame.frameId;
      return {
        frameId: sourceFrameId,
        path: `/runpod-volume/jobs/${jobId}/masks/${sourceFrameId}_sam3-object-on-the-floor.svg`,
        previewUrl: `/api/demo-segmentations/${sourceFrameId}.svg`,
        timestampMs: frame.timestampMs,
        deleted: false,
        sourceFrameId,
        prompt: SAM3_DEMO_CONCEPT_PROMPT,
      };
    });
}

function demoTimestampMs(frameId: string): number | undefined {
  const index = DEMO_FRAME_IDS.indexOf(frameId);
  return index === -1 ? undefined : (index + 1) * 5000;
}

export function buildVolumeVideoPath(jobId: string): string {
  return `/runpod-volume/jobs/${jobId}/input/video.mov`;
}

export function buildKeyframesDir(jobId: string): string {
  return `/runpod-volume/jobs/${jobId}/keyframes`;
}

export function buildManifestPath(jobId: string): string {
  return `/runpod-volume/jobs/${jobId}/keyframes_manifest.json`;
}

export function buildExtractKeyframesPayload(
  jobId: string,
  maxKeyframes: number,
  preferGpuDecode: boolean,
): ExtractKeyframesPayload {
  return {
    job_id: jobId,
    video_path: buildVolumeVideoPath(jobId),
    max_keyframes: maxKeyframes,
    prefer_gpu_decode: preferGpuDecode,
  };
}

export function buildEditHazardsPayload(jobId: string, frames: ReviewFrame[]): EditHazardsPayload {
  const approvedFrameIds = frames.filter((frame) => !frame.deleted).map((frame) => frame.frameId);
  return {
    job_id: jobId,
    keyframe_manifest_path: buildManifestPath(jobId),
    approved_frame_ids: approvedFrameIds,
    prompt: HAZARD_EDIT_PROMPT,
    max_images: approvedFrameIds.length,
    seed: 7,
    num_inference_steps: 4,
    guidance_scale: 1,
    max_dimension: 768,
  };
}

export function buildSegmentHazardsPayload(jobId: string, frames: ReviewFrame[]): SegmentHazardsPayload {
  const approvedFrameIds = frames.filter((frame) => !frame.deleted).map((frame) => frame.sourceFrameId ?? frame.frameId);
  return {
    job_id: jobId,
    edit_manifest_path: `/runpod-volume/jobs/${jobId}/edit_manifest.json`,
    approved_frame_ids: approvedFrameIds,
    concept_prompt: SAM3_DEMO_CONCEPT_PROMPT,
    max_images: approvedFrameIds.length,
    batch_size: 2,
    score_threshold: 0.35,
    mask_threshold: 0.5,
  };
}

export function buildInlineSegmentHazardsPayload(jobId: string, frames: ReviewFrame[]): InlineSegmentHazardsPayload {
  const approvedFrames = frames.filter((frame) => !frame.deleted && frame.previewUrl);
  return {
    mode: "inline",
    job_id: jobId,
    frame_ids: approvedFrames.map((frame) => frame.sourceFrameId ?? frame.frameId),
    image_data_urls: approvedFrames.map((frame) => frame.previewUrl as string),
    timestamps_ms: approvedFrames.map((frame) => frame.timestampMs ?? 0),
    concept_prompt: SAM3_DEMO_CONCEPT_PROMPT,
    max_images: approvedFrames.length,
    batch_size: 2,
    score_threshold: 0.35,
    mask_threshold: 0.5,
  };
}

export function buildLoadingButtonState(
  requestState: RequestState,
  idleLabel: string,
  loadingLabel: string,
): LoadingButtonState {
  if (requestState === "submitting") {
    return { busy: true, label: `${loadingLabel}...` };
  }

  return { busy: false, label: idleLabel };
}

export function buildPipelineRun(jobId: string): PipelineStage[] {
  return [
    {
      id: "extract-keyframes",
      label: "extract-keyframes",
      detail: `FFmpeg/NVDEC keyframes from ${buildVolumeVideoPath(jobId)}`,
      state: "waiting",
    },
    {
      id: "hazard-editing",
      label: "image editing",
      detail: "Runpod Flash hazard edits from approved keyframes.",
      state: "waiting",
    },
    {
      id: "segmentation",
      label: "image segmentation",
      detail: "Runpod Flash SAM3 masks with a broad object-on-the-floor prompt.",
      state: "waiting",
    },
  ];
}

export function toggleFrameDeleted(frames: ReviewFrame[], frameId: string): ReviewFrame[] {
  return frames.map((frame) => (frame.frameId === frameId ? { ...frame, deleted: !frame.deleted } : frame));
}

export function countApprovedFrames(frames: ReviewFrame[]): number {
  return frames.filter((frame) => !frame.deleted).length;
}

export function framesFromExtractResponse(response: ExtractKeyframesResponse): ReviewFrame[] {
  const frames = response.frames?.length ? response.frames : numberedFrames(response.keyframes_dir, response.extracted_count);

  return frames.map((frame) => ({
    frameId: frame.frame_id,
    path: frame.path,
    previewUrl: frame.preview_url,
    timestampMs: frame.timestamp_ms,
    deleted: false,
  }));
}

export function framesFromEditResponse(response: EditHazardsResponse): ReviewFrame[] {
  return (response.images ?? []).map((image) => ({
    frameId: image.frame_id,
    path: image.edited_path,
    previewUrl: image.preview_url,
    timestampMs: image.timestamp_ms,
    deleted: false,
    sourceFrameId: image.frame_id,
  }));
}

export function framesFromSegmentationResponse(response: SegmentHazardsResponse): ReviewFrame[] {
  return (response.images ?? []).map((image) => {
    const firstMaskPath = image.instances?.[0]?.mask_path;
    return {
      frameId: image.frame_id,
      path: firstMaskPath ?? image.edited_path,
      previewUrl: image.preview_url,
      timestampMs: image.timestamp_ms,
      deleted: false,
      sourceFrameId: image.frame_id,
      prompt: SAM3_DEMO_CONCEPT_PROMPT,
    };
  });
}

function numberedFrames(keyframesDir: string, count: number): ExtractedKeyframe[] {
  return Array.from({ length: count }, (_, index) => {
    const frameId = `kf_${String(index + 1).padStart(4, "0")}`;
    return {
      frame_id: frameId,
      path: `${keyframesDir}/${frameId}.jpg`,
    };
  });
}

export function buildDryRunResponse(payload: ExtractKeyframesPayload): ExtractKeyframesResponse {
  return {
    job_id: payload.job_id,
    status: "dry-run",
    manifest_path: buildManifestPath(payload.job_id),
    keyframes_dir: buildKeyframesDir(payload.job_id),
    extracted_count: 0,
    dry_run: true,
    request: payload,
  };
}
