#!/usr/bin/env tsx
/**
 * This script extracts all user-facing strings from TSX/JSX files
 * for i18n translation. It uses ts-morph to parse AST and identify
 * string literals in JSX context.
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
  "!client/src/components/ui/**/*.tsx", // Skip shadcn UI primitives
]);

const extractedStrings: ExtractedString[] = [];
const seenStrings = new Set<string>();

function isIgnoredString(text: string): boolean {
  // Ignore test-id attributes, empty strings, single chars, numbers, etc.
  const ignored = [
    /^data-testid$/i,
    /^className$/i,
    /^[0-9.]+$/,
    /^[a-z]$/i,
    /^\s*$/,
    /^\/[\/\w\-]*$/,  // paths
    /^[\w-]+\.(png|jpg|svg|ico)$/i,  // filenames
    /^#[0-9a-f]{3,6}$/i,  // color codes
    /^[\w-]+$/,  // single words without spaces (likely props/variables)
  ];
  
  return ignored.some(pattern => pattern.test(text.trim()));
}

for (const sourceFile of sourceFiles) {
  const filePath = sourceFile.getFilePath().replace(process.cwd() + "/", "");
  
  // Find all JSX elements and attributes
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement).forEach(element => {
    // Extract text from JSX children
    element.getJsxChildren().forEach(child => {
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
      
      // String literals in JSX expressions
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
  
  // Extract from self-closing JSX elements
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute).forEach(attr => {
    const name = attr.getNameNode().getText();
    const initializer = attr.getInitializer();
    
    if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
      // Only extract from user-visible attributes
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
  
  // Extract from string literals in calls (e.g., toast.title)
  sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral).forEach(literal => {
    const text = literal.getText().replace(/^["']|["']$/g, "");
    const parent = literal.getParent();
    
    // Check if it's in a property assignment (like title: "Success")
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

// Group by file
const byFile = extractedStrings.reduce((acc, item) => {
  if (!acc[item.file]) {
    acc[item.file] = [];
  }
  acc[item.file].push(item);
  return acc;
}, {} as Record<string, ExtractedString[]>);

// Output results
console.log("\n=== EXTRACTED STRINGS FOR I18N ===\n");
console.log(`Total unique strings: ${extractedStrings.length}\n`);

Object.keys(byFile).sort().forEach(file => {
  console.log(`\n## ${file} (${byFile[file].length} strings)`);
  byFile[file].forEach(item => {
    console.log(`  Line ${item.line}: "${item.text}" [${item.category}${item.context ? `, ${item.context}` : ""}]`);
  });
});

// Also save to JSON for processing
const outputPath = "scripts/extracted-strings.json";
fs.writeFileSync(outputPath, JSON.stringify({ total: extractedStrings.length, strings: extractedStrings, byFile }, null, 2));
console.log(`\n✅ Results saved to ${outputPath}`);
