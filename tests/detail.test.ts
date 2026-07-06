import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReleaseHtml } from "@/lib/ingestion/detail";

const html = readFileSync(new URL("./fixtures/release.html", import.meta.url), "utf8");

describe("PIB detail parser", () => {
  it("extracts provenance, body, and official PDF links", () => {
    const release = parseReleaseHtml(html, {
      sourceUrl: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=1234567",
      prid: "1234567",
      discoverySource: "RSS"
    });
    expect(release.title).toBe("National biodiversity report released");
    expect(release.ministry).toContain("Environment");
    expect(release.rawText).toContain("community participation");
    expect(release.rawText).not.toContain("navigation script");
    expect(release.pdfUrls).toEqual(["https://static.pib.gov.in/WriteReadData/report.pdf"]);
    expect(release.sourceUrl).toBe(
      "https://www.pib.gov.in/PressReleasePage.aspx?PRID=1234567"
    );
  });
});

