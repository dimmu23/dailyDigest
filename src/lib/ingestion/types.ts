import type { DiscoverySource } from "@prisma/client";

export type DiscoveryCandidate = {
  sourceUrl: string;
  sourceId?: string | null;
  prid?: string | null;
  title?: string | null;
  ministry?: string | null;
  publishedDate?: Date | null;
  discoverySource: DiscoverySource;
};

export type ParsedRelease = {
  sourceUrl: string;
  sourceId?: string | null;
  prid?: string | null;
  title: string;
  ministry?: string | null;
  category?: string | null;
  publishedDate: Date;
  rawText: string;
  pdfUrls: string[];
};

export type ItemError = {
  sourceUrl?: string;
  stage: "discovery" | "detail" | "pdf" | "database" | "ai";
  code: string;
  message: string;
};

export type SyncStats = {
  discovered: number;
  created: number;
  updated: number;
  skipped: number;
  enriched: number;
  failed: number;
  errors: ItemError[];
};

