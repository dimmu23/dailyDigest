import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";
import { clampText } from "@/lib/text";
import { SYSTEM_PROMPT, userPrompt } from "@/lib/ai/prompt";
import {
  upscAnalysisJsonSchema,
  upscAnalysisSchema,
  type UpscAnalysis
} from "@/lib/ai/schema";

export type ClassificationInput = {
  title: string;
  ministry?: string | null;
  publishedDate: Date;
  category?: string | null;
  sourceUrl: string;
  articleText: string;
  pdfText?: string | null;
};

let client: GoogleGenAI | undefined;

function getClient() {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

export function canClassify(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

export async function classifyRelease(input: ClassificationInput): Promise<UpscAnalysis> {
  const response = await getClient().models.generateContent({
    model: env.GEMINI_MODEL,
    contents: userPrompt({
      title: input.title,
      ministry: input.ministry || "Not available from source.",
      publishedDate: input.publishedDate.toISOString(),
      category: input.category || "Not available from source.",
      sourceUrl: input.sourceUrl,
      articleText: clampText(input.articleText, 45_000),
      pdfText: input.pdfText ? clampText(input.pdfText, 30_000) : null
    }),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: upscAnalysisJsonSchema,
      temperature: 0.2
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini did not return structured output.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON.");
  }

  const analysis = upscAnalysisSchema.parse(parsed);

  if (analysis.is_upsc_relevant !== (analysis.relevance_score >= 5)) {
    throw new Error("AI relevance boolean and score are inconsistent.");
  }

  return analysis;
}
