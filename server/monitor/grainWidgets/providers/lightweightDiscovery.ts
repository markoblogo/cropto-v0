import * as cheerio from "cheerio";
import { fetchTextResponseWithTimeout } from "./utils";

export type LightweightDiscoveredPage = {
  url: string;
  finalUrl: string;
  contentType?: string | null;
  html: string;
  links: string[];
  scriptJsonCandidates: any[];
};

function absolutize(baseUrl: string, href: string): string | undefined {
  const trimmed = String(href || "").trim();
  if (!trimmed) return undefined;
  if (/^javascript:/i.test(trimmed) || /^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)) return undefined;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function parseJsonSafe(value: string): any | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function collectNestedLinks(value: unknown, found: Set<string>, depth = 0): void {
  if (depth > 5 || value == null) return;
  if (typeof value === "string") {
    if (/https?:\/\/[^\s"'<>]+/i.test(value) || /\/[A-Za-z0-9/_\-%.]+(?:csv|json|xls|xlsx|pdf)(?:[?#][^"'<>]*)?$/i.test(value)) {
      found.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) collectNestedLinks(item, found, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>).slice(0, 50)) {
      collectNestedLinks(entry, found, depth + 1);
    }
  }
}

export async function discoverOfficialPage(url: string, timeoutMs: number): Promise<LightweightDiscoveredPage> {
  const response = await fetchTextResponseWithTimeout(url, timeoutMs, {
    accept: "text/html,application/xhtml+xml,application/json,*/*",
  });
  const $ = cheerio.load(response.text);
  const links = new Set<string>();
  $("a[href], link[href], script[src]").each((_, el) => {
    const href = $(el).attr("href") || $(el).attr("src");
    const absolute = absolutize(response.finalUrl || url, href || "");
    if (absolute) links.add(absolute);
  });

  const scriptJsonCandidates: any[] = [];
  $("script").each((_, el) => {
    const text = $(el).html()?.trim();
    if (!text) return;
    const parsed = parseJsonSafe(text);
    if (parsed !== undefined) {
      scriptJsonCandidates.push(parsed);
      collectNestedLinks(parsed, links);
      return;
    }
    const nextDataMatch = text.match(/__NEXT_DATA__"\s*type="application\/json">([\s\S]+)/i);
    if (nextDataMatch?.[1]) {
      const nextParsed = parseJsonSafe(nextDataMatch[1]);
      if (nextParsed !== undefined) {
        scriptJsonCandidates.push(nextParsed);
        collectNestedLinks(nextParsed, links);
      }
      return;
    }
    const urlMatches = text.match(/https?:\/\/[^\s"'<>]+|\/[A-Za-z0-9/_\-%.]+(?:csv|json|xls|xlsx|pdf)(?:[?#][^"'<>]*)?/g) || [];
    for (const match of urlMatches) {
      const absolute = absolutize(response.finalUrl || url, match);
      if (absolute) links.add(absolute);
    }
  });

  return {
    url,
    finalUrl: response.finalUrl || url,
    contentType: response.contentType,
    html: response.text,
    links: [...links],
    scriptJsonCandidates,
  };
}

export function pickDiscoveredLinks(
  page: LightweightDiscoveredPage,
  opts: {
    includePatterns: RegExp[];
    excludePatterns?: RegExp[];
    limit?: number;
  },
): string[] {
  const excludePatterns = opts.excludePatterns || [];
  const filtered = page.links.filter((link) => {
    if (!opts.includePatterns.some((pattern) => pattern.test(link))) return false;
    if (excludePatterns.some((pattern) => pattern.test(link))) return false;
    return true;
  });
  return filtered.slice(0, opts.limit || 5);
}
