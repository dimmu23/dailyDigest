import { apiError, handleRouteError, hasBearerSecret, ok } from "@/lib/http";
import { env } from "@/lib/env";
import { runPibSync, SyncInProgressError } from "@/lib/ingestion/pipeline";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!hasBearerSecret(request, [env.SYNC_SECRET, env.CRON_SECRET])) {
    return apiError("unauthorized", "A valid sync bearer token is required.", 401);
  }
  try {
    return ok(await runPibSync("MANUAL"));
  } catch (error) {
    if (error instanceof SyncInProgressError) {
      return apiError("sync_in_progress", error.message, 409);
    }
    return handleRouteError(error);
  }
}

