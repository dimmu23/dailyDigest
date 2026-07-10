import { z } from "zod";
import { GS_PAPERS, NOT_AVAILABLE, UPSC_TAGS } from "@/lib/constants";

export const upscAnalysisSchema = z.object({
  is_upsc_relevant: z.boolean(),
  relevance_score: z.number().int().min(1).max(10),
  summary: z.string().min(1).max(1600),
  prelims_relevance: z.boolean(),
  mains_relevance: z.boolean(),
  gs_papers: z.array(z.enum(GS_PAPERS)).max(GS_PAPERS.length),
  essay_relevance: z.boolean(),
  optional_relevance: z.string().min(1).max(240),
  tags: z.array(z.enum(UPSC_TAGS)).max(UPSC_TAGS.length),
  why_important: z.array(z.string().min(1).max(320)).min(3).max(5),
  low_confidence_fields: z.array(z.string().min(1).max(120)).max(10)
});

export type UpscAnalysis = z.infer<typeof upscAnalysisSchema>;

export const upscAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    is_upsc_relevant: { type: "boolean" },
    relevance_score: { type: "integer", minimum: 1, maximum: 10 },
    summary: { type: "string" },
    prelims_relevance: { type: "boolean" },
    mains_relevance: { type: "boolean" },
    gs_papers: {
      type: "array",
      items: { type: "string", enum: [...GS_PAPERS] }
    },
    essay_relevance: { type: "boolean" },
    optional_relevance: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string", enum: [...UPSC_TAGS] }
    },
    why_important: {
      type: "array",
      items: { type: "string" }
    },
    low_confidence_fields: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "is_upsc_relevant",
    "relevance_score",
    "summary",
    "prelims_relevance",
    "mains_relevance",
    "gs_papers",
    "essay_relevance",
    "optional_relevance",
    "tags",
    "why_important",
    "low_confidence_fields"
  ]
} as const;

export function fallbackAnalysis(): UpscAnalysis {
  return {
    is_upsc_relevant: false,
    relevance_score: 1,
    summary: NOT_AVAILABLE,
    prelims_relevance: false,
    mains_relevance: false,
    gs_papers: [],
    essay_relevance: false,
    optional_relevance: NOT_AVAILABLE,
    tags: [],
    why_important: [NOT_AVAILABLE, NOT_AVAILABLE, NOT_AVAILABLE],
    low_confidence_fields: ["summary", "why_important"]
  };
}
