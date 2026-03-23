import {
  USDA_MARS_PUBLIC_INDEX_URLS,
  USDA_MARS_TIMEOUT_MS,
} from "../config";
import { fetchTextResponseWithTimeout } from "./utils";

export type UsdaMarsPublicIndexRow = {
  id: string;
  fileName: string;
  fileExtension: string;
  publishedDate?: string;
  publishedDateMs?: string;
  reportBeginDate?: string;
  reportEndDate?: string;
  reportTitle: string;
};

function parseDateIso(value?: string): string | undefined {
  if (!value) return undefined;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : undefined;
}

function parseRow(line: string): UsdaMarsPublicIndexRow | undefined {
  const match = line.match(
    /^\s*(\d+)\s+(\S+)\s+([a-z0-9]+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\w+)\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(.*\S)\s*$/i,
  );
  if (!match) return undefined;
  return {
    id: match[1],
    fileName: match[2],
    fileExtension: match[3].toLowerCase(),
    publishedDate: parseDateIso(match[4]),
    publishedDateMs: match[5],
    reportBeginDate: match[6],
    reportEndDate: match[7],
    reportTitle: match[8].trim(),
  };
}

function parseJsonIndex(text: string): UsdaMarsPublicIndexRow[] {
  try {
    const payload = JSON.parse(text);
    const reports = Array.isArray(payload?.reports) ? payload.reports : [];
    return reports
      .map((row: any): UsdaMarsPublicIndexRow | undefined => {
        const id = String(row?.id ?? "").trim();
        const fileName = String(row?.fileName ?? "").trim();
        const fileExtension = String(row?.fileExtension ?? "").trim().toLowerCase();
        const reportTitle = String(row?.reportTitle ?? "").trim();
        if (!id || !fileName || !fileExtension || !reportTitle) return undefined;
        return {
          id,
          fileName,
          fileExtension,
          publishedDate: parseDateIso(String(row?.publishedDate ?? "")),
          publishedDateMs: row?.publishedDateMilliseconds != null ? String(row.publishedDateMilliseconds) : undefined,
          reportBeginDate: String(row?.reportBeginDate ?? "").trim() || undefined,
          reportEndDate: String(row?.reportEndDate ?? "").trim() || undefined,
          reportTitle,
        };
      })
      .filter((row: UsdaMarsPublicIndexRow | undefined): row is UsdaMarsPublicIndexRow => Boolean(row));
  } catch {
    return [];
  }
}

export function parseUsdaMarsPublicIndex(text: string): UsdaMarsPublicIndexRow[] {
  const jsonRows = parseJsonIndex(text);
  if (jsonRows.length) return jsonRows;

  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => /^\s*\d+\s+\S+/.test(line))
    .map(parseRow)
    .filter((row): row is UsdaMarsPublicIndexRow => Boolean(row));
}

export async function fetchUsdaMarsPublicIndex(): Promise<{
  rows: UsdaMarsPublicIndexRow[];
  sourceUrlUsed: string;
}> {
  let lastError: string | undefined;
  for (const url of USDA_MARS_PUBLIC_INDEX_URLS) {
    try {
      const response = await fetchTextResponseWithTimeout(url, USDA_MARS_TIMEOUT_MS, {
        accept: "text/plain,text/html,*/*",
      });
      const rows = parseUsdaMarsPublicIndex(response.text);
      if (rows.length) {
        return {
          rows,
          sourceUrlUsed: response.finalUrl || url,
        };
      }
      lastError = `empty_index:${url}`;
    } catch (error: any) {
      lastError = String(error?.message || "fetch_failed");
    }
  }

  throw new Error(`usda_mars_public_index_failed:${lastError || "fetch_failed"}`);
}
