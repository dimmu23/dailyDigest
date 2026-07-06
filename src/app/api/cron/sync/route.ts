import { env } from "@/lib/env";
import { apiError, handleRouteError, hasBearerSecret, ok } from "@/lib/http";
import { runPibSync, SyncInProgressError } from "@/lib/ingestion/pipeline";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!hasBearerSecret(request, [env.CRON_SECRET])) {
    return apiError("unauthorized", "A valid cron bearer token is required.", 401);
  }
  try {
    return ok(await runPibSync("CRON"));
  } catch (error) {
    if (error instanceof SyncInProgressError) {
      return apiError("sync_in_progress", error.message, 409);
    }
    return handleRouteError(error);
  }
}

