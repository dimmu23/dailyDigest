import { db } from "@/lib/db";
import { apiError, ok } from "@/lib/http";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return ok({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    return apiError("database_unavailable", "Database health check failed.", 503);
  }
}

