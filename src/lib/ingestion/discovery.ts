import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import Parser from "rss-parser";
import { env } from "@/lib/env";
import { fetchOfficialPib } from "@/lib/ingestion/fetch";
import type { DiscoveryCandidate } from "@/lib/ingestion/types";
import { extractPrid, normalizePibUrl } from "@/lib/ingestion/urls";
import { normalizeWhitespace, safeDate } from "@/lib/text";

const parser = new Parser();

export async function discoverFromRss(): Promise<DiscoveryCandidate[]> {
  const response = await fetchOfficialPib(env.PIB_RSS_URL);
  const xml = await response.text();
  if (!xml.trim()) return [];
  const feed = await parser.parseString(xml);

  return feed.items
    .map((item) => {
      const sourceUrl = normalizePibUrl(item.link || item.guid || "");
      if (!sourceUrl) return null;
      return {
        sourceUrl,
        sourceId: item.guid || undefined,
        prid: extractPrid(sourceUrl),
        title: item.title ? normalizeWhitespace(item.title) : undefined,
        publishedDate: item.isoDate || item.pubDate ? safeDate(item.isoDate || item.pubDate) : undefined,
        discoverySource: "RSS" as const
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function nearestMinistry($: cheerio.CheerioAPI, element: AnyNode): string | undefined {
  const item = $(element);
  const direct =
    item.closest("li").prevAll("h2,h3,h4").first().text() ||
    item.parent().prevAll("h2,h3,h4").first().text() ||
    item.closest("section,div").find("h2,h3,h4").first().text();
  const normalized = normalizeWhitespace(direct);
  return normalized || undefined;
}

export function parseAllReleasesHtml(html: string, pageUrl: string): DiscoveryCandidate[] {
  const $ = cheerio.load(html);
  const items: DiscoveryCandidate[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    if (!/PressReleasePage|PressReleseDetail|PressReleaseDetail/i.test(href)) return;
    const sourceUrl = normalizePibUrl(href, pageUrl);
    if (!sourceUrl) return;
    const containerText = normalizeWhitespace($(element).closest("li").text());
    const posted = containerText.match(/Posted\s+on\s*:\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/i)?.[1];

    items.push({
      sourceUrl,
      sourceId: extractPrid(sourceUrl),
      prid: extractPrid(sourceUrl),
      title: normalizeWhitespace($(element).text()) || undefined,
      ministry: nearestMinistry($, element),
      publishedDate: posted ? safeDate(posted) : undefined,
      discoverySource: "ALL_RELEASES"
    });
  });

  return dedupeCandidates(items);
}

export async function discoverFromAllReleases(): Promise<DiscoveryCandidate[]> {
  const response = await fetchOfficialPib(env.PIB_ALL_RELEASES_URL);
  const html = await response.text();
  if (!html.trim()) return [];
  return parseAllReleasesHtml(html, response.url);
}

export function dedupeCandidates(items: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.prid ? `prid:${item.prid}` : `url:${item.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
