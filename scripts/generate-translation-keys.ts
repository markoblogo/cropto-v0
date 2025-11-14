#!/usr/bin/env tsx
/**
 * Generates structured translation keys from extracted strings
 */

import * as fs from "fs";

const extractedData = JSON.parse(fs.readFileSync("scripts/extracted-strings.json", "utf-8"));

function generateKeyFromText(text: string, file: string, context?: string): string {
  // Derive component/page name from file
  const fileName = file.split("/").pop()?.replace(".tsx", "") || "unknown";
  const isPage = file.includes("/pages/");
  const prefix = isPage ? "page" : "component";
  
  // Simplify component name to kebab-case
  const componentName = fileName
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
  
  // Generate key suffix from text
  let suffix = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 50);  // Limit length
  
  // Handle special contexts
  if (context?.includes("placeholder")) {
    suffix = `placeholder-${suffix}`;
  } else if (context?.includes("title")) {
    suffix = `title-${suffix}`;
  } else if (context?.includes("description")) {
    suffix = `desc-${suffix}`;
  }
  
  return `${prefix}.${componentName}.${suffix}`;
}

interface TranslationEntry {
  key: string;
  en: string;
  uk: string;
  file: string;
  line: number;
}

const translations: TranslationEntry[] = [];

Object.entries(extractedData.byFile as Record<string, any[]>).forEach(([file, strings]) => {
  strings.forEach(item => {
    const key = generateKeyFromText(item.text, file, item.context);
    
    translations.push({
      key,
      en: item.text,
      uk: "", // To be filled manually
      file,
      line: item.line,
    });
  });
});

// Output as structured JSON
const output = {
  meta: {
    total: translations.length,
    generatedAt: new Date().toISOString(),
  },
  translations,
};

fs.writeFileSync("scripts/translation-keys.json", JSON.stringify(output, null, 2));

// Also output grouped by component for easier review
const byComponent = translations.reduce((acc, item) => {
  const component = item.key.split(".").slice(0, 2).join(".");
  if (!acc[component]) {
    acc[component] = [];
  }
  acc[component].push(item);
  return acc;
}, {} as Record<string, TranslationEntry[]>);

console.log("\n=== GENERATED TRANSLATION KEYS ===\n");
console.log(`Total: ${translations.length} keys\n`);

Object.keys(byComponent).sort().forEach(component => {
  console.log(`\n## ${component} (${byComponent[component].length} keys)`);
  byComponent[component].slice(0, 5).forEach(item => {
    console.log(`  ${item.key}: "${item.en}"`);
  });
  if (byComponent[component].length > 5) {
    console.log(`  ... and ${byComponent[component].length - 5} more`);
  }
});

console.log(`\n✅ Saved to scripts/translation-keys.json`);
