import { describe, expect, it } from "vitest";
import { upscAnalysisSchema } from "@/lib/ai/schema";

const valid = {
  is_upsc_relevant: true,
  relevance_score: 8,
  summary: "The official release describes a national biodiversity report.",
  prelims_relevance: true,
  mains_relevance: true,
  gs_papers: ["GS3"],
  essay_relevance: false,
  optional_relevance: "Not available from source.",
  tags: ["Environment", "Reports/Indices"],
  why_important: [
    "It presents an official national assessment.",
    "It describes conservation initiatives.",
    "It identifies implementation institutions."
  ],
  low_confidence_fields: []
};

describe("UPSC AI contract", () => {
  it("accepts bounded controlled output", () => {
    expect(upscAnalysisSchema.parse(valid).relevance_score).toBe(8);
  });

  it("rejects unknown tags and out-of-range scores", () => {
    expect(() =>
      upscAnalysisSchema.parse({ ...valid, relevance_score: 11, tags: ["Celebrity News"] })
    ).toThrow();
  });

  it("requires three to five importance bullets", () => {
    expect(() => upscAnalysisSchema.parse({ ...valid, why_important: ["Only one"] })).toThrow();
  });
});

