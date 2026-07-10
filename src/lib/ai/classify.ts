import Cerebras from "@cerebras/cerebras_cloud_sdk";
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

type ChatCompletionWithText = {
  choices?: Array<{
    message?: {
      content?: string | null;
    } | null;
  }>;
};

let client: Cerebras | undefined;

function getClient() {
  if (!env.CEREBRAS_API_KEY) {
    throw new Error("CEREBRAS_API_KEY is not configured.");
  }
  client ??= new Cerebras({ apiKey: env.CEREBRAS_API_KEY });
  return client;
}

export function canClassify(): boolean {
  return Boolean(env.CEREBRAS_API_KEY);
}

export async function classifyRelease(input: ClassificationInput): Promise<UpscAnalysis> {
  const response = await getClient().chat.completions.create({
    model: env.CEREBRAS_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: userPrompt({
          title: input.title,
          ministry: input.ministry || "Not available from source.",
          publishedDate: input.publishedDate.toISOString(),
          category: input.category || "Not available from source.",
          sourceUrl: input.sourceUrl,
          articleText: clampText(input.articleText, 45_000),
          pdfText: input.pdfText ? clampText(input.pdfText, 30_000) : null
        })
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "upsc_analysis",
        strict: true,
        schema: upscAnalysisJsonSchema
      }
    },
    reasoning_effort: "low",
    temperature: 0.2
  });

  const text = (response as ChatCompletionWithText).choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Cerebras did not return structured output.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Cerebras returned invalid JSON.");
  }

  const analysis = upscAnalysisSchema.parse(parsed);

  if (analysis.is_upsc_relevant !== (analysis.relevance_score >= 5)) {
    throw new Error("AI relevance boolean and score are inconsistent.");
  }

  return analysis;
}
