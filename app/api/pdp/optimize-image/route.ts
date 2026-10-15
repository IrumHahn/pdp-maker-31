import { NextResponse } from "next/server";
import sharp, { type OverlayOptions } from "sharp";
import type { PdpAnalysisImageMetadata } from "@runacademy/shared";

export const runtime = "nodejs";

const STANDARD_ANALYSIS_MAX_DIMENSION = 1024;
const STANDARD_GENERATION_MAX_DIMENSION = 2048;
const OVERSIZED_STANDARD_MIN_PIXELS = 20_000_000;
const OVERSIZED_STANDARD_MAX_DIMENSION = 4096;
const LONG_DETAIL_MIN_HEIGHT = 3200;
const LONG_DETAIL_MIN_RATIO = 4.5;
const LONG_DETAIL_CANVAS_WIDTH = 1024;
const LONG_DETAIL_OVERVIEW_WIDTH = 168;
const LONG_DETAIL_PADDING = 14;
const LONG_DETAIL_GAP = 10;
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
const MAX_INPUT_PIXELS = 260_000_000;
const STANDARD_ORIGINAL_BYTE_BUDGET = 1024 * 1024;
const ANALYSIS_BYTE_BUDGET = 512 * 1024;
const GENERATION_BYTE_BUDGET = 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const allowLongPageSampling = formData.get("allowLongPageSampling") !== "false";
    const forceCompression = formData.get("forceCompression") === "true";
    const analysisBudget = readByteBudget(formData.get("analysisByteBudget"), ANALYSIS_BYTE_BUDGET, 64 * 1024, ANALYSIS_BYTE_BUDGET);
    const generationBudget = readByteBudget(formData.get("generationByteBudget"), GENERATION_BYTE_BUDGET, 128 * 1024, GENERATION_BYTE_BUDGET);

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "이미지 파일이 없습니다." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ ok: false, message: "이미지 파일만 업로드할 수 있습니다." }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, message: "이미지 파일이 너무 큽니다. 60MB 이하 파일로 다시 시도해 주세요." },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();

    if (!metadata.width || !metadata.height) {
      return NextResponse.json({ ok: false, message: "이미지 크기를 읽지 못했습니다." }, { status: 400 });
    }

    const optimized = allowLongPageSampling && isLongDetailPage(metadata.width, metadata.height)
      ? await buildLongDetailPagePayload(buffer, file.name, file.size, metadata.width, metadata.height, analysisBudget, generationBudget)
      : forceCompression || file.size > STANDARD_ORIGINAL_BYTE_BUDGET || isOversizedStandardImage(metadata.width, metadata.height)
        ? await buildStandardImagePayload(buffer, file.name, file.size, metadata.width, metadata.height, analysisBudget, generationBudget)
        : buildOriginalImagePayload(buffer, file.name, file.size, file.type, metadata.width, metadata.height);

    return NextResponse.json({ ok: true, image: optimized });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "이미지를 최적화하지 못했습니다.",
        detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      },
      { status: 500 }
    );
  }
}

function readByteBudget(value: FormDataEntryValue | null, fallback: number, minimum: number, maximum: number) {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(minimum, Math.min(maximum, Math.floor(parsed))) : fallback;
}

function buildOriginalImagePayload(
  source: Buffer,
  fileName: string,
  originalBytes: number,
  mimeType: string,
  originalWidth: number,
  originalHeight: number
) {
  const normalizedMimeType = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
  const base64 = source.toString("base64");
  const analysisMetadata: PdpAnalysisImageMetadata = {
    mode: "original",
    originalWidth,
    originalHeight,
    optimizedWidth: originalWidth,
    optimizedHeight: originalHeight,
    originalBytes,
    optimizedBytes: originalBytes
  };

  return {
    base64,
    mimeType: normalizedMimeType,
    fileName,
    generationBase64: base64,
    generationMimeType: normalizedMimeType,
    analysisMetadata
  };
}

async function buildStandardImagePayload(
  source: Buffer,
  fileName: string,
  originalBytes: number,
  sourceWidth: number,
  sourceHeight: number,
  analysisBudget = ANALYSIS_BYTE_BUDGET,
  generationBudget = GENERATION_BYTE_BUDGET
) {
  const analysis = await resizeToJpegPayload(source, sourceWidth, sourceHeight, STANDARD_ANALYSIS_MAX_DIMENSION, 84, analysisBudget);
  const preserveAlpha = Boolean((await sharp(source).metadata()).hasAlpha);
  const generationReference = await resizeToJpegPayload(source, sourceWidth, sourceHeight, STANDARD_GENERATION_MAX_DIMENSION, 90, generationBudget, preserveAlpha);
  const analysisMetadata: PdpAnalysisImageMetadata = {
    mode: "standard-resize",
    originalWidth: sourceWidth,
    originalHeight: sourceHeight,
    optimizedWidth: analysis.width,
    optimizedHeight: analysis.height,
    originalBytes,
    optimizedBytes: analysis.buffer.byteLength,
    generationReferenceWidth: generationReference.width,
    generationReferenceHeight: generationReference.height
  };

  return {
    base64: analysis.buffer.toString("base64"),
    mimeType: "image/jpeg" as const,
    fileName,
    generationBase64: generationReference.buffer.toString("base64"),
    generationMimeType: generationReference.mimeType,
    analysisMetadata
  };
}

async function buildLongDetailPagePayload(
  source: Buffer,
  fileName: string,
  originalBytes: number,
  sourceWidth: number,
  sourceHeight: number,
  analysisBudget = ANALYSIS_BYTE_BUDGET,
  generationBudget = GENERATION_BYTE_BUDGET
) {
  const sampleCount = getLongDetailSampleCount(sourceHeight);
  const detailStartX = LONG_DETAIL_PADDING + LONG_DETAIL_OVERVIEW_WIDTH + LONG_DETAIL_GAP;
  const detailWidth = Math.floor(
    (LONG_DETAIL_CANVAS_WIDTH - detailStartX - LONG_DETAIL_PADDING - LONG_DETAIL_GAP) / 2
  );
  const detailHeight = Math.round(detailWidth * 1.35);
  const rows = Math.ceil(sampleCount / 2);
  const canvasHeight = LONG_DETAIL_PADDING * 2 + rows * detailHeight + Math.max(0, rows - 1) * LONG_DETAIL_GAP;
  const overviewHeight = canvasHeight - LONG_DETAIL_PADDING * 2;
  const cropHeight = Math.min(sourceHeight, Math.round(sourceWidth * (detailHeight / detailWidth)));
  const maxCropTop = Math.max(0, sourceHeight - cropHeight);
  const composites: OverlayOptions[] = [
    {
      input: await sharp({
        create: {
          width: LONG_DETAIL_OVERVIEW_WIDTH,
          height: overviewHeight,
          channels: 3,
          background: "#ffffff"
        }
      }).jpeg({ quality: 90 }).toBuffer(),
      left: LONG_DETAIL_PADDING,
      top: LONG_DETAIL_PADDING
    }
  ];

  for (let index = 0; index < sampleCount; index += 1) {
    const row = Math.floor(index / 2);
    const column = index % 2;
    const targetX = detailStartX + column * (detailWidth + LONG_DETAIL_GAP);
    const targetY = LONG_DETAIL_PADDING + row * (detailHeight + LONG_DETAIL_GAP);
    const sourceY = Math.round((maxCropTop * index) / (sampleCount - 1));
    const overviewY = LONG_DETAIL_PADDING + Math.round((sourceY / Math.max(sourceHeight, 1)) * overviewHeight);
    const overviewSliceHeight = Math.max(8, Math.round((cropHeight / Math.max(sourceHeight, 1)) * overviewHeight));
    const sampleBuffer = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
      .extract({ left: 0, top: sourceY, width: sourceWidth, height: cropHeight })
      .resize(detailWidth, detailHeight, { fit: "fill" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    const overviewBuffer = await sharp(sampleBuffer)
      .resize(LONG_DETAIL_OVERVIEW_WIDTH, overviewSliceHeight, { fit: "fill" })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();

    composites.push({ input: sampleBuffer, left: targetX, top: targetY });
    composites.push({
      input: overviewBuffer,
      left: LONG_DETAIL_PADDING,
      top: Math.min(LONG_DETAIL_PADDING + overviewHeight - overviewSliceHeight, overviewY)
    });
  }

  const analysisBuffer = await sharp({
    create: {
      width: LONG_DETAIL_CANVAS_WIDTH,
      height: canvasHeight,
      channels: 3,
      background: "#f7f3e8"
    }
  })
    .composite(composites)
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const analysis = await resizeToJpegPayload(analysisBuffer, LONG_DETAIL_CANVAS_WIDTH, canvasHeight, canvasHeight, 82, analysisBudget);
  const generationReference = await buildGenerationReferencePayload(source, sourceWidth, sourceHeight, generationBudget);
  const analysisMetadata: PdpAnalysisImageMetadata = {
    mode: "long-detail-sampling",
    originalWidth: sourceWidth,
    originalHeight: sourceHeight,
    optimizedWidth: analysis.width,
    optimizedHeight: analysis.height,
    originalBytes,
    optimizedBytes: analysis.buffer.byteLength,
    sampleCount,
    generationReferenceWidth: generationReference.width,
    generationReferenceHeight: generationReference.height
  };

  return {
    base64: analysis.buffer.toString("base64"),
    mimeType: "image/jpeg" as const,
    fileName,
    generationBase64: generationReference.base64,
    generationMimeType: "image/jpeg" as const,
    analysisMetadata
  };
}

async function buildGenerationReferencePayload(source: Buffer, sourceWidth: number, sourceHeight: number, byteBudget = GENERATION_BYTE_BUDGET) {
  const cropHeight = Math.min(sourceHeight, Math.round(sourceWidth * 1.35));
  const targetWidth = Math.min(STANDARD_ANALYSIS_MAX_DIMENSION, sourceWidth);
  const targetHeight = Math.max(1, Math.round((cropHeight * targetWidth) / Math.max(sourceWidth, 1)));
  const buffer = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
    .extract({ left: 0, top: 0, width: sourceWidth, height: cropHeight })
    .resize(targetWidth, targetHeight, { fit: "fill" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  const bounded = await resizeToJpegPayload(buffer, targetWidth, targetHeight, Math.max(targetWidth, targetHeight), 88, byteBudget);
  return { base64: bounded.buffer.toString("base64"), width: bounded.width, height: bounded.height };
}

async function resizeToJpegPayload(
  source: Buffer,
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
  quality: number,
  byteBudget: number,
  preserveAlpha = false
) {
  // Small but dense PNGs must start shrinking immediately; starting at 2048
  // wasted most attempts with an unchanged image below that dimension.
  let dimension = Math.min(maxDimension, Math.max(sourceWidth, sourceHeight));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const scale = Math.min(1, dimension / Math.max(sourceWidth, sourceHeight, 1));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const pipeline = sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(width, height, { fit: "inside", withoutEnlargement: true });
    const result = await (preserveAlpha
      ? pipeline.png({ compressionLevel: 9 })
      : pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: Math.max(65, quality - attempt * 5), mozjpeg: true })
    ).toBuffer({ resolveWithObject: true });
    if (result.data.byteLength <= byteBudget) {
      return { buffer: result.data, width: result.info.width, height: result.info.height, mimeType: preserveAlpha ? "image/png" : "image/jpeg" };
    }
    dimension = Math.max(128, Math.round(dimension * 0.8));
  }
  throw new Error("이미지 용량을 전송 한도에 맞추지 못했습니다. 다른 파일로 다시 시도해 주세요.");
}

function isLongDetailPage(width: number, height: number) {
  return height >= LONG_DETAIL_MIN_HEIGHT && height / Math.max(width, 1) >= LONG_DETAIL_MIN_RATIO;
}

function isOversizedStandardImage(width: number, height: number) {
  return width * height >= OVERSIZED_STANDARD_MIN_PIXELS || Math.max(width, height) >= OVERSIZED_STANDARD_MAX_DIMENSION;
}

function getLongDetailSampleCount(height: number) {
  if (height >= 30000) {
    return 16;
  }
  if (height >= 16000) {
    return 14;
  }
  if (height >= 8000) {
    return 12;
  }

  return 10;
}
