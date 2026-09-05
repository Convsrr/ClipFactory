import OpenAI from "openai";
import { z } from "zod";

export const clipCandidateSchema = z.object({
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  score: z.number().min(0).max(100),
  hook: z.string().min(1).max(180),
  title: z.string().min(1).max(120),
  reason: z.string().min(1).max(320),
  summary: z.string().min(1).max(500),
  category: z.string().min(1).max(80),
  transcriptExcerpt: z.string().min(1).max(800),
});

const clipAnalysisSchema = z.object({ candidates: z.array(clipCandidateSchema).max(12) });
const hooksSchema = z.object({ hooks: z.array(z.string().min(1).max(180)).min(1).max(5) });
const titleSchema = z.object({ title: z.string().min(1).max(120) });
const descriptionSchema = z.object({ description: z.string().min(1).max(500) });
const scoreSchema = z.object({ score: z.number().min(0).max(100), reason: z.string().min(1).max(320) });

export type ClipCandidate = z.infer<typeof clipCandidateSchema>;
type TranscriptSegment = { startSec: number; endSec: number; text: string };

export class G0iProvider {
  private readonly client: OpenAI;
  private readonly models: Record<"analysis" | "hooks" | "title" | "description" | "scoring", string>;

  constructor() {
    const apiKey = requiredEnv("G0I_API_KEY");
    this.client = new OpenAI({ apiKey, baseURL: requiredEnv("G0I_BASE_URL") });
    this.models = {
      analysis: requiredEnv("G0I_MODEL_ANALYSIS"),
      hooks: requiredEnv("G0I_MODEL_HOOKS"),
      title: requiredEnv("G0I_MODEL_TITLE"),
      description: process.env.G0I_MODEL_DESCRIPTION || requiredEnv("G0I_MODEL_TITLE"),
      scoring: process.env.G0I_MODEL_SCORING || requiredEnv("G0I_MODEL_ANALYSIS"),
    };
  }

  async analyseTranscriptForClips(segments: TranscriptSegment[]) {
    const transcript = segments.map((segment) => `[${segment.startSec.toFixed(2)}-${segment.endSec.toFixed(2)}] ${segment.text}`).join("\n");
    return this.requestStructured({
      model: this.models.analysis,
      schema: clipAnalysisSchema,
      system: "You are a short-form video editor. Return JSON only. Select self-contained moments with a clear setup and payoff. Keep timestamps inside the supplied transcript. Prefer clips between 20 and 60 seconds. Do not invent words or facts.",
      user: `Analyse this timestamped transcript. Return {"candidates":[...]}. Each candidate needs startSec, endSec, score from 0 to 100, hook, title, reason, summary, category, and an exact transcriptExcerpt.\n\n${transcript}`,
    });
  }

  async generateHooks(input: { transcriptExcerpt: string; title: string }) {
    return this.requestStructured({
      model: this.models.hooks,
      schema: hooksSchema,
      system: "Write concise spoken-video hooks. Return JSON only. Keep each hook faithful to the excerpt. Avoid hype, fake certainty, and invented claims.",
      user: `Return three hook options for this clip.\nTitle: ${input.title}\nTranscript: ${input.transcriptExcerpt}`,
    });
  }

  async generateClipTitle(input: { transcriptExcerpt: string; hook: string }) {
    return this.requestStructured({
      model: this.models.title,
      schema: titleSchema,
      system: "Write one specific short-video title. Return JSON only. Use sentence case and no clickbait.",
      user: `Hook: ${input.hook}\nTranscript: ${input.transcriptExcerpt}`,
    });
  }

  async generateClipDescription(input: { transcriptExcerpt: string; title: string }) {
    return this.requestStructured({
      model: this.models.description,
      schema: descriptionSchema,
      system: "Write one accurate short-video description. Return JSON only. Use one or two direct sentences and no hashtags.",
      user: `Title: ${input.title}\nTranscript: ${input.transcriptExcerpt}`,
    });
  }

  async scoreClipVirality(input: { transcriptExcerpt: string; hook: string; title: string }) {
    return this.requestStructured({
      model: this.models.scoring,
      schema: scoreSchema,
      system: "Score a short clip for clarity, tension, specificity, payoff, and standalone comprehension. Return JSON only. A high score requires strength across all five dimensions.",
      user: `Title: ${input.title}\nHook: ${input.hook}\nTranscript: ${input.transcriptExcerpt}`,
    });
  }

  private async requestStructured<TSchema extends z.ZodType>({ model, schema, system, user }: { model: string; schema: TSchema; system: string; user: string }): Promise<{ data: z.infer<TSchema>; raw: string; model: string }> {
    const response = await this.client.chat.completions.create({
      model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const raw = response.choices[0]?.message.content;
    if (!raw) throw new Error("g0i.ai returned an empty response");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("g0i.ai returned invalid JSON");
    }
    const validated = schema.safeParse(parsed);
    if (!validated.success) throw new Error(`g0i.ai response failed validation: ${validated.error.issues[0]?.message ?? "unknown schema error"}`);
    return { data: validated.data, raw, model };
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
