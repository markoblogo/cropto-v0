#!/usr/bin/env tsx
/**
 * i18n hardcode guard
 * - Extracts user-facing strings (same logic as extract-strings.ts)
 * - Fails if NEW strings appear that are not in the baseline
 *
 * Baseline file: scripts/i18n-baseline.json
 */

import { Project, SyntaxKind } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

interface ExtractedString {
  text: string;
  file: string;
  line: number;
  category: "jsx_text" | "jsx_attribute" | "placeholder" | "other";
  context?: string;
}

const project = new Project({
  tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
});

const sourceFiles = project.addSourceFilesAtPaths([
  "client/src/pages/**/*.tsx",
  "client/src/components/**/*.tsx",
  "!client/src/components/ui/**/*.tsx",
]);

const ignoredFilePatterns = [
  /client\/src\/pages\/Admin/i,
  /client\/src\/components\/Admin/i,
  /client\/src\/components\/admin\//i,
];

function isIgnoredFile(filePath: string): boolean {
  return ignoredFilePatterns.some((pattern) => pattern.test(filePath));
}

function isIgnoredString(text: string): boolean {
  const ignored = [
    /^data-testid$/i,
    /^className$/i,
    /^[0-9.]+$/,
    /^[a-z]$/i,
    /^\s*$/,
    /^\/[\/\w\-]*$/,
    /^[\w-]+\.(png|jpg|svg|ico)$/i,
    /^#[0-9a-f]{3,6}$/i,
    /^[\w-]+$/,
  ];

  return ignored.some((pattern) => pattern.test(text.trim()));
}

const extractedStrings: ExtractedString[] = [];
const seenStrings = new Set<string>();

for (const sourceFile of sourceFiles) {
  const filePath = sourceFile.getFilePath().replace(process.cwd() + "/", "");
  if (isIgnoredFile(filePath)) {
    continue;
  }

  sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement).forEach((element) => {
    element.getJsxChildren().forEach((child) => {
      if (child.getKind() === SyntaxKind.JsxText) {
        const text = child.getText().trim();
        if (text && !isIgnoredString(text) && !seenStrings.has(text)) {
          seenStrings.add(text);
          extractedStrings.push({
            text,
            file: filePath,
            line: child.getStartLineNumber(),
            category: "jsx_text",
          });
        }
      }

      if (child.getKind() === SyntaxKind.JsxExpression) {
        const expr = child.getExpression();
        if (expr && expr.getKind() === SyntaxKind.StringLiteral) {
          const text = expr.getText().replace(/^["']|["']$/g, "");
          if (!isIgnoredString(text) && !seenStrings.has(text)) {
            seenStrings.add(text);
            extractedStrings.push({
              text,
              file: filePath,
              line: child.getStartLineNumber(),
              category: "jsx_text",
            });
          }
        }
      }
    });
  });

  sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute).forEach((attr) => {
    const name = attr.getNameNode().getText();
    const initializer = attr.getInitializer();

    if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
      if (["placeholder", "title", "aria-label", "alt"].includes(name)) {
        const text = initializer.getText().replace(/^["']|["']$/g, "");
        if (!isIgnoredString(text) && !seenStrings.has(text)) {
          seenStrings.add(text);
          extractedStrings.push({
            text,
            file: filePath,
            line: attr.getStartLineNumber(),
            category: "jsx_attribute",
            context: name,
          });
        }
      }
    }
  });

  sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral).forEach((literal) => {
    const text = literal.getText().replace(/^["']|["']$/g, "");
    const parent = literal.getParent();

    if (parent && parent.getKind() === SyntaxKind.PropertyAssignment) {
      const propName = parent.getFirstChildByKind(SyntaxKind.Identifier)?.getText();
      if (propName && ["title", "description", "label", "message"].includes(propName)) {
        if (!isIgnoredString(text) && !seenStrings.has(text)) {
          seenStrings.add(text);
          extractedStrings.push({
            text,
            file: filePath,
            line: literal.getStartLineNumber(),
            category: "other",
            context: `property: ${propName}`,
          });
        }
      }
    }
  });
}

const baselinePath = path.join(process.cwd(), "scripts/i18n-baseline.json");
if (!fs.existsSync(baselinePath)) {
  console.error("Missing baseline file:", baselinePath);
  process.exit(2);
}

const baselineJson = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
const baselineTexts = new Set<string>((baselineJson?.strings || []).map((s: ExtractedString) => s.text));

const newStrings = extractedStrings.filter((s) => !baselineTexts.has(s.text));

if (newStrings.length > 0) {
  console.error(`Found ${newStrings.length} new hardcoded strings not in baseline.`);
  newStrings.slice(0, 50).forEach((s) => {
    console.error(`- ${s.file}:${s.line} "${s.text}"`);
  });
  if (newStrings.length > 50) {
    console.error(`...and ${newStrings.length - 50} more`);
  }
  process.exit(1);
}

console.log("✅ i18n check passed (no new hardcoded strings).");
