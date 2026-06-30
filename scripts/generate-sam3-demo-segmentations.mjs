import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const hazardsDir = path.join(rootDir, "media", "hazards");
const outputDir = path.join(rootDir, "media", "segmentations");
const manifestPath = path.join(outputDir, "segmentation_manifest.json");
const conceptPrompt = process.env.SAM3_DEMO_PROMPT?.trim() || "safety hazard";
const endpoint = "https://serverless.roboflow.com/sam3/concept_segment";

const apiKey = process.env.ROBOFLOW_API_KEY?.trim();
if (!apiKey) {
  throw new Error("ROBOFLOW_API_KEY is required to generate SAM3 demo segmentations");
}

const hazardFiles = (await readdir(hazardsDir))
  .filter((fileName) => /^kf_\d{4}_[a-z0-9-]+\.png$/.test(fileName))
  .sort();

if (hazardFiles.length === 0) {
  throw new Error(`No demo hazard images found in ${hazardsDir}`);
}

await mkdir(outputDir, { recursive: true });

const images = [];
let instanceCount = 0;

for (const fileName of hazardFiles) {
  const frameId = fileName.match(/^(kf_\d{4})_/)?.[1];
  if (!frameId) {
    continue;
  }

  const imagePath = path.join(hazardsDir, fileName);
  const imageBuffer = await readFile(imagePath);
  const { width, height } = readPngSize(imageBuffer);
  const response = await fetch(`${endpoint}?api_key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      format: "polygon",
      image: { type: "base64", value: imageBuffer.toString("base64") },
      prompts: [{ type: "text", text: conceptPrompt }],
    }),
  });

  if (!response.ok) {
    const providerText = await response.text();
    throw new Error(`SAM3 provider request failed for ${fileName}: ${providerText.slice(0, 500)}`);
  }

  const providerBody = await response.json();
  const instances = extractInstances(frameId, providerBody);
  instanceCount += instances.length;

  const overlayFileName = `${frameId}.svg`;
  const overlayPath = path.join(outputDir, overlayFileName);
  await writeFile(
    overlayPath,
    buildOverlaySvg({
      sourceImageHref: `data:image/png;base64,${imageBuffer.toString("base64")}`,
      width,
      height,
      instances,
      frameId,
    }),
    "utf-8",
  );

  images.push({
    frame_id: frameId,
    source_image: `media/hazards/${fileName}`,
    overlay_image: `media/segmentations/${overlayFileName}`,
    width,
    height,
    instances,
  });

  console.log(`${frameId}: wrote ${overlayFileName} with ${instances.length} SAM3 instance(s)`);
}

await writeFile(
  manifestPath,
  JSON.stringify(
    {
      schema_version: 1,
      stage: "hazard-segmentation-demo",
      model_provider: "roboflow-sam3",
      concept_prompt: conceptPrompt,
      segmented_count: images.length,
      instance_count: instanceCount,
      images,
    },
    null,
    2,
  ),
  "utf-8",
);

console.log(`wrote ${path.relative(rootDir, manifestPath)}`);

function readPngSize(buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("Expected a PNG image");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function extractInstances(frameId, providerBody) {
  const promptResult = providerBody?.prompt_results?.[0];
  const predictions = Array.isArray(promptResult?.predictions) ? promptResult.predictions : [];

  return predictions.map((prediction, index) => {
    const polygon = normalizePolygon(prediction.masks?.[0] ?? prediction.mask ?? []);
    return {
      instance_id: `${frameId}_mask_${String(index + 1).padStart(2, "0")}`,
      score: roundNumber(prediction.confidence ?? prediction.score ?? 0),
      bbox_xyxy: readBox(prediction, polygon),
      polygon,
    };
  });
}

function normalizePolygon(mask) {
  if (!Array.isArray(mask)) {
    return [];
  }
  if (mask.every((point) => Array.isArray(point))) {
    return mask.map((point) => [roundNumber(point[0] ?? 0), roundNumber(point[1] ?? 0)]);
  }

  const polygon = [];
  for (let index = 0; index < mask.length; index += 2) {
    polygon.push([roundNumber(mask[index] ?? 0), roundNumber(mask[index + 1] ?? 0)]);
  }
  return polygon;
}

function readBox(prediction, polygon) {
  if (Array.isArray(prediction.bbox_xyxy)) {
    return prediction.bbox_xyxy.slice(0, 4).map(roundNumber);
  }
  if (Array.isArray(prediction.box)) {
    return prediction.box.slice(0, 4).map(roundNumber);
  }
  if (
    Number.isFinite(prediction.x) &&
    Number.isFinite(prediction.y) &&
    Number.isFinite(prediction.width) &&
    Number.isFinite(prediction.height)
  ) {
    return [
      roundNumber(prediction.x),
      roundNumber(prediction.y),
      roundNumber(prediction.x + prediction.width),
      roundNumber(prediction.y + prediction.height),
    ];
  }
  if (!polygon.length) {
    return [0, 0, 0, 0];
  }
  const xs = polygon.map((point) => point[0]);
  const ys = polygon.map((point) => point[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(roundNumber);
}

function buildOverlaySvg({ sourceImageHref, width, height, instances, frameId }) {
  const polygons = instances
    .filter((instance) => instance.polygon.length >= 3)
    .map((instance, index) => {
      const points = instance.polygon.map((point) => point.join(",")).join(" ");
      const hue = (index * 73 + 188) % 360;
      return `<polygon points="${points}" fill="hsla(${hue}, 100%, 68%, 0.32)" stroke="hsl(${hue}, 100%, 72%)" stroke-width="5" stroke-linejoin="round"/>`;
    })
    .join("\n  ");

  const label = escapeXml(`${frameId} · SAM3 · ${conceptPrompt}`);
  const emptyState = instances.length
    ? ""
    : `<text x="24" y="${height - 28}" fill="#ffc4dc" font-family="monospace" font-size="24">no safety hazard mask returned</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
  <image href="${escapeXml(sourceImageHref)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
  ${polygons}
  <rect x="16" y="16" width="360" height="48" rx="4" fill="rgba(5,5,6,0.78)"/>
  <text x="34" y="48" fill="#bfff00" font-family="monospace" font-size="24">${label}</text>
  ${emptyState}
</svg>
`;
}

function roundNumber(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
