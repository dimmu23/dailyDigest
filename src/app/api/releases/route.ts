import { ok, withApiLogging } from "@/lib/http";
import { listReleases, releaseQuerySchema } from "@/lib/releases";

export const GET = withApiLogging("/api/releases", async (request) => {
  const url = new URL(request.url);
  const query = releaseQuerySchema.parse(Object.fromEntries(url.searchParams));
  const result = await listReleases(query);
  return ok(result.items, {
    total: result.total,
    page: result.page,
    limit: result.limit,
    pages: result.pages
  });
});
