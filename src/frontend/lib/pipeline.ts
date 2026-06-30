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
  path: string;
  previewUrl?: string;
  timestampMs?: number;
  deleted: boolean;
};

export type ExtractKeyframesPayload = {
  job_id: string;
  video_path: string;
  max_keyframes: number;
  prefer_gpu_decode: boolean;
};

export type ExtractKeyframesResponse = {
  job_id: string;
  status: string;
  manifest_path: string;
  keyframes_dir: string;
  decode_mode?: string;
  extracted_count: number;
  dry_run?: boolean;
  request?: ExtractKeyframesPayload;
  error?: string;
};

export type LoadingButtonState = {
  busy: boolean;
  label: string;
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
      detail: "Qwen edit contract exists; Flash endpoint is not wired yet.",
      state: "contract",
    },
    {
      id: "segmentation",
      label: "image segmentation",
      detail: "Pending SAM-3 contract.",
      state: "locked",
    },
  ];
}

export function toggleFrameDeleted(frames: ReviewFrame[], frameId: string): ReviewFrame[] {
  return frames.map((frame) => (frame.frameId === frameId ? { ...frame, deleted: !frame.deleted } : frame));
}

export function countApprovedFrames(frames: ReviewFrame[]): number {
  return frames.filter((frame) => !frame.deleted).length;
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
