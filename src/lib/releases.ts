import { Prisma, ReleaseState } from "@prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";

export const releaseQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  ministry: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(80).optional(),
  gs: z.enum(["GS1", "GS2", "GS3", "GS4", "ESSAY"]).optional(),
  minScore: z.coerce.number().int().min(1).max(10).optional(),
  prelims: z.enum(["true", "false"]).optional(),
  mains: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["published_desc", "score_desc"]).default("published_desc")
});

export type ReleaseQuery = z.infer<typeof releaseQuerySchema>;

export const releaseInclude = {
  ministry: true,
  tags: { include: { tag: true } }
} satisfies Prisma.ReleaseInclude;

export type ReleaseWithRelations = Prisma.ReleaseGetPayload<{
  include: typeof releaseInclude;
}>;

export function buildReleaseWhere(input: ReleaseQuery): Prisma.ReleaseWhereInput {
  const date: Prisma.DateTimeFilter = {};
  if (input.from) date.gte = new Date(`${input.from}T00:00:00.000Z`);
  if (input.to) date.lte = new Date(`${input.to}T23:59:59.999Z`);

  return {
    state: ReleaseState.ENRICHED,
    ...(Object.keys(date).length ? { publishedDate: date } : {}),
    ...(input.ministry ? { ministry: { slug: input.ministry } } : {}),
    ...(input.tag ? { tags: { some: { tag: { slug: input.tag } } } } : {}),
    ...(input.gs ? { gsPaperMapping: { has: input.gs } } : {}),
    ...(input.minScore ? { upscRelevanceScore: { gte: input.minScore } } : {}),
    ...(input.prelims ? { prelimsRelevance: input.prelims === "true" } : {}),
    ...(input.mains ? { mainsRelevance: input.mains === "true" } : {}),
    ...(input.q
      ? {
          OR: [
            { title: { contains: input.q, mode: Prisma.QueryMode.insensitive } },
            { summary: { contains: input.q, mode: Prisma.QueryMode.insensitive } },
            { rawText: { contains: input.q, mode: Prisma.QueryMode.insensitive } }
          ]
        }
      : {})
  };
}

export async function listReleases(input: ReleaseQuery) {
  const where = buildReleaseWhere(input);
  const orderBy: Prisma.ReleaseOrderByWithRelationInput[] =
    input.sort === "score_desc"
      ? [{ upscRelevanceScore: "desc" }, { publishedDate: "desc" }]
      : [{ publishedDate: "desc" }, { upscRelevanceScore: "desc" }];

  const [items, total] = await db.$transaction([
    db.release.findMany({
      where,
      include: releaseInclude,
      orderBy,
      skip: (input.page - 1) * input.limit,
      take: input.limit
    }),
    db.release.count({ where })
  ]);

  return {
    items,
    total,
    page: input.page,
    limit: input.limit,
    pages: Math.ceil(total / input.limit)
  };
}

export async function dashboardOptions() {
  const [ministries, tags, latestSync] = await db.$transaction([
    db.ministry.findMany({ orderBy: { name: "asc" } }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.syncLog.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { completedAt: "desc" }
    })
  ]);
  return { ministries, tags, latestSync };
}

export async function dailyDigest(date: string, limit = 10) {
  const start = new Date(`${date}T00:00:00.000+05:30`);
  const end = new Date(`${date}T23:59:59.999+05:30`);

  return db.release.findMany({
    where: {
      state: ReleaseState.ENRICHED,
      publishedDate: { gte: start, lte: end },
      isUpscRelevant: true
    },
    include: releaseInclude,
    orderBy: [{ upscRelevanceScore: "desc" }, { publishedDate: "desc" }],
    take: limit
  });
}
