const OFFICIAL_HOSTS = new Set(["pib.gov.in", "www.pib.gov.in", "static.pib.gov.in"]);

export function isOfficialPibUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "https:" && OFFICIAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizePibUrl(input: string, base = "https://www.pib.gov.in"): string | null {
  try {
    const url = new URL(input, base);
    url.protocol = "https:";
    url.hash = "";
    if (url.hostname === "pib.gov.in") url.hostname = "www.pib.gov.in";
    if (!isOfficialPibUrl(url.toString())) return null;

    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
    }

    const prid = url.searchParams.get("PRID") || url.searchParams.get("prid");
    if (
      prid &&
      /(?:PressReleseDetail|PressReleaseDetail|PressReleaseIframePage|PressReleasePage)\.aspx/i.test(
        url.pathname
      )
    ) {
      url.pathname = "/PressReleasePage.aspx";
      url.search = "";
      url.searchParams.set("PRID", prid);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function extractPrid(input: string): string | null {
  try {
    const url = new URL(input);
    return url.searchParams.get("PRID") || url.searchParams.get("prid");
  } catch {
    return input.match(/\bPRID[=/](\d+)/i)?.[1] ?? null;
  }
}
