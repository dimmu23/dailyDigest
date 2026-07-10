import IORedis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis?: IORedis };

export function getRedisConnection() {
  const connection =
    globalForRedis.redis ??
    new IORedis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: null
    });

  if (process.env.NODE_ENV !== "production") {
    globalForRedis.redis = connection;
  }

  return connection;
}
