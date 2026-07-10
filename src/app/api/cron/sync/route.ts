import { env } from "@/lib/env";
import { apiError, hasBearerSecret, ok, withApiLogging } from "@/lib/http";
import { runPibSync, SyncInProgressError } from "@/lib/ingestion/pipeline";

export const maxDuration = 300;

export const GET = withApiLogging("/api/cron/sync", async (request) => {
  if (!hasBearerSecret(request, [env.CRON_SECRET])) {
    return apiError("unauthorized", "A valid cron bearer token is required.", 401);
  }
  try {
    return ok(await runPibSync("CRON"));
  } catch (error) {
    if (error instanceof SyncInProgressError) {
      return apiError("sync_in_progress", error.message, 409);
    }
    throw error;
  }
});
