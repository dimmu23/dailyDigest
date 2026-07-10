import { db } from "@/lib/db";
import { apiError, ok, withApiLogging } from "@/lib/http";
import { releaseInclude } from "@/lib/releases";

export const GET = withApiLogging(
  "/api/releases/[id]",
  async (
    _request: Request,
    context: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await context.params;
    const release = await db.release.findUnique({
      where: { id },
      include: releaseInclude
    });
    if (!release) return apiError("not_found", "Release not found.", 404);
    return ok(release);
  }
);
