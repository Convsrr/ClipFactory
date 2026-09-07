import {
  cropTrackPointSchema,
  type CropTrack,
  type CropTrackPoint,
  type CropStrategy,
} from "./media-types.js";

export const CROP_TUNING = {
  smoothingStrength: 0.28,
  maxMovementPerSecond: 0.32,
  minimumMovement: 0.008,
  lowConfidenceThreshold: 0.45,
  sampleIntervalSec: 0.25,
} as const;
export type CropTuningOverrides = Partial<Record<keyof typeof CROP_TUNING, number>>;

export const OUTPUT_WIDTH = 1080 as const;
export const OUTPUT_HEIGHT = 1920 as const;
export const VERTICAL_ASPECT = OUTPUT_WIDTH / OUTPUT_HEIGHT;

export type SourceDimensions = { width: number; height: number; fps?: number };

export type CropGeometry = {
  mode: "crop" | "fit";
  cropWidth: number;
  cropHeight: number;
  maxX: number;
  maxY: number;
};

export type CropKeyframe = {
  timeSec: number;
  centerX: number;
  centerY: number;
  x: number;
  y: number;
};

export type CropPlan = {
  strategy: CropStrategy;
  durationSec: number;
  source: SourceDimensions;
  geometry: CropGeometry;
  keyframes: CropKeyframe[];
};

export type CropPlanInput = {
  clipId: string;
  clipStartSec: number;
  clipEndSec: number;
  source: SourceDimensions;
  cropTrack?: CropTrack | null;
  sceneTimestamps?: number[];
  tuning?: CropTuningOverrides;
};

export function calculateCropGeometry(source: SourceDimensions): CropGeometry {
  const width = evenDimension(source.width);
  const height = evenDimension(source.height);
  if (width < 2 || height < 2) throw new Error("Source dimensions are too small for vertical rendering");

  const sourceAspect = width / height;
  if (sourceAspect > VERTICAL_ASPECT + 0.0001) {
    const cropHeight = height;
    const cropWidth = evenDimension(Math.round(cropHeight * VERTICAL_ASPECT));
    return { mode: "crop", cropWidth: Math.max(2, cropWidth), cropHeight, maxX: Math.max(0, width - cropWidth), maxY: 0 };
  }

  if (sourceAspect < VERTICAL_ASPECT - 0.0001) {
    return { mode: "fit", cropWidth: width, cropHeight: height, maxX: 0, maxY: 0 };
  }

  return { mode: "crop", cropWidth: width, cropHeight: height, maxX: 0, maxY: 0 };
}

export function buildCropPlan(input: CropPlanInput): CropPlan {
  const durationSec = Math.max(0.01, input.clipEndSec - input.clipStartSec);
  const source = {
    width: evenDimension(input.source.width),
    height: evenDimension(input.source.height),
    ...(input.source.fps && Number.isFinite(input.source.fps) ? { fps: input.source.fps } : {}),
  } satisfies SourceDimensions;
  const geometry = calculateCropGeometry(source);
  const tuning = { ...CROP_TUNING, ...input.tuning };
  const relativePoints = relativeTrackPoints(input.cropTrack, input.clipStartSec, input.clipEndSec, durationSec, tuning.lowConfidenceThreshold);
  const fallbackStrategy: CropStrategy = input.sceneTimestamps?.length ? "scene_aware_center" : "source_center";
  const strategy: CropStrategy = relativePoints.length ? "face_track" : fallbackStrategy;
  const sceneCuts = (input.sceneTimestamps ?? [])
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > input.clipStartSec && timestamp < input.clipEndSec)
    .map((timestamp) => timestamp - input.clipStartSec);
  const focusPoints = smoothFocusPoints({
    points: relativePoints,
    durationSec,
    sceneCuts,
    tuning,
  });
  const keyframes = focusPoints.map(({ timeSec, centerX, centerY }) => ({
    timeSec,
    centerX,
    centerY,
    x: cropPosition(centerX, source.width, geometry.cropWidth, geometry.maxX),
    y: cropPosition(centerY, source.height, geometry.cropHeight, geometry.maxY),
  }));

  return { strategy, durationSec, source, geometry, keyframes };
}

export function relativeTrackPoints(
  cropTrack: CropTrack | null | undefined,
  clipStartSec: number,
  clipEndSec: number,
  durationSec = Math.max(0.01, clipEndSec - clipStartSec),
  lowConfidenceThreshold: number = CROP_TUNING.lowConfidenceThreshold,
): CropTrackPoint[] {
  if (!cropTrack || cropTrack.timebase !== "absolute-video-seconds" || cropTrack.coordinateSpace !== "normalized") return [];
  return cropTrack.tracks
    .map((point) => {
      const startSec = Math.max(clipStartSec, point.startSec);
      const endSec = Math.min(clipEndSec, point.endSec);
      const parsed = cropTrackPointSchema.safeParse({ ...point, startSec, endSec });
      if (!parsed.success || parsed.data.confidence < lowConfidenceThreshold || endSec <= startSec) return null;
      return {
        ...parsed.data,
        startSec: clamp(startSec - clipStartSec, 0, durationSec),
        endSec: clamp(endSec - clipStartSec, 0, durationSec),
      };
    })
    .filter((point): point is CropTrackPoint => point !== null)
    .sort((a, b) => a.startSec - b.startSec || b.confidence - a.confidence || a.focusX - b.focusX);
}

export function smoothFocusPoints(input: {
  points: CropTrackPoint[];
  durationSec: number;
  sceneCuts?: number[];
  tuning?: CropTuningOverrides;
}): Array<{ timeSec: number; centerX: number; centerY: number }> {
  const tuning = { ...CROP_TUNING, ...input.tuning };
  const boundaries = new Set<number>([0, Math.max(0, input.durationSec)]);
  for (const cut of input.sceneCuts ?? []) if (cut > 0 && cut < input.durationSec) boundaries.add(roundTime(cut));
  for (const point of input.points) {
    boundaries.add(roundTime(point.startSec));
    boundaries.add(roundTime(point.endSec));
  }
  for (let timeSec = tuning.sampleIntervalSec; timeSec < input.durationSec; timeSec += tuning.sampleIntervalSec) boundaries.add(roundTime(timeSec));

  const times = [...boundaries].sort((a, b) => a - b);
  const output: Array<{ timeSec: number; centerX: number; centerY: number }> = [];
  let previous = { centerX: 0.5, centerY: 0.5 };
  let previousTime = 0;
  for (const timeSec of times) {
    const activeTarget = targetAt(input.points, timeSec);
    const targetX = activeTarget?.focusX ?? previous.centerX;
    const targetY = activeTarget?.focusY ?? previous.centerY;
    const isSceneCut = (input.sceneCuts ?? []).some((cut) => Math.abs(cut - timeSec) < 0.011);
    if (isSceneCut) {
      previous = { centerX: clamp(targetX, 0, 1), centerY: clamp(targetY, 0, 1) };
    } else if (output.length) {
      const deltaTime = Math.max(0.001, timeSec - previousTime);
      const maxDelta = tuning.maxMovementPerSecond * deltaTime;
      previous = {
        centerX: moveToward(previous.centerX, targetX, tuning.smoothingStrength, maxDelta, tuning.minimumMovement),
        centerY: moveToward(previous.centerY, targetY, tuning.smoothingStrength, maxDelta, tuning.minimumMovement),
      };
    } else {
      previous = { centerX: clamp(targetX, 0, 1), centerY: clamp(targetY, 0, 1) };
    }
    previousTime = timeSec;
    output.push({ timeSec, centerX: previous.centerX, centerY: previous.centerY });
  }

  return output.length ? output : [{ timeSec: 0, centerX: 0.5, centerY: 0.5 }];
}

export function choosePrimaryCropTrack(candidates: CropTrack[]): CropTrack | null {
  const ranked = candidates
    .map((candidate) => {
      const valid = candidate.tracks.filter((point) => Number.isFinite(point.confidence));
      const persistence = valid.reduce((sum, point) => sum + Math.max(0, point.endSec - point.startSec), 0);
      const confidence = valid.length ? valid.reduce((sum, point) => sum + point.confidence, 0) / valid.length : 0;
      const area = valid.length ? valid.reduce((sum, point) => sum + (point.faceArea ?? 0), 0) / valid.length : 0;
      return { candidate, score: confidence * 0.55 + Math.min(1, persistence / 30) * 0.25 + area * 0.2 };
    })
    .filter(({ candidate }) => candidate.tracks.length)
    .sort((a, b) => b.score - a.score || (a.candidate.subjectId ?? "").localeCompare(b.candidate.subjectId ?? ""));
  return ranked[0]?.candidate ?? null;
}

export function cropPosition(center: number, sourceSize: number, cropSize: number, maxPosition: number): number {
  if (maxPosition <= 0) return 0;
  return clamp(center * sourceSize - cropSize / 2, 0, maxPosition);
}

function targetAt(points: CropTrackPoint[], timeSec: number) {
  const active = points.filter((point) => point.startSec <= timeSec && point.endSec >= timeSec);
  if (!active.length) return null;
  return active.sort((a, b) => b.startSec - a.startSec || b.confidence - a.confidence)[0] ?? null;
}

function moveToward(current: number, target: number, smoothingStrength: number, maxDelta: number, minimumMovement: number) {
  const difference = target - current;
  if (Math.abs(difference) < minimumMovement) return current;
  return current + clamp(difference * smoothingStrength, -maxDelta, maxDelta);
}

function evenDimension(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Source dimensions must be positive numbers");
  if (value < 2) throw new Error("Source dimensions are too small for vertical rendering");
  return Math.max(2, Math.floor(value / 2) * 2);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000;
}
