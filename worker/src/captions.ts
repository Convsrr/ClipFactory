import { writeFile } from "node:fs/promises";
import {
  captionPresetKeySchema,
  type CaptionPresetKey,
  type CaptionTimingStrategy,
  type TranscriptSegment,
  type TranscriptWord,
} from "./media-types.js";

export type CaptionPreset = {
  key: CaptionPresetKey;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textTransform: "none" | "uppercase";
  primaryColour: string;
  highlightColour: string;
  outlineColour: string;
  backgroundColour: string;
  position: "top" | "middle" | "bottom";
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
  outline: number;
  shadow: number;
  maxWordsPerPhrase: number;
  maxCharsPerLine: number;
  maxLines: 2;
  wordHighlight: boolean;
  safeMarginTop: number;
  safeMarginBottom: number;
};

export type CaptionWord = {
  startSec: number;
  endSec: number;
  text: string;
  confidence?: number;
};

export type CaptionPhrase = {
  startSec: number;
  endSec: number;
  words: CaptionWord[];
  text: string;
};

export type CaptionTrack = {
  durationSec: number;
  timingStrategy: CaptionTimingStrategy;
  phrases: CaptionPhrase[];
  assEventCount: number;
};

export type CaptionFileOptions = {
  text: string;
  durationSec: number;
  presetKey: CaptionPresetKey | string;
  clipStartSec?: number;
  clipEndSec?: number;
  words?: TranscriptWord[];
  segments?: TranscriptSegment[];
};

const CAPTION_PRESETS: Record<CaptionPresetKey, CaptionPreset> = {
  "bold-viral": {
    key: "bold-viral",
    fontFamily: "Arial",
    fontSize: 76,
    fontWeight: 700,
    textTransform: "uppercase",
    primaryColour: "&H00FFFFFF",
    highlightColour: "&H0000D7FF",
    outlineColour: "&H00111111",
    backgroundColour: "&H70000000",
    position: "bottom",
    alignment: 2,
    marginL: 96,
    marginR: 96,
    marginV: 300,
    outline: 5,
    shadow: 2,
    maxWordsPerPhrase: 4,
    maxCharsPerLine: 22,
    maxLines: 2,
    wordHighlight: true,
    safeMarginTop: 260,
    safeMarginBottom: 300,
  },
  "minimal-clean": {
    key: "minimal-clean",
    fontFamily: "Arial",
    fontSize: 58,
    fontWeight: 400,
    textTransform: "none",
    primaryColour: "&H00FFFFFF",
    highlightColour: "&H0000D7FF",
    outlineColour: "&H00202020",
    backgroundColour: "&H60000000",
    position: "bottom",
    alignment: 2,
    marginL: 112,
    marginR: 112,
    marginV: 270,
    outline: 2,
    shadow: 1,
    maxWordsPerPhrase: 5,
    maxCharsPerLine: 28,
    maxLines: 2,
    wordHighlight: false,
    safeMarginTop: 240,
    safeMarginBottom: 270,
  },
  podcast: {
    key: "podcast",
    fontFamily: "Arial",
    fontSize: 64,
    fontWeight: 700,
    textTransform: "uppercase",
    primaryColour: "&H00FFFFFF",
    highlightColour: "&H0000D7FF",
    outlineColour: "&H00352962",
    backgroundColour: "&H70000000",
    position: "bottom",
    alignment: 2,
    marginL: 104,
    marginR: 104,
    marginV: 286,
    outline: 4,
    shadow: 1,
    maxWordsPerPhrase: 6,
    maxCharsPerLine: 27,
    maxLines: 2,
    wordHighlight: true,
    safeMarginTop: 250,
    safeMarginBottom: 286,
  },
};

export function getCaptionPreset(presetKey: CaptionPresetKey | string): CaptionPreset {
  const parsed = captionPresetKeySchema.safeParse(presetKey);
  return CAPTION_PRESETS[parsed.success ? parsed.data : "minimal-clean"];
}

export function clipTranscriptWords(words: TranscriptWord[], clipStartSec: number, clipEndSec: number): CaptionWord[] {
  return words
    .filter((word) => word.endSec > clipStartSec && word.startSec < clipEndSec && word.text.trim())
    .map((word) => ({
      startSec: Math.max(clipStartSec, word.startSec) - clipStartSec,
      endSec: Math.min(clipEndSec, word.endSec) - clipStartSec,
      text: word.text.trim(),
      ...(word.confidence === undefined ? {} : { confidence: word.confidence }),
    }))
    .filter((word) => word.endSec > word.startSec && Number.isFinite(word.startSec) && Number.isFinite(word.endSec))
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
}

export function segmentCaptionWords(words: CaptionWord[], durationSec: number, preset: CaptionPreset): CaptionPhrase[] {
  const validWords = words
    .map((word) => ({ ...word, startSec: clamp(word.startSec, 0, durationSec), endSec: clamp(word.endSec, 0, durationSec) }))
    .filter((word) => word.endSec > word.startSec && word.text.trim());
  if (!validWords.length) return [];

  const phrases: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  for (const word of validWords) {
    const previous = current.at(-1);
    const candidateText = [...current, word].map((item) => item.text).join(" ");
    const hardBreak = previous ? endsSentence(previous.text) || word.startSec - previous.endSec >= 0.55 : false;
    const exceedsWords = current.length >= preset.maxWordsPerPhrase;
    const exceedsChars = candidateText.length > preset.maxCharsPerLine * preset.maxLines;
    if (current.length && (hardBreak || exceedsWords || exceedsChars)) {
      phrases.push(current);
      current = [];
    }
    current.push(word);
  }
  if (current.length) phrases.push(current);

  return mergeShortPhrases(phrases, preset, durationSec).map((phraseWords) => makePhrase(phraseWords, preset, durationSec));
}

export function buildCaptionTrack(options: CaptionFileOptions): CaptionTrack {
  const durationSec = Math.max(0.01, options.durationSec);
  const clipStartSec = options.clipStartSec ?? 0;
  const clipEndSec = options.clipEndSec ?? clipStartSec + durationSec;
  const preset = getCaptionPreset(options.presetKey);
  const words = options.words ? clipTranscriptWords(options.words, clipStartSec, clipEndSec) : [];
  if (words.length) {
    const phrases = segmentCaptionWords(words, durationSec, preset);
    return { durationSec, timingStrategy: "word", phrases, assEventCount: preset.wordHighlight ? phrases.reduce((count, phrase) => count + phrase.words.length, 0) : phrases.length };
  }

  const segments = options.segments ? clipTranscriptSegments(options.segments, clipStartSec, clipEndSec, durationSec) : [];
  if (segments.length) {
    const phrases = segments.flatMap((segment) => {
      const segmentWords = distributeText(segment.text, segment.startSec, segment.endSec);
      return segmentCaptionWords(segmentWords, durationSec, preset);
    });
    return { durationSec, timingStrategy: "segment", phrases, assEventCount: phrases.length };
  }

  const estimatedWords = distributeText(options.text, 0, durationSec);
  const phrases = segmentCaptionWords(estimatedWords, durationSec, preset);
  return { durationSec, timingStrategy: "estimated", phrases, assEventCount: phrases.length };
}

export async function writeCaptionFile(path: string, options: CaptionFileOptions): Promise<CaptionTrack>;
export async function writeCaptionFile(path: string, text: string, durationSec: number, presetKey: string, words?: TranscriptWord[], segments?: TranscriptSegment[]): Promise<CaptionTrack>;
export async function writeCaptionFile(
  path: string,
  optionsOrText: CaptionFileOptions | string,
  durationSec?: number,
  presetKey?: string,
  words?: TranscriptWord[],
  segments?: TranscriptSegment[],
) {
  const options: CaptionFileOptions = typeof optionsOrText === "string"
    ? { text: optionsOrText, durationSec: durationSec ?? 0.01, presetKey: presetKey ?? "minimal-clean", words, segments }
    : optionsOrText;
  const preset = getCaptionPreset(options.presetKey);
  const track = buildCaptionTrack(options);
  const ass = buildAssFile(track, preset);
  await writeFile(path, ass, "utf8");
  return track;
}

export function buildAssFile(track: CaptionTrack, preset: CaptionPreset): string {
  const events = track.phrases.flatMap((phrase) => {
    if (track.timingStrategy === "word" && preset.wordHighlight && phrase.words.length > 1) {
      return phrase.words.map((_, index) => ({
        startSec: index === 0 ? phrase.startSec : phrase.words[index]?.startSec ?? phrase.startSec,
        endSec: index + 1 < phrase.words.length ? phrase.words[index + 1]?.startSec ?? phrase.endSec : phrase.endSec,
        text: layoutWords(phrase.words, preset, index),
      })).filter((event) => event.endSec > event.startSec);
    }
    return [{ startSec: phrase.startSec, endSec: phrase.endSec, text: phrase.text }];
  });

  const eventLines = events.flatMap((event) => {
    const endSec = Math.min(track.durationSec, Math.max(event.endSec, event.startSec + 0.01));
    return endSec > event.startSec
      ? [`Dialogue: 0,${assTime(event.startSec)},${assTime(endSec)},Default,,0,0,0,,${event.text}`]
      : [];
  });
  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: Default,${preset.fontFamily},${preset.fontSize},${preset.primaryColour},${preset.highlightColour},${preset.outlineColour},${preset.backgroundColour},${preset.fontWeight >= 700 ? -1 : 0},0,0,0,100,100,0,0,1,${preset.outline},${preset.shadow},${preset.alignment},${preset.marginL},${preset.marginR},${preset.marginV},1`,
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ...eventLines,
    "",
  ];
  return lines.join("\n");
}

export function escapeAssText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("\r", "")
    .replaceAll("\n", "\\N");
}

export function assTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds * 100) / 100);
  const totalCentiseconds = Math.round(safe * 100);
  const hours = Math.floor(totalCentiseconds / 360000);
  const minutes = Math.floor((totalCentiseconds % 360000) / 6000);
  const whole = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function clipTranscriptSegments(segments: TranscriptSegment[], clipStartSec: number, clipEndSec: number, durationSec: number) {
  return segments
    .filter((segment) => segment.endSec > clipStartSec && segment.startSec < clipEndSec && segment.text.trim())
    .map((segment) => ({
      text: segment.text.trim(),
      startSec: clamp(Math.max(segment.startSec, clipStartSec) - clipStartSec, 0, durationSec),
      endSec: clamp(Math.min(segment.endSec, clipEndSec) - clipStartSec, 0, durationSec),
    }))
    .filter((segment) => segment.endSec > segment.startSec);
}

function distributeText(text: string, startSec: number, endSec: number): CaptionWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || endSec <= startSec) return [];
  const duration = endSec - startSec;
  return tokens.map((token, index) => ({
    startSec: startSec + duration * (index / tokens.length),
    endSec: startSec + duration * ((index + 1) / tokens.length),
    text: token,
  }));
}

function makePhrase(words: CaptionWord[], preset: CaptionPreset, durationSec: number): CaptionPhrase {
  const safeWords = words.map((word) => ({ ...word, text: word.text.trim() })).filter((word) => word.text);
  const startSec = clamp(safeWords[0]?.startSec ?? 0, 0, durationSec);
  const endSec = clamp(safeWords.at(-1)?.endSec ?? startSec + 0.01, startSec + 0.01, durationSec);
  return { startSec, endSec, words: safeWords, text: layoutWords(safeWords, preset) };
}

function mergeShortPhrases(phrases: CaptionWord[][], preset: CaptionPreset, durationSec: number) {
  const result: CaptionWord[][] = [];
  for (const phrase of phrases) {
    const previous = result.at(-1);
    if (phrase.length === 1 && previous && previous.length + phrase.length <= preset.maxWordsPerPhrase && !endsSentence(previous.at(-1)?.text ?? "")) {
      previous.push(...phrase);
    } else if (previous && previous.length === 1 && previous.length + phrase.length <= preset.maxWordsPerPhrase && !endsSentence(previous.at(-1)?.text ?? "")) {
      result[result.length - 1] = [...previous, ...phrase];
    } else {
      result.push([...phrase]);
    }
  }
  return result.map((phrase) => phrase.filter((word) => word.startSec < durationSec && word.endSec > 0));
}

function layoutWords(words: CaptionWord[], preset: CaptionPreset, activeIndex?: number) {
  const lines: string[][] = [[]];
  let lineLength = 0;
  words.forEach((word, index) => {
    const transformed = transformWord(word.text, preset);
    const nextLength = lineLength + (lineLength ? 1 : 0) + transformed.length;
    if (lines.at(-1)?.length && nextLength > preset.maxCharsPerLine && lines.length < preset.maxLines) {
      lines.push([]);
      lineLength = 0;
    }
    const content = escapeAssText(transformWord(word.text, preset));
    const rendered = activeIndex === index
      ? `{\\c${preset.highlightColour}}${content}{\\c${preset.primaryColour}}`
      : content;
    lines.at(-1)?.push(rendered);
    lineLength += (lineLength ? 1 : 0) + transformed.length;
  });
  return lines.map((line) => line.join(" ")).join("\\N");
}

function transformWord(value: string, preset: CaptionPreset) {
  return preset.textTransform === "uppercase" ? value.toUpperCase() : value;
}

function endsSentence(value: string) {
  return /[.!?;:]$/.test(value.trim());
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
