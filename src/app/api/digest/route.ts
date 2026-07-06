import { handleRouteError, ok } from "@/lib/http";
import { dailyDigest } from "@/lib/releases";
import { z } from "zod";

const querySchema = z.object({
  date: z.iso.date().default(() => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata"
  }).format(new Date())),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));
    return ok(await dailyDigest(query.date, query.limit), { date: query.date });
  } catch (error) {
    return handleRouteError(error);
  }
}

