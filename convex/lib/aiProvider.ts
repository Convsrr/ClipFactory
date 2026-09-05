import OpenAI from "openai";
import { z } from "zod";
import { readG0iConfig, type G0iConfig, type G0iTask } from "./aiConfig";
import { buildClipDiscoveryPrompt, CLIP_DISCOVERY_PROMPT_VERSION, CLIP_DISCOVERY_SYSTEM_PROMPT } from "./clipDiscoveryPrompt";
import { clipAnalysisResponseSchema, parseClipAnalysisResponse, type TranscriptChunk } from "./clipAnalysis";

const hooksSchema = z.object({ hooks: z.array(z.string().trim().min(1).max(180)).min(1).max(5) }).strict();
const titleSchema = z.object({ title: z.string().trim().min(1).max(120) }).strict();
const descriptionSchema = z.object({ description: z.string().trim().min(1).max(500) }).strict();
const scoreSchema = z.object({ score: z.number().finite().min(0).max(100), reason: z.string().trim().min(1).max(400) }).strict();

export type ClipAnalysisProviderResult = {
  data: ReturnType<typeof parseClipAnalysisResponse>;
  raw: string;
  model: string;
  promptVersion: string;
};

export class G0iProvider {
  private readonly client: OpenAI;
  private readonly config: G0iConfig;

  constructor(config: G0iConfig = readG0iConfig()) {
    this.config = config;
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl, timeout: config.timeoutMs, maxRetries: 0 });
  }

  get runtimeMetadata() {
    return { provider: this.config.provider, model: this.config.model, promptVersion: CLIP_DISCOVERY_PROMPT_VERSION };
  }

  get maxTranscriptCharsPerChunk() {
    return this.config.maxTranscriptCharsPerChunk;
  }

  get maxCandidates() {
    return this.config.maxCandidates;
  }

  get maxRawResponseChars() {
    return this.config.maxRawResponseChars;
  }

  async analyseTranscriptForClips({ chunk, maxCandidates, videoDurationSec, chunkIndex, chunkCount }: {
    chunk: TranscriptChunk;
    maxCandidates: number;
    videoDurationSec: number | null;
    chunkIndex: number;
    chunkCount: number;
  }): Promise<ClipAnalysisProviderResult> {
    const prompt = buildClipDiscoveryPrompt({ chunk, maxCandidates, videoDurationSec, chunkIndex, chunkCount, maxTranscriptChars: this.config.maxTranscriptCharsPerChunk });
    const response = await this.requestStructured({
      models: this.config.models.analysis,
      schema: clipAnalysisResponseSchema,
      system: CLIP_DISCOVERY_SYSTEM_PROMPT,
      user: prompt,
    });
    return { ...response, data: parseClipAnalysisResponse(response.data), promptVersion: CLIP_DISCOVERY_PROMPT_VERSION };
  }

  async generateHooks(input: { transcriptExcerpt: string; title: string }) {
    return this.requestStructured({
      models: this.config.models.hooks,
      schema: hooksSchema,
      system: "Write concise spoken-video hooks. Return JSON only. Keep each hook faithful to the excerpt. Avoid hype, fake certainty, and invented claims.",
      user: `Return three hook options for this clip.\nTitle: ${input.title}\nTranscript: ${input.transcriptExcerpt}`,
    });
  }

  async generateClipTitle(input: { transcriptExcerpt: string; hook: string }) {
    return this.requestStructured({
      models: this.config.models.title,
      schema: titleSchema,
      system: "Write one specific short-video title. Return JSON only. Use sentence case and no clickbait.",
      user: `Hook: ${input.hook}\nTranscript: ${input.transcriptExcerpt}`,
    });
  }

  async generateClipDescription(input: { transcriptExcerpt: string; title: string }) {
    return this.requestStructured({
      models: this.config.models.description,
      schema: descriptionSchema,
      system: "Write one accurate short-video description. Return JSON only. Use one or two direct sentences and no hashtags.",
      user: `Title: ${input.title}\nTranscript: ${input.transcriptExcerpt}`,
    });
  }

  async scoreClipVirality(input: { transcriptExcerpt: string; hook: string; title: string }) {
    return this.requestStructured({
      models: this.config.models.scoring,
      schema: scoreSchema,
      system: "Score a short clip for clarity, tension, specificity, payoff, and standalone comprehension. Return JSON only. A high score requires strength across all five dimensions.",
      user: `Title: ${input.title}\nHook: ${input.hook}\nTranscript: ${input.transcriptExcerpt}`,
    });
  }

  private async requestStructured<TSchema extends z.ZodType>({ models, schema, system, user }: {
    models: string[];
    schema: TSchema;
    system: string;
    user: string;
  }): Promise<{ data: z.infer<TSchema>; raw: string; model: string }> {
    const failures: string[] = [];
    for (const model of models) {
      try {
        const response = await this.withRetries(() => this.client.chat.completions.create({
          model,
          temperature: this.config.temperature,
          max_tokens: this.config.maxOutputTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }));
        const raw = response.choices[0]?.message.content;
        if (!raw?.trim()) throw new G0iProviderError("g0i.ai returned an empty response", true);

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new G0iProviderError("g0i.ai returned invalid JSON", true);
        }
        const validated = schema.safeParse(parsed);
        if (!validated.success) {
          throw new G0iProviderError(`g0i.ai response failed validation: ${validated.error.issues[0]?.message ?? "unknown schema error"}`, true);
        }
        return { data: validated.data, raw, model };
      } catch (error) {
        failures.push(`${model}: ${providerFailureReason(error)}`);
      }
    }
    throw new Error(`g0i.ai failed with all configured models (${failures.join("; ")})`);
  }

  private async withRetries<T>(operation: () => Promise<T>) {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === this.config.maxRetries) throw normalizeProviderError(error);
        await delay(250 * (2 ** attempt));
      }
    }
    throw normalizeProviderError(lastError);
  }
}

class G0iProviderError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "G0iProviderError";
  }
}

function isRetryable(error: unknown) {
  if (error instanceof G0iProviderError) return error.retryable;
  const status = providerStatus(error);
  if (status !== undefined) return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  return error instanceof TypeError || error instanceof Error && /timeout|timed out|network|fetch failed|connection/i.test(error.message);
}

function normalizeProviderError(error: unknown) {
  if (error instanceof G0iProviderError) return error;
  const status = providerStatus(error);
  if (error instanceof Error && /timeout|timed out/i.test(error.name + error.message)) {
    return new G0iProviderError("g0i.ai request timed out", true);
  }
  if (status === 401 || status === 403) return new G0iProviderError(`g0i.ai authentication failed (HTTP ${status})`, false);
  if (status === 429) return new G0iProviderError("g0i.ai rate limit reached", true);
  if (status !== undefined) return new G0iProviderError(`g0i.ai request failed (HTTP ${status})`, status >= 500 || status === 408);
  return new G0iProviderError("g0i.ai request failed", true);
}

function providerStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function modelForTask(config: G0iConfig, task: G0iTask) {
  return config.models[task][0] ?? config.model;
}

function providerFailureReason(error: unknown) {
  if (error instanceof G0iProviderError) return error.message;
  return "request failed";
}
