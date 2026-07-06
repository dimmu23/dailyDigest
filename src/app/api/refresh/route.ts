import { db } from "@/lib/db";
import { apiError, handleRouteError, ok } from "@/lib/http";
import { runPibSync, SyncInProgressError } from "@/lib/ingestion/pipeline";

export const maxDuration = 300;
const PUBLIC_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

export async function POST() {
  try {
    const latest = await db.syncLog.findFirst({
      where: {
        OR: [
          { status: "RUNNING" },
          { status: "SUCCESS" },
          { status: "PARTIAL", discovered: { gt: 0 } }
        ]
      },
      orderBy: { startedAt: "desc" }
    });
    if (
      latest &&
      Date.now() - latest.startedAt.getTime() < PUBLIC_REFRESH_COOLDOWN_MS
    ) {
      return apiError(
        "refresh_cooldown",
        "PIB was checked recently. Please wait a few minutes before refreshing again.",
        429
      );
    }
    return ok(await runPibSync("MANUAL"));
  } catch (error) {
    if (error instanceof SyncInProgressError) {
      return apiError("sync_in_progress", error.message, 409);
    }
    return handleRouteError(error);
  }
}
