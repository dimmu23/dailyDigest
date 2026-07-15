import { ReleaseState } from "@prisma/client";
import { z } from "zod";
import { askArticle } from "@/lib/ai/ask";
import { db } from "@/lib/db";
import { apiError, ok, withApiLogging } from "@/lib/http";

const askRequestSchema = z.object({
  question: z.string().trim().min(3).max(500)
});

export const POST = withApiLogging(
  "/api/releases/[id]/ask",
  async (
    request: Request,
    context: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await context.params;
    const input = askRequestSchema.parse(await request.json());

    const release = await db.release.findUnique({
      where: { id },
      include: {
        ministry: true,
        tags: { include: { tag: true } }
      }
    });

    if (!release) return apiError("not_found", "Release not found.", 404);
    if (release.state !== ReleaseState.ENRICHED) {
      return apiError(
        "release_not_ready",
        "This release is not enriched yet. Please try again after processing completes.",
        409
      );
    }

    const answer = await askArticle({
      question: input.question,
      title: release.title,
      ministry: release.ministry?.name,
      publishedDate: release.publishedDate,
      sourceUrl: release.sourceUrl,
      rawText: release.rawText,
      pdfText: release.pdfText,
      summary: release.summary,
      whyImportant: release.whyImportant,
      gsPaperMapping: release.gsPaperMapping,
      tags: release.tags.map(({ tag }) => tag.name)
    });

    return ok(answer);
  }
);
