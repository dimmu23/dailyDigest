import { describe, expect, it } from "vitest";
import { extractPrid, isOfficialPibUrl, normalizePibUrl } from "@/lib/ingestion/urls";

describe("PIB URL policy", () => {
  it("normalizes canonical detail URLs and retains PRID only", () => {
    expect(
      normalizePibUrl("/PressReleasePage.aspx?PRID=1234567&lang=1&utm_source=x")
    ).toBe("https://www.pib.gov.in/PressReleasePage.aspx?PRID=1234567");
  });

  it("allows only official HTTPS hosts", () => {
    expect(isOfficialPibUrl("https://static.pib.gov.in/file.pdf")).toBe(true);
    expect(isOfficialPibUrl("http://pib.gov.in/file.pdf")).toBe(false);
    expect(isOfficialPibUrl("https://pib.gov.in.example.com/file.pdf")).toBe(false);
  });

  it("extracts PRID", () => {
    expect(extractPrid("https://www.pib.gov.in/PressReleasePage.aspx?PRID=9988")).toBe("9988");
  });

  it("normalizes legacy PIB detail routes to the canonical PRID route", () => {
    expect(
      normalizePibUrl("https://www.pib.gov.in/PressReleseDetail.aspx?PRID=9988&reg=48")
    ).toBe("https://www.pib.gov.in/PressReleasePage.aspx?PRID=9988");
  });
});
