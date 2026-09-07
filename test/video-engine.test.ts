import assert from "node:assert/strict";
import test from "node:test";
import { buildCaptionTrack, escapeAssText, getCaptionPreset, clipTranscriptWords, segmentCaptionWords } from "../worker/src/captions";
import { buildCropPlan, choosePrimaryCropTrack, calculateCropGeometry, smoothFocusPoints, type CropPlan } from "../worker/src/crop";
import { normalizeFaceTrackerResponse } from "../worker/src/face-tracking";
import { buildPositionExpression, buildVerticalVideoFilter } from "../worker/src/ffmpeg";
import type { CropTrack, CropTrackPoint, TranscriptWord } from "../worker/src/media-types";

const landscape = { width: 1920, height: 1080, fps: 30 };

function point(overrides: Partial<CropTrackPoint> = {}): CropTrackPoint {
  return {
    startSec: 0,
    endSec: 4,
    focusX: 0.5,
    focusY: 0.5,
    confidence: 0.95,
    ...overrides,
  };
}

function track(overrides: Partial<CropTrack> = {}): CropTrack {
  return {
    clipId: "clip-1",
    timebase: "absolute-video-seconds",
    coordinateSpace: "normalized",
    tracks: [point()],
    ...overrides,
  };
}

test("16:9 sources produce an even 9:16 crop window", () => {
  const geometry = calculateCropGeometry(landscape);
  assert.equal(geometry.mode, "crop");
  assert.equal(geometry.cropHeight, 1080);
  assert.equal(geometry.cropWidth, 608);
  assert.equal(geometry.maxX, 1312);
});

test("native portrait sources are not cropped again", () => {
  const geometry = calculateCropGeometry({ width: 1080, height: 1920 });
  assert.equal(geometry.mode, "crop");
  assert.equal(geometry.cropWidth, 1080);
  assert.equal(geometry.cropHeight, 1920);
  assert.equal(geometry.maxX, 0);
});

test("very tall sources use fit mode instead of invalid cropping", () => {
  const geometry = calculateCropGeometry({ width: 800, height: 1600 });
  assert.equal(geometry.mode, "fit");
  assert.equal(geometry.maxX, 0);
});

test("dynamic crop positions stay within source bounds", () => {
  const plan = buildCropPlan({
    clipId: "clip-1",
    clipStartSec: 10,
    clipEndSec: 14,
    source: landscape,
    cropTrack: track({ tracks: [point({ startSec: 10, endSec: 12, focusX: 0 }), point({ startSec: 12, endSec: 14, focusX: 1 })] }),
  });
  assert.ok(plan.keyframes.every((keyframe) => keyframe.x >= 0 && keyframe.x <= plan.geometry.maxX));
  assert.ok(plan.keyframes.every((keyframe) => keyframe.y >= 0 && keyframe.y <= plan.geometry.maxY));
});

test("crop smoothing limits a sudden focal jump", () => {
  const smoothed = smoothFocusPoints({
    points: [point({ startSec: 0, endSec: 1, focusX: 0.4 }), point({ startSec: 1, endSec: 2, focusX: 0.75 })],
    durationSec: 2,
    tuning: { sampleIntervalSec: 1 },
  });
  const atJump = smoothed.find((item) => item.timeSec === 1);
  assert.ok(atJump);
  assert.ok(atJump.centerX > 0.4 && atJump.centerX < 0.75);
});

test("scene boundaries allow a new subject position immediately", () => {
  const smoothed = smoothFocusPoints({
    points: [point({ startSec: 0, endSec: 2, focusX: 0.2 }), point({ startSec: 2, endSec: 4, focusX: 0.8 })],
    durationSec: 4,
    sceneCuts: [2],
    tuning: { sampleIntervalSec: 1 },
  });
  assert.equal(smoothed.find((item) => item.timeSec === 2)?.centerX, 0.8);
});

test("low-confidence tracking falls back to deterministic centre framing", () => {
  const plan = buildCropPlan({
    clipId: "clip-1",
    clipStartSec: 0,
    clipEndSec: 4,
    source: landscape,
    cropTrack: track({ tracks: [point({ confidence: 0.2, focusX: 0.9 })] }),
  });
  assert.equal(plan.strategy, "source_center");
  assert.ok(plan.keyframes.every((keyframe) => Math.abs(keyframe.centerX - 0.5) < 0.001));
});

test("multiple faces choose a persistent high-confidence primary deterministically", () => {
  const selected = choosePrimaryCropTrack([
    track({ subjectId: "guest", tracks: [point({ endSec: 1, confidence: 0.85, faceArea: 0.2 })] }),
    track({ subjectId: "host", tracks: [point({ endSec: 5, confidence: 0.9, faceArea: 0.1 })] }),
  ]);
  assert.equal(selected?.subjectId, "host");
});

test("face tracker responses are normalized per clip and malformed data is ignored", () => {
  const result = normalizeFaceTrackerResponse({
    tracks: [{
      clipId: "clip-1",
      subjectId: "host",
      tracks: [{ startSec: 0, endSec: 2, focusX: 0.65, focusY: 0.5, confidence: 0.9 }],
    }],
  }, { projectId: "project", videoId: "video", proxyObjectKey: "proxy", clips: [{ id: "clip-1", startSec: 0, endSec: 2 }] });
  assert.equal(result[0]?.clipId, "clip-1");
  assert.equal(result[0]?.tracks[0]?.focusX, 0.65);
  assert.deepEqual(normalizeFaceTrackerResponse({ unexpected: "shape" }, { projectId: "project", videoId: "video", proxyObjectKey: null, clips: [{ id: "clip-1", startSec: 0, endSec: 2 }] }), []);
});

test("absolute transcript words become clip-relative timestamps", () => {
  const words: TranscriptWord[] = [
    { startSec: 124.3, endSec: 124.55, text: "This" },
    { startSec: 124.61, endSec: 124.75, text: "is" },
    { startSec: 124.8, endSec: 124.95, text: "the" },
  ];
  assert.deepEqual(clipTranscriptWords(words, 124.3, 125).map((word) => Number(word.startSec.toFixed(2))), [0, 0.31, 0.5]);
});

test("word captions break on punctuation and remain readable", () => {
  const preset = getCaptionPreset("bold-viral");
  const phrases = segmentCaptionWords([
    { startSec: 0, endSec: 0.2, text: "This" },
    { startSec: 0.2, endSec: 0.4, text: "works." },
    { startSec: 0.4, endSec: 0.6, text: "Next" },
    { startSec: 0.6, endSec: 0.8, text: "idea" },
  ], 1, preset);
  assert.equal(phrases.length, 2);
  assert.equal(phrases[0]?.text, "THIS WORKS.");
});

test("long captions are split and extremely short phrases are merged", () => {
  const preset = getCaptionPreset("minimal-clean");
  const phrases = segmentCaptionWords([
    { startSec: 0, endSec: 0.2, text: "One" },
    { startSec: 0.2, endSec: 0.4, text: "small" },
    { startSec: 0.4, endSec: 0.6, text: "change" },
    { startSec: 0.6, endSec: 0.8, text: "can" },
    { startSec: 0.8, endSec: 1, text: "make" },
    { startSec: 1, endSec: 1.2, text: "your" },
    { startSec: 1.2, endSec: 1.4, text: "content" },
  ], 2, preset);
  assert.ok(phrases.length >= 2);
  assert.ok(phrases.every((phrase) => phrase.words.length >= 2 || phrase === phrases.at(-1)));
});

test("caption timing is monotonic, non-negative, and bounded to the clip", () => {
  const track = buildCaptionTrack({
    text: "fallback text",
    durationSec: 2,
    clipStartSec: 10,
    clipEndSec: 12,
    presetKey: "bold-viral",
    words: [
      { startSec: 9.5, endSec: 10.2, text: "Start" },
      { startSec: 11.8, endSec: 12.5, text: "finish" },
    ],
  });
  assert.equal(track.timingStrategy, "word");
  for (let index = 0; index < track.phrases.length; index += 1) {
    const phrase = track.phrases[index];
    assert.ok(phrase.startSec >= 0);
    assert.ok(phrase.endSec <= 2);
    if (index) assert.ok(phrase.startSec >= (track.phrases[index - 1]?.startSec ?? 0));
  }
});

test("caption timing falls back from words to segments to estimated text", () => {
  assert.equal(buildCaptionTrack({ text: "Segment fallback", durationSec: 2, presetKey: "minimal-clean", segments: [{ startSec: 0, endSec: 2, text: "Segment fallback" }] }).timingStrategy, "segment");
  assert.equal(buildCaptionTrack({ text: "Estimated fallback", durationSec: 2, presetKey: "minimal-clean" }).timingStrategy, "estimated");
});

test("ASS escaping protects text and dynamic crop uses a bounded expression", () => {
  assert.equal(escapeAssText("A {literal}\\ path"), "A \\{literal\\}\\\\ path");
  const plan: CropPlan = buildCropPlan({ clipId: "clip-1", clipStartSec: 0, clipEndSec: 4, source: landscape, cropTrack: track({ tracks: [point({ focusX: 0.2 }), point({ startSec: 2, endSec: 4, focusX: 0.8 })] }) });
  const expression = buildPositionExpression(plan.keyframes, "x", plan.geometry.maxX);
  assert.match(expression, /if\(/);
  assert.match(expression, /\\,/);
  assert.match(buildVerticalVideoFilter(plan), /scale=1080:1920/);
});

test("caption presets expose safe zones and validated keys", () => {
  for (const key of ["bold-viral", "minimal-clean", "podcast"] as const) {
    const preset = getCaptionPreset(key);
    assert.ok(preset.safeMarginTop > 200);
    assert.ok(preset.safeMarginBottom > 200);
    assert.ok(preset.maxLines <= 2);
  }
  assert.equal(getCaptionPreset("not-a-preset").key, "minimal-clean");
});
