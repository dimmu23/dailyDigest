import * as cheerio from "cheerio";
import { fetchOfficialPib } from "@/lib/ingestion/fetch";
import type { DiscoveryCandidate, ParsedRelease } from "@/lib/ingestion/types";
import { extractPrid, normalizePibUrl } from "@/lib/ingestion/urls";
import { normalizeWhitespace, safeDate } from "@/lib/text";

const BODY_SELECTORS = [
  ".innner-page-main-about-us-content-right-part",
  ".releaseContent",
  ".release-content",
  ".ReleaseDetail",
  ".releaseCont",
  "#divContent",
  "#ContentPlaceHolder1_lblContent"
];

function firstText($: cheerio.CheerioAPI, selectors: string[]): string {
  for (const selector of selectors) {
    const value = normalizeWhitespace($(selector).first().text());
    if (value) return value;
  }
  return "";
}

function extractBody($: cheerio.CheerioAPI): string {
  let best = "";
  for (const selector of BODY_SELECTORS) {
    $(selector).each((_, element) => {
      const clone = $(element).clone();
      clone
        .find(
          "script,style,noscript,nav,header,footer,form,button,.social-share,.share,.visitor-counter"
        )
        .remove();
      const text = normalizeWhitespace(clone.text());
      if (text.length > best.length) best = text;
    });
  }
  return best;
}

export function parseReleaseHtml(
  html: string,
  candidate: DiscoveryCandidate,
  finalUrl = candidate.sourceUrl
): ParsedRelease {
  const $ = cheerio.load(html);
  const pageText = normalizeWhitespace($("body").text());
  const canonical =
    normalizePibUrl($('link[rel="canonical"]').attr("href") || "", finalUrl) ||
    normalizePibUrl(finalUrl) ||
    candidate.sourceUrl;
  const title =
    firstText($, ["h1", ".release-title", ".ReleaseTitle", "#ContentPlaceHolder1_lblTitle"]) ||
    normalizeWhitespace($('meta[property="og:title"]').attr("content") || "") ||
    candidate.title ||
    "";

  if (!title) throw new Error("Release title was not found.");

  const ministry =
    firstText($, [
      ".release-ministry",
      ".ReleaseMinistry",
      "#MinistryName",
      "#ContentPlaceHolder1_lblMinistry",
      ".ministry-name"
    ]) ||
    candidate.ministry ||
    null;

  const category =
    firstText($, [".release-category", ".ReleaseCategory", "#ContentPlaceHolder1_lblCategory"]) ||
    null;

  const postedText =
    pageText.match(
      /Posted\s+[Oo]n\s*:\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}(?:\s+[0-9:]+\s*(?:AM|PM)\s+by\s+PIB\s+\w+)?)/i
    )?.[1] || undefined;

  const rawText = extractBody($);
  if (rawText.length < 80) {
    throw new Error("Release article body was empty or too short.");
  }

  const pdfUrls = new Set<string>();
  $('a[href]').each((_, link) => {
    const href = $(link).attr("href") || "";
    const label = normalizeWhitespace($(link).text());
    if (!/\.pdf(?:$|\?)/i.test(href) && !/\bpdf\b/i.test(label)) return;
    const url = normalizePibUrl(href, finalUrl);
    if (url) pdfUrls.add(url);
  });

  return {
    sourceUrl: canonical,
    sourceId: candidate.sourceId,
    prid: candidate.prid || extractPrid(canonical),
    title,
    ministry,
    category,
    publishedDate: postedText ? safeDate(postedText, candidate.publishedDate || new Date()) : candidate.publishedDate || new Date(),
    rawText,
    pdfUrls: [...pdfUrls]
  };
}

export async function fetchAndParseRelease(candidate: DiscoveryCandidate): Promise<ParsedRelease> {
  const response = await fetchOfficialPib(candidate.sourceUrl);
  const html = await response.text();
  if (!html.trim()) throw new Error("PIB detail response was empty.");
  return parseReleaseHtml(html, candidate, response.url);
}
