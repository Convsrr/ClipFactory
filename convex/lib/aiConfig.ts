export type G0iTask = "analysis" | "hooks" | "title" | "description" | "scoring";

export type G0iConfig = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  models: Record<G0iTask, string[]>;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  maxOutputTokens: number;
  maxCandidates: number;
  maxTranscriptCharsPerChunk: number;
  maxRawResponseChars: number;
};

export function readG0iConfig(): G0iConfig {
  const baseUrl = requiredEnv("G0I_BASE_URL");
  try {
    const parsedBaseUrl = new URL(baseUrl);
    if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") throw new Error("unsupported protocol");
  } catch {
    throw new Error("G0I_BASE_URL must be a valid HTTP(S) URL");
  }

  const sharedModels = parseModelList(optionalEnv("G0I_MODEL"));
  const fallbackModels = parseModelList(optionalEnv("G0I_MODEL_FALLBACKS"));
  const analysisModels = modelCandidates("G0I_MODEL_ANALYSIS", parseModelList(optionalEnv("G0I_MODEL_ANALYSIS")), sharedModels, fallbackModels);
  const titleModels = modelCandidates("G0I_MODEL_TITLE", parseModelList(optionalEnv("G0I_MODEL_TITLE")), sharedModels, analysisModels, fallbackModels);

  return {
    provider: optionalEnv("G0I_PROVIDER") ?? "g0i.ai",
    apiKey: requiredEnv("G0I_API_KEY"),
    baseUrl,
    model: analysisModels[0],
    models: {
      analysis: analysisModels,
      hooks: modelCandidates("G0I_MODEL_HOOKS", parseModelList(optionalEnv("G0I_MODEL_HOOKS")), sharedModels, analysisModels, fallbackModels),
      title: titleModels,
      description: modelCandidates("G0I_MODEL_DESCRIPTION", parseModelList(optionalEnv("G0I_MODEL_DESCRIPTION")), titleModels, sharedModels, analysisModels, fallbackModels),
      scoring: modelCandidates("G0I_MODEL_SCORING", parseModelList(optionalEnv("G0I_MODEL_SCORING")), analysisModels, sharedModels, fallbackModels),
    },
    timeoutMs: numberEnv("G0I_TIMEOUT_MS", 30_000, 1_000, 120_000),
    maxRetries: numberEnv("G0I_MAX_RETRIES", 2, 0, 3, true),
    temperature: numberEnv("G0I_TEMPERATURE", 0.2, 0, 2),
    maxOutputTokens: numberEnv("G0I_MAX_OUTPUT_TOKENS", 6_000, 100, 16_000, true),
    maxCandidates: numberEnv("G0I_MAX_CANDIDATES", 8, 1, 20, true),
    maxTranscriptCharsPerChunk: numberEnv("G0I_MAX_TRANSCRIPT_CHARS", 12_000, 2_000, 50_000, true),
    maxRawResponseChars: numberEnv("G0I_MAX_RAW_RESPONSE_CHARS", 120_000, 1_000, 500_000, true),
  };
}

export function configuredModelName() {
  return parseModelList(optionalEnv("G0I_MODEL") ?? optionalEnv("G0I_MODEL_ANALYSIS"))[0] ?? "unconfigured";
}

function modelCandidates(name: string, ...groups: string[][]) {
  const models = unique(groups.flat());
  if (!models.length) throw new Error(`${name}, G0I_MODEL, or G0I_MODEL_FALLBACKS is not configured`);
  return models;
}

function parseModelList(value: string | undefined) {
  return (value ?? "")
    .split(/[\n,]/)
    .map((model) => model.trim())
    .filter(Boolean);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function requiredEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function numberEnv(name: string, fallback: number, minimum: number, maximum: number, integer = false) {
  const raw = optionalEnv(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be ${integer ? "an integer" : "a number"} between ${minimum} and ${maximum}`);
  }
  return value;
}
