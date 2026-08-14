import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export interface ReportUpload {
  name: string;
  mimeType: string;
  dataBase64: string;
}

export class ReportValidationError extends Error {}

const mimeByExtension: Readonly<Record<string, string>> = {
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLocaleLowerCase("en-US") : "";
}

function decodeBase64(value: string): Buffer {
  if (!value || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new ReportValidationError("Rapor verisi geçerli değil.");
  }
  return Buffer.from(value, "base64");
}

function validateDocxArchiveSize(buffer: Buffer): void {
  let entryCount = 0;
  let totalUncompressedSize = 0;
  for (let offset = 0; offset <= buffer.length - 46; offset++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    entryCount++;
    totalUncompressedSize += buffer.readUInt32LE(offset + 24);
    if (totalUncompressedSize > 25 * 1024 * 1024) {
      throw new ReportValidationError("DOCX raporu güvenli ayrıştırma sınırını aşıyor.");
    }
  }
  if (entryCount === 0) throw new ReportValidationError("DOCX raporu bozuk veya desteklenmiyor.");
}

function normalizeExtractedText(value: string): string {
  const text = value.replace(/\0/gu, "").replace(/\s+/gu, " ").trim();
  if (!text) throw new ReportValidationError("Raporda okunabilir metin bulunamadı.");
  return text.slice(0, 20_000);
}

export async function extractReportText(upload: unknown, maximumSizeBytes: number): Promise<string> {
  if (typeof upload !== "object" || upload === null || Array.isArray(upload)) {
    throw new ReportValidationError("Rapor bilgisi geçerli değil.");
  }
  const value = upload as Partial<ReportUpload>;
  if (typeof value.name !== "string" || value.name.length < 1 || value.name.length > 128
    || /[\\/\0-\x1f]/u.test(value.name)) {
    throw new ReportValidationError("Rapor dosya adı geçerli değil.");
  }
  const extension = extensionOf(value.name);
  const expectedMime = mimeByExtension[extension];
  if (!expectedMime || value.mimeType !== expectedMime || typeof value.dataBase64 !== "string") {
    throw new ReportValidationError("Yalnızca doğrulanmış TXT, PDF veya DOCX raporu kabul edilir.");
  }
  const buffer = decodeBase64(value.dataBase64);
  if (buffer.length === 0 || buffer.length > maximumSizeBytes) {
    throw new ReportValidationError("Rapor dosyası izin verilen boyutu aşıyor.");
  }

  try {
    if (extension === ".txt") {
      if (buffer.includes(0)) throw new ReportValidationError("TXT raporu metin tabanlı değil.");
      return normalizeExtractedText(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
    }
    if (extension === ".pdf") {
      if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new ReportValidationError("PDF imzası geçerli değil.");
      const parser = new PDFParse({ data: buffer });
      try { return normalizeExtractedText((await parser.getText()).text); }
      finally { await parser.destroy(); }
    }
    if (buffer.readUInt32LE(0) !== 0x04034b50) throw new ReportValidationError("DOCX imzası geçerli değil.");
    validateDocxArchiveSize(buffer);
    return normalizeExtractedText((await mammoth.extractRawText({ buffer })).value);
  } catch (error: unknown) {
    if (error instanceof ReportValidationError) throw error;
    throw new ReportValidationError("Rapor bozuk, şifreli veya ayrıştırılamıyor.");
  }
}
