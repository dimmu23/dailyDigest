import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAllReleasesHtml } from "@/lib/ingestion/discovery";

const html = readFileSync(new URL("./fixtures/all-releases.html", import.meta.url), "utf8");

describe("All Releases parser", () => {
  it("extracts and deduplicates official detail links", () => {
    const items = parseAllReleasesHtml(html, "https://www.pib.gov.in/AllRelease.aspx");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      prid: "1234567",
      title: "National biodiversity report released",
      discoverySource: "ALL_RELEASES"
    });
    expect(items[1].prid).toBe("7654321");
  });
});

