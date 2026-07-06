import { handleRouteError, ok } from "@/lib/http";
import { listReleases, releaseQuerySchema } from "@/lib/releases";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = releaseQuerySchema.parse(Object.fromEntries(url.searchParams));
    const result = await listReleases(query);
    return ok(result.items, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      pages: result.pages
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

