import { db } from "@/lib/db";
import { apiError, handleRouteError, ok } from "@/lib/http";
import { releaseInclude } from "@/lib/releases";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const release = await db.release.findUnique({
      where: { id },
      include: releaseInclude
    });
    if (!release) return apiError("not_found", "Release not found.", 404);
    return ok(release);
  } catch (error) {
    return handleRouteError(error);
  }
}

