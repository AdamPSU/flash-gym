import { NextResponse } from "next/server";

type RunpodResponse = {
  error?: unknown;
  status?: unknown;
  output?: unknown;
};

export const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
export const FRAME_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export function parseApprovedFrameIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((frameId): frameId is string => typeof frameId === "string" && FRAME_ID_PATTERN.test(frameId));
}

export async function proxyRunpodStage(endpointUrl: string, apiKey: string, inputData: unknown, stageName: string) {
  const endpointResponse = await fetch(buildRunpodRunsyncUrl(endpointUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: { input_data: inputData } }),
  });

  const responseBody = (await endpointResponse.json()) as RunpodResponse;
  if (!endpointResponse.ok) {
    return NextResponse.json(
      { error: `${stageName} endpoint request failed`, details: responseBody },
      { status: endpointResponse.status },
    );
  }

  if (responseBody.status === "FAILED" || outputFailed(responseBody.output)) {
    return NextResponse.json({ error: runpodErrorMessage(responseBody, stageName), details: responseBody }, { status: 502 });
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

function runpodErrorMessage(responseBody: RunpodResponse, stageName: string): string {
  if (typeof responseBody.error === "string" && responseBody.error) {
    return responseBody.error;
  }

  if (isRecord(responseBody.output) && typeof responseBody.output.error === "string" && responseBody.output.error) {
    return responseBody.output.error;
  }

  return `${stageName} Runpod job failed`;
}
