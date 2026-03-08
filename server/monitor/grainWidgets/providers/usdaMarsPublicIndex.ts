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

export function parseUsdaMarsPublicIndex(text: string): UsdaMarsPublicIndexRow[] {
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
