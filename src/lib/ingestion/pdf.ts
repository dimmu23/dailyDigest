import pdfParse from "pdf-parse";
import { env } from "@/lib/env";
import { fetchOfficialPib } from "@/lib/ingestion/fetch";
import { normalizeWhitespace } from "@/lib/text";

export async function extractPdfText(url: string): Promise<string> {
  const response = await fetchOfficialPib(url);
  const contentType = response.headers.get("content-type") || "";
  const declaredLength = Number(response.headers.get("content-length") || "0");

  if (declaredLength > env.PIB_MAX_PDF_BYTES) {
    throw new Error(`PDF exceeds ${env.PIB_MAX_PDF_BYTES} byte limit.`);
  }
  if (contentType && !contentType.includes("pdf") && !url.toLowerCase().includes(".pdf")) {
    throw new Error(`Attachment is not a PDF (${contentType || "unknown content type"}).`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > env.PIB_MAX_PDF_BYTES) {
    throw new Error(`PDF exceeds ${env.PIB_MAX_PDF_BYTES} byte limit.`);
  }
  if (bytes.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("Attachment does not have a valid PDF signature.");
  }

  const parsed = await pdfParse(bytes);
  const text = normalizeWhitespace(parsed.text || "");
  if (text.length < 40) {
    throw new Error("PDF contains no usable text; it may require OCR.");
  }
  return text;
}

