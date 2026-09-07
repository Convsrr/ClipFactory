import { choosePrimaryCropTrack } from "./crop.js";
import { cropTrackSchema, type CropTrack, type CropTrackPoint, type CropStrategy } from "./media-types.js";

const FACE_TRACKER_TIMEOUT_MS = 15_000;

export type FaceTrackingClip = {
  id: string;
  startSec: number;
  endSec: number;
};

export type FaceTrackingRequest = {
  projectId: string;
  videoId: string;
  proxyObjectKey: string | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  clips: FaceTrackingClip[];
};

export type FaceTrackingResult = {
  cropTracks: CropTrack[];
  cropStrategy: CropStrategy;
  fallbackReason?: string;
  tracker: string;
};

export interface FaceTrackingProvider {
  track(request: FaceTrackingRequest): Promise<FaceTrackingResult>;
}

export class HttpFaceTrackingProvider implements FaceTrackingProvider {
  public constructor(
    private readonly endpoint: string,
    private readonly apiKey: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async track(request: FaceTrackingRequest): Promise<FaceTrackingResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FACE_TRACKER_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          projectId: request.projectId,
          videoId: request.videoId,
          proxyObjectKey: request.proxyObjectKey,
          sourceTimebase: "absolute-video-seconds",
          coordinateSpace: "normalized",
          clips: request.clips,
        }),
        signal: controller.signal,
      });
      if (!response.ok) return fallbackResult(`Face tracker returned HTTP ${response.status}`);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return fallbackResult("Face tracker returned invalid JSON");
      }
      const cropTracks = normalizeFaceTrackerResponse(payload, request);
      return cropTracks.length
        ? { cropTracks, cropStrategy: "face_track", tracker: "http" }
        : fallbackResult("Face tracker returned no usable tracks");
    } catch (error) {
      return fallbackResult(error instanceof Error && error.name === "AbortError" ? "Face tracker timed out" : "Face tracker request failed");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createFaceTrackingProvider(): FaceTrackingProvider | null {
  const endpoint = process.env.FACE_TRACKER_URL?.trim();
  if (!endpoint) return null;
  return new HttpFaceTrackingProvider(endpoint, process.env.FACE_TRACKER_API_KEY?.trim() || undefined);
}

export async function trackWithOptionalProvider(request: FaceTrackingRequest): Promise<FaceTrackingResult> {
  const provider = createFaceTrackingProvider();
  if (!provider) return fallbackResult("FACE_TRACKER_URL is not configured");
  return provider.track(request);
}

export function normalizeFaceTrackerResponse(payload: unknown, request: FaceTrackingRequest): CropTrack[] {
  const candidates = extractCandidates(payload, request);
  return request.clips
    .map((clip) => {
      const selected = choosePrimaryCropTrack(candidates.filter((candidate) => candidate.clipId === clip.id));
      if (!selected) return null;
      const parsed = cropTrackSchema.safeParse(selected);
      return parsed.success && parsed.data.tracks.length ? parsed.data : null;
    })
    .filter((track): track is CropTrack => track !== null);
}

function extractCandidates(payload: unknown, request: FaceTrackingRequest): CropTrack[] {
  const entries = responseEntries(payload, request);
  const candidates: CropTrack[] = [];
  for (const entry of entries) {
    const record = asRecord(entry.value);
    if (!record) continue;
    const clip = request.clips.find((item) => item.id === entry.clipId);
    if (!clip) continue;
    const subjectId = readString(record.subjectId ?? record.trackId ?? record.id);
    const rawPoints = arrayValue(record.tracks ?? record.points ?? record.faces ?? record.detections) ?? (looksLikePoint(record) ? [record] : []);
    const tracks = rawPoints
      .map((point) => normalizePoint(point, clip, subjectId, request))
      .filter((point): point is CropTrackPoint => point !== null)
      .sort((a, b) => a.startSec - b.startSec || b.confidence - a.confidence);
    if (!tracks.length) continue;
    candidates.push({ clipId: clip.id, timebase: "absolute-video-seconds", coordinateSpace: "normalized", ...(subjectId ? { subjectId } : {}), tracks });
  }
  const merged = new Map<string, CropTrack>();
  for (const candidate of candidates) {
    const key = `${candidate.clipId}:${candidate.subjectId ?? "unknown"}`;
    const existing = merged.get(key);
    if (existing) existing.tracks.push(...candidate.tracks);
    else merged.set(key, { ...candidate, tracks: [...candidate.tracks] });
  }
  return [...merged.values()].map((candidate) => ({ ...candidate, tracks: candidate.tracks.sort((a, b) => a.startSec - b.startSec || b.confidence - a.confidence) }));
}

function responseEntries(payload: unknown, request: FaceTrackingRequest): Array<{ clipId: string | undefined; value: unknown }> {
  const activeRequestClipId = request.clips.length === 1 ? request.clips[0]?.id : undefined;
  if (Array.isArray(payload)) return payload.map((value) => ({ clipId: readString(asRecord(value)?.clipId) ?? activeRequestClipId, value }));
  const root = asRecord(payload);
  if (!root) return [];

  const rootClipId = readString(root.clipId);
  const rootPoints = root.tracks ?? root.points ?? root.faces ?? root.detections;
  const nestedTracks = arrayValue(rootPoints)?.some((value) => {
    const record = asRecord(value);
    return record?.tracks !== undefined || record?.points !== undefined || record?.faces !== undefined || record?.detections !== undefined;
  }) ?? false;
  if (rootPoints !== undefined && !nestedTracks && (rootClipId || activeRequestClipId)) {
    return [{ clipId: rootClipId ?? activeRequestClipId, value: root }];
  }

  const clips = arrayValue(root.clips ?? root.results ?? root.tracks);
  if (clips) return clips.map((value) => ({ clipId: readString(asRecord(value)?.clipId ?? asRecord(value)?.id) ?? activeRequestClipId, value }));

  return Object.entries(root).flatMap(([clipId, value]) => {
    if (clipId === "metadata" || clipId === "sourceTimebase" || clipId === "coordinateSpace") return [];
    return [{ clipId, value }];
  });
}

function normalizePoint(value: unknown, clip: FaceTrackingClip, subjectId: string | undefined, request: FaceTrackingRequest): CropTrackPoint | null {
  const record = asRecord(value);
  if (!record) return null;
  const box = asRecord(record.bbox ?? record.boundingBox);
  const startSec = readNumber(record.startSec ?? record.start ?? record.startTime ?? record.timestamp);
  const endSec = readNumber(record.endSec ?? record.end ?? record.endTime) ?? (startSec === null ? null : startSec + 0.25);
  if (startSec === null || endSec === null) return null;

  const x = readNumber(record.focusX ?? record.centerX ?? record.cx ?? record.x ?? box?.centerX ?? box?.x);
  const y = readNumber(record.focusY ?? record.centerY ?? record.cy ?? record.y ?? box?.centerY ?? box?.y);
  const boxWidth = readNumber(record.width ?? record.w ?? box?.width ?? box?.w);
  const boxHeight = readNumber(record.height ?? record.h ?? box?.height ?? box?.h);
  const focusX = normalizedCoordinate(x === null ? null : boxWidth === null ? x : x + boxWidth / 2, request.sourceWidth);
  const focusY = normalizedCoordinate(y === null ? null : boxHeight === null ? y : y + boxHeight / 2, request.sourceHeight);
  if (focusX === null || focusY === null) return null;

  const clampedStart = Math.max(clip.startSec, startSec);
  const clampedEnd = Math.min(clip.endSec, endSec);
  if (clampedEnd <= clampedStart) return null;
  const confidence = clamp(readNumber(record.confidence ?? record.score ?? record.probability) ?? 1, 0, 1);
  const faceArea = clamp(readNumber(record.faceArea ?? record.area ?? record.size) ?? 0, 0, 1);
  return {
    startSec: clampedStart,
    endSec: clampedEnd,
    focusX,
    focusY,
    confidence,
    ...(subjectId ? { subjectId } : {}),
    ...(faceArea > 0 ? { faceArea } : {}),
  };
}

function normalizedCoordinate(value: number | null, sourceSize: number | null | undefined) {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return value;
  if (sourceSize && sourceSize > 0) return clamp(value / sourceSize, 0, 1);
  return null;
}

function looksLikePoint(value: Record<string, unknown>) {
  return value.focusX !== undefined || value.focusY !== undefined || value.centerX !== undefined || value.x !== undefined || value.bbox !== undefined;
}

function fallbackResult(fallbackReason: string): FaceTrackingResult {
  return { cropTracks: [], cropStrategy: "source_center", fallbackReason, tracker: "fallback" };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayValue(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
