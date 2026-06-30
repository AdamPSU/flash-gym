"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

import {
  buildExtractKeyframesPayload,
  buildLoadingButtonState,
  buildManifestPath,
  buildPipelineRun,
  buildRunTitle,
  buildVolumeVideoPath,
  countApprovedFrames,
  createSafeJobId,
  ExtractKeyframesResponse,
  PipelineStage,
  RequestState,
  ReviewFrame,
  toggleFrameDeleted,
} from "../lib/pipeline";

const initialJobId = "runpod-venue";

function createMockPreview(seed: number): string {
  const accent = ["#99edff", "#bfff00", "#ffc4dc"][seed % 3];
  const glow = ["#762ff9", "#24333f", "#4b14c8"][seed % 3];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#08090c"/><rect x="0" y="210" width="640" height="150" fill="#111217"/><path d="M0 228h640" stroke="#30323b" stroke-width="2"/><path d="M78 360 286 210h70L212 360z" fill="#181a22"/><path d="M400 360 338 210h62l166 150z" fill="#151720"/><rect x="58" y="72" width="142" height="96" rx="3" fill="#171922" stroke="#373b48" stroke-width="2"/><rect x="450" y="58" width="126" height="132" rx="3" fill="#151821" stroke="#323642" stroke-width="2"/><circle cx="318" cy="184" r="72" fill="${glow}" opacity=".34"/><path d="M312 126h42l32 112H276l36-112z" fill="${accent}" opacity=".7"/><path d="M292 238h78l22 82H268l24-82z" fill="#f7f4ff" opacity=".16"/><path d="M86 288h468" stroke="${accent}" stroke-width="3" opacity=".38"/><path d="M112 322h416" stroke="#f7f4ff" stroke-width="2" opacity=".12"/></svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const initialFrames: ReviewFrame[] = [
  {
    frameId: "kf_0001",
    path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0001.jpg",
    previewUrl: createMockPreview(0),
    timestampMs: 1180,
    deleted: false,
  },
  {
    frameId: "kf_0002",
    path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0002.jpg",
    previewUrl: createMockPreview(1),
    timestampMs: 2840,
    deleted: false,
  },
  {
    frameId: "kf_0003",
    path: "/runpod-volume/jobs/runpod-venue/keyframes/kf_0003.jpg",
    previewUrl: createMockPreview(2),
    timestampMs: 5120,
    deleted: true,
  },
];

export default function PipelineConsole() {
  const [jobId, setJobId] = useState(initialJobId);
  const [selectedFile, setSelectedFile] = useState("");
  const [maxKeyframes, setMaxKeyframes] = useState(30);
  const [preferGpuDecode, setPreferGpuDecode] = useState(true);
  const [frames, setFrames] = useState(initialFrames);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [extractResponse, setExtractResponse] = useState<ExtractKeyframesResponse | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState("");

  const videoPath = buildVolumeVideoPath(jobId);
  const manifestPath = buildManifestPath(jobId);
  const approvedCount = countApprovedFrames(frames);
  const activeFrame = frames[activeFrameIndex] ?? null;
  const stages = useMemo(
    () => updateStageStates(buildPipelineRun(jobId), requestState, Boolean(extractResponse), approvedCount),
    [approvedCount, extractResponse, jobId, requestState],
  );
  const payload = buildExtractKeyframesPayload(jobId, maxKeyframes, preferGpuDecode);
  const extractButton = buildLoadingButtonState(requestState, "Extract keyframes", "Extracting keyframes");
  const runTitle = buildRunTitle(selectedFile);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setSelectedFile(file.name);
    setJobId(createSafeJobId(file.name));
    setExtractResponse(null);
  }

  async function handleExtract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestState("submitting");
    setErrorMessage("");
    setErrorDetails("");

    try {
      const response = await fetch("/api/keyframes/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, maxKeyframes, preferGpuDecode }),
      });
      const body = (await response.json()) as ExtractKeyframesResponse;

      if (!response.ok) {
        setRequestState("error");
        setErrorMessage(body.error || "extract-keyframes request failed");
        setErrorDetails(formatErrorDetails(body));
        return;
      }

      setExtractResponse(body);
      setRequestState("idle");
      setErrorDetails("");
    } catch (error) {
      setRequestState("error");
      setErrorMessage(error instanceof Error ? error.message : "extract-keyframes request failed");
      setErrorDetails("");
    }
  }

  function moveFrame(direction: -1 | 1) {
    setActiveFrameIndex((current) => {
      const next = current + direction;
      if (next < 0) {
        return frames.length - 1;
      }
      if (next >= frames.length) {
        return 0;
      }
      return next;
    });
  }

  function toggleActiveFrame() {
    if (!activeFrame) {
      return;
    }
    setFrames((currentFrames) => toggleFrameDeleted(currentFrames, activeFrame.frameId));
  }

  return (
    <main className="shell">
      <aside className="controlPane" aria-label="Pipeline controls">
        <div className="brandBlock">
          <p className="eyebrow">Runpod Flash dataset pipeline</p>
          <h1>flash gym</h1>
          <p className="lede">
            Turn a venue walkthrough into review-ready training frames. One clip in, clean data out. Built for fast passes, sharp cuts,
            and no dashboard theater.
          </p>
        </div>

        <form className="jobForm" onSubmit={handleExtract} aria-busy={extractButton.busy}>
          <label className="fieldLabel" htmlFor="video-file">
            Source video
          </label>
          <input id="video-file" className="fileInput" type="file" accept="video/*" onChange={handleFileChange} />
          <p className="fieldHint">
            {selectedFile
              ? `${selectedFile} maps to the Runpod volume path below. Upload still happens outside this screen.`
              : "Choose a video to derive the Runpod job ID and worker path."}
          </p>

          <label className="fieldLabel" htmlFor="job-id">
            Job ID
          </label>
          <input id="job-id" className="textInput" value={jobId} onChange={(event) => setJobId(event.target.value)} />

          <label className="fieldLabel" htmlFor="video-path">
            Worker video path
          </label>
          <input id="video-path" className="textInput mono" value={videoPath} readOnly />

          <div className="formGrid">
            <label className="fieldLabel" htmlFor="max-keyframes">
              Max frames
              <input
                id="max-keyframes"
                className="textInput"
                type="number"
                min="1"
                max="30"
                value={maxKeyframes}
                onChange={(event) => setMaxKeyframes(Number(event.target.value))}
              />
            </label>
            <label className="toggleLabel" htmlFor="gpu-decode">
              <input
                id="gpu-decode"
                type="checkbox"
                checked={preferGpuDecode}
                onChange={(event) => setPreferGpuDecode(event.target.checked)}
              />
              Prefer NVDEC
            </label>
          </div>

          <button
            className="primaryButton"
            type="submit"
            disabled={extractButton.busy}
            aria-busy={extractButton.busy}
            data-loading={extractButton.busy ? "true" : undefined}
          >
            {extractButton.busy ? <span className="buttonSpinner" aria-hidden="true" /> : null}
            <span className="buttonText">{extractButton.label}</span>
          </button>
          {errorMessage ? <p className="errorText">{errorMessage}</p> : null}
          {errorDetails ? <pre className="errorDetails">{errorDetails}</pre> : null}
        </form>

      </aside>

      <section className="workPane" aria-label="Pipeline output">
        <div className="runHeader">
          <div>
            <p className="eyebrow">Pipeline run</p>
            <h2>{runTitle}</h2>
          </div>
        </div>

        <ol className="stageLog">
          {stages.map((stage, index) => (
            <li className="stageRow" data-state={stage.state} key={stage.id}>
              <span className="stageIndex">{String(index + 1).padStart(2, "0")}</span>
              <span>
                <strong>{stage.label}</strong>
                <small>{stage.detail}</small>
              </span>
            </li>
          ))}
        </ol>

        <section className="artifactShell" aria-label="Keyframe artifact review">
          <div className="artifactHeader">
            <div>
              <p className="eyebrow">Keyframe manifest</p>
              <h3>{activeFrame?.frameId ?? "no frame selected"}</h3>
            </div>
            <button className="ghostButton" type="button" onClick={() => setActiveFrameIndex(0)}>
              Reset cursor
            </button>
          </div>

          <div className="artifactGrid">
            <div className="previewPanel" data-deleted={activeFrame?.deleted ? "true" : "false"}>
              <div className="previewFrame">
                {activeFrame?.previewUrl ? (
                  <span
                    className="previewFrameImage"
                    aria-hidden="true"
                    style={{ backgroundImage: `url(${activeFrame.previewUrl})` }}
                  />
                ) : (
                  <span>{activeFrame?.frameId ?? "manifest"}</span>
                )}
              </div>
              <button
                className="frameNavButton frameNavButtonPrev"
                type="button"
                onClick={() => moveFrame(-1)}
                disabled={frames.length < 2}
                aria-label="Previous frame"
              >
                ←
              </button>
              <button
                className="frameNavButton frameNavButtonNext"
                type="button"
                onClick={() => moveFrame(1)}
                disabled={frames.length < 2}
                aria-label="Next frame"
              >
                →
              </button>
              <button
                className="frameRemoveButton"
                type="button"
                onClick={toggleActiveFrame}
                disabled={!activeFrame}
                data-deleted={activeFrame?.deleted ? "true" : "false"}
                aria-label={activeFrame?.deleted ? "Restore frame" : "Remove frame"}
                title={activeFrame?.deleted ? "Restore frame" : "Remove frame"}
              >
                ×
              </button>
            </div>

            <div className="manifestPanel">
              <dl>
                <div>
                  <dt>manifest</dt>
                  <dd>{manifestPath}</dd>
                </div>
                <div>
                  <dt>active frame</dt>
                  <dd>{activeFrame?.path ?? "waiting for extracted frames"}</dd>
                </div>
                <div>
                  <dt>timestamp</dt>
                  <dd>{activeFrame?.timestampMs ? `${activeFrame.timestampMs} ms` : "not reported"}</dd>
                </div>
                <div>
                  <dt>last request</dt>
                  <dd>{JSON.stringify(extractResponse?.request ?? payload)}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="frameStrip" aria-label="Extracted frame candidates">
            {frames.map((frame, index) => (
              <button
                className="frameThumb"
                data-active={index === activeFrameIndex ? "true" : "false"}
                data-deleted={frame.deleted ? "true" : "false"}
                key={frame.frameId}
                type="button"
                onClick={() => setActiveFrameIndex(index)}
                aria-label={`Select ${frame.frameId}`}
              >
                <span
                  className="frameThumbImage"
                  aria-hidden="true"
                  style={frame.previewUrl ? { backgroundImage: `url(${frame.previewUrl})` } : undefined}
                />
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function formatErrorDetails(response: ExtractKeyframesResponse): string {
  if (response.details === undefined) {
    return "";
  }

  try {
    return JSON.stringify(response.details, null, 2);
  } catch {
    return String(response.details);
  }
}

function updateStageStates(
  stages: PipelineStage[],
  requestState: RequestState,
  hasExtractResponse: boolean,
  approvedCount: number,
): PipelineStage[] {
  return stages.map((stage) => {
    if (stage.id === "extract-keyframes") {
      if (requestState === "submitting") {
        return { ...stage, state: "running" };
      }
      if (requestState === "error") {
        return { ...stage, state: "error" };
      }
      return hasExtractResponse ? { ...stage, state: "done" } : stage;
    }

    if (stage.id === "hazard-editing" && approvedCount > 0) {
      return { ...stage, state: "ready" };
    }

    return stage;
  });
}
