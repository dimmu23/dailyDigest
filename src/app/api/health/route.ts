import { db } from "@/lib/db";
import { ApiRouteError, ok, withApiLogging } from "@/lib/http";

export const GET = withApiLogging("/api/health", async () => {
  try {
    await db.$queryRaw`SELECT 1`;
    return ok({ status: "ok", timestamp: new Date().toISOString() });
  } catch (error) {
    throw new ApiRouteError(
      "database_unavailable",
      "Database health check failed.",
      503,
      undefined,
      { cause: error }
    );
  }
});
