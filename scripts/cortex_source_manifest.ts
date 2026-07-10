#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type CortexVisibility = "public" | "internal" | "protected" | "secret";
type CortexSourceKind =
  | "archive"
  | "code"
  | "development-plan"
  | "manual-book"
  | "repo-doc"
  | "site-content";

type CortexSourceManifestEntry = {
  evidenceId: string;
  extractedAt: string;
  hash: string;
  ownerProject: "cropto";
  relativePath: string;
  rootId: "cropto";
  sizeBytes: number;
  sourceId: string;
  sourceKind: CortexSourceKind;
  title: string;
  urlOrPath: string;
  visibility: CortexVisibility;
};

type CortexSourceManifest = {
  generatedAt: string;
  product: "1D3X Cortex";
  root: {
    ownerProject: "cropto";
    rootId: "cropto";
    rootPath: string;
    visibility: CortexVisibility;
  };
  schemaVersion: 1;
  sources: CortexSourceManifestEntry[];
  totals: {
    byKind: Record<CortexSourceKind, number>;
    files: number;
    sizeBytes: number;
  };
};

const DEFAULT_SCAN_DIRS = [
  ".",
  "client",
  "docs",
  "server",
  "scripts",
  "shared",
];

const IGNORED_DIRS = new Set([
  ".cortex",
  ".git",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const SECRET_FILE_PATTERNS = [
  /^\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /secret/i,
  /credentials/i,
];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await buildCroptoCortexSourceManifest({
    outPath: options.outPath,
    rootPath: options.rootPath,
    scanDirs: options.scanDirs,
  });
  await mkdir(path.dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    [
      `1D3X Cortex Cr0pto source manifest written: ${options.outPath}`,
      `files: ${manifest.totals.files}`,
      `sizeBytes: ${manifest.totals.sizeBytes}`,
      `repoDocs: ${manifest.totals.byKind["repo-doc"]}`,
      `code: ${manifest.totals.byKind.code}`,
      `developmentPlans: ${manifest.totals.byKind["development-plan"]}`,
    ].join("\n"),
  );
}

async function buildCroptoCortexSourceManifest(input: {
  outPath: string;
  rootPath: string;
  scanDirs: string[];
}): Promise<CortexSourceManifest> {
  const rootPath = path.resolve(input.rootPath);
  const generatedAt = new Date().toISOString();
  const files = await listScanFiles(rootPath, input.scanDirs);
  const sources = await Promise.all(files.map(async (filePath) => {
    const relativePath = toPosix(path.relative(rootPath, filePath));
    const bytes = await readFile(filePath);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const sourceKind = classifySource(relativePath);
    return {
      evidenceId: `cortex:cropto:${hash.slice(0, 16)}`,
      extractedAt: generatedAt,
      hash,
      ownerProject: "cropto" as const,
      relativePath,
      rootId: "cropto" as const,
      sizeBytes: bytes.byteLength,
      sourceId: sourceIdForKind(sourceKind),
      sourceKind,
      title: path.basename(relativePath),
      urlOrPath: `cropto:${relativePath}`,
      visibility: visibilityForPath(relativePath),
    };
  }));
  sources.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    generatedAt,
    product: "1D3X Cortex",
    root: {
      ownerProject: "cropto",
      rootId: "cropto",
      rootPath,
      visibility: "internal",
    },
    schemaVersion: 1,
    sources,
    totals: summarizeSources(sources),
  };
}

async function listScanFiles(rootPath: string, scanDirs: string[]) {
  const files: string[] = [];
  for (const dir of scanDirs) {
    const absolute = path.resolve(rootPath, dir);
    if (!(await exists(absolute))) continue;
    files.push(...await listFiles(absolute, rootPath));
  }
  return [...new Set(files)].sort();
}

async function listFiles(currentPath: string, rootPath: string): Promise<string[]> {
  const currentStat = await stat(currentPath);
  if (currentStat.isFile()) return shouldScanFile(currentPath) ? [currentPath] : [];
  if (!currentStat.isDirectory()) return [];
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const nextPath = path.join(currentPath, entry.name);
    const relative = toPosix(path.relative(rootPath, nextPath));
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name) && !relative.startsWith(".")) {
        files.push(...await listFiles(nextPath, rootPath));
      }
      continue;
    }
    if (entry.isFile() && shouldScanFile(nextPath)) files.push(nextPath);
  }
  return files;
}

function shouldScanFile(filePath: string) {
  const basename = path.basename(filePath);
  if (SECRET_FILE_PATTERNS.some((pattern) => pattern.test(basename))) return false;
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function classifySource(relativePath: string): CortexSourceKind {
  const lower = relativePath.toLowerCase();
  if (lower.includes("roadmap") || lower.includes("status") || lower.includes("revival") || lower.includes("/adr/")) {
    return "development-plan";
  }
  if (lower.includes("archive") || lower.includes("triage") || lower.includes("report")) {
    return "archive";
  }
  if (lower.includes("manual") || lower.includes("guide") || lower.includes("runbook")) {
    return "manual-book";
  }
  if (lower.startsWith("client/") && /\.(tsx|ts|css|html)$/i.test(lower)) {
    return "site-content";
  }
  if (/\.(ts|tsx|js|mjs|cjs|sql)$/i.test(lower) || lower.startsWith("server/") || lower.startsWith("scripts/")) {
    return "code";
  }
  return "repo-doc";
}

function sourceIdForKind(kind: CortexSourceKind) {
  const sourceIds: Record<CortexSourceKind, string> = {
    archive: "ecosystem-content-archives",
    code: "ecosystem-code-snapshots",
    "development-plan": "ecosystem-development-plans",
    "manual-book": "ecosystem-manuals-books",
    "repo-doc": "cropto-public-surfaces",
    "site-content": "ecosystem-site-content",
  };
  return sourceIds[kind];
}

function visibilityForPath(relativePath: string): CortexVisibility {
  const lower = relativePath.toLowerCase();
  if (lower.startsWith("docs/") || lower === "readme.md" || lower.endsWith(".md")) return "public";
  return "internal";
}

function summarizeSources(sources: CortexSourceManifestEntry[]): CortexSourceManifest["totals"] {
  const byKind: Record<CortexSourceKind, number> = {
    archive: 0,
    code: 0,
    "development-plan": 0,
    "manual-book": 0,
    "repo-doc": 0,
    "site-content": 0,
  };
  for (const source of sources) byKind[source.sourceKind] += 1;
  return {
    byKind,
    files: sources.length,
    sizeBytes: sources.reduce((sum, source) => sum + source.sizeBytes, 0),
  };
}

function parseArgs(argv: string[]) {
  return {
    outPath: path.resolve(pickArgValue(argv, "--out") ?? ".cortex/cropto-source-manifest.json"),
    rootPath: path.resolve(pickArgValue(argv, "--root") ?? process.cwd()),
    scanDirs: splitArg(pickArgValue(argv, "--scan") ?? DEFAULT_SCAN_DIRS.join(",")),
  };
}

function splitArg(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function pickArgValue(argv: string[], key: string) {
  const pair = argv.find((value) => value.startsWith(`${key}=`));
  if (pair) return pair.slice(key.length + 1);
  const index = argv.indexOf(key);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function exists(value: string) {
  try {
    await stat(value);
    return true;
  } catch {
    return false;
  }
}

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
