import { NextResponse } from "next/server";

import { buildDryRunResponse, buildExtractKeyframesPayload } from "../../../../lib/pipeline";

type ExtractRequestBody = {
  jobId?: unknown;
  maxKeyframes?: unknown;
  preferGpuDecode?: unknown;
};

type RunpodResponse = {
  error?: unknown;
  status?: unknown;
  output?: unknown;
};

const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export async function POST(request: Request) {
  const body = (await request.json()) as ExtractRequestBody;
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  const maxKeyframes = Number(body.maxKeyframes ?? 5);
  const preferGpuDecode = body.preferGpuDecode !== false;

  if (!JOB_ID_PATTERN.test(jobId)) {
    return NextResponse.json({ error: "jobId must be a safe file-system slug" }, { status: 400 });
  }

  if (!Number.isInteger(maxKeyframes) || maxKeyframes < 1 || maxKeyframes > 5) {
    return NextResponse.json({ error: "maxKeyframes must be an integer from 1 to 5" }, { status: 400 });
  }

  const payload = buildExtractKeyframesPayload(jobId, maxKeyframes, preferGpuDecode);
  const endpointUrl = process.env.RUNPOD_EXTRACT_KEYFRAMES_URL?.trim();
  const apiKey = process.env.RUNPOD_API_KEY?.trim();

  if (!endpointUrl || !apiKey) {
    if (endpointUrl || apiKey) {
      const missing = [!endpointUrl && "RUNPOD_EXTRACT_KEYFRAMES_URL", !apiKey && "RUNPOD_API_KEY"].filter(Boolean);
      return NextResponse.json({ error: `Missing ${missing.join(" and ")}` }, { status: 500 });
    }

    return NextResponse.json(buildDryRunResponse(payload));
  }

  const endpointResponse = await fetch(buildRunpodRunsyncUrl(endpointUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: { input_data: payload } }),
  });

  const responseBody = (await endpointResponse.json()) as RunpodResponse;
  if (!endpointResponse.ok) {
    return NextResponse.json(
      { error: "extract-keyframes endpoint request failed", details: responseBody },
      { status: endpointResponse.status },
    );
  }

  if (responseBody.status === "FAILED" || outputFailed(responseBody.output)) {
    return NextResponse.json(
      { error: runpodErrorMessage(responseBody), details: responseBody },
      { status: 502 },
    );
  }

  if (responseBody.status === "COMPLETED" && isRecord(responseBody.output)) {
    return NextResponse.json(responseBody.output);
  }

  return NextResponse.json(responseBody);
}

function buildRunpodRunsyncUrl(endpointUrl: string): string {
  const trimmed = endpointUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/run") || trimmed.endsWith("/runsync")) {
    return trimmed;
  }
  return `${trimmed}/runsync`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function outputFailed(output: unknown): boolean {
  return isRecord(output) && output.success === false;
}

function runpodErrorMessage(responseBody: RunpodResponse): string {
  if (typeof responseBody.error === "string" && responseBody.error) {
    return responseBody.error;
  }

  if (isRecord(responseBody.output) && typeof responseBody.output.error === "string" && responseBody.output.error) {
    return responseBody.output.error;
  }

  return "extract-keyframes Runpod job failed";
}
