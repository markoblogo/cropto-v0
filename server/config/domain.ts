const DEFAULT_PUBLIC_URL = "https://cr0pto.com";

function normalizeUrl(value: string | undefined, fallback: string): string {
  const raw = (value || fallback).trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, "");
}

export function getPublicAppUrl(): string {
  return normalizeUrl(process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL, DEFAULT_PUBLIC_URL);
}

export function getCanonicalHost(): string {
  return new URL(getPublicAppUrl()).hostname.toLowerCase();
}

export function getLegacyHosts(): string[] {
  const configured = (process.env.LEGACY_REDIRECT_HOSTS || "").trim();
  const rawHosts = configured
    ? configured.split(",")
    : ["cropto.abvx.xyz"];

  return rawHosts
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .filter((host, index, arr) => arr.indexOf(host) === index);
}

