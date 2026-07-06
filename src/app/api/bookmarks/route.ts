import { db } from "@/lib/db";
import { apiError, handleRouteError, ok } from "@/lib/http";
import { releaseInclude } from "@/lib/releases";
import { z } from "zod";

const bookmarkSchema = z.object({
  releaseId: z.string().min(1).max(64),
  userId: z.string().min(8).max(128)
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = z.string().min(8).max(128).parse(url.searchParams.get("userId"));
    const bookmarks = await db.bookmark.findMany({
      where: { userId },
      include: { release: { include: releaseInclude } },
      orderBy: { createdAt: "desc" }
    });
    return ok(bookmarks);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = bookmarkSchema.parse(await request.json());
    const release = await db.release.findUnique({ where: { id: input.releaseId } });
    if (!release) return apiError("not_found", "Release not found.", 404);
    const bookmark = await db.bookmark.upsert({
      where: { userId_releaseId: input },
      update: {},
      create: input
    });
    return ok(bookmark, undefined, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const input = bookmarkSchema.parse(Object.fromEntries(url.searchParams));
    await db.bookmark.deleteMany({ where: input });
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

