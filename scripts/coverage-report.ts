#!/usr/bin/env tsx
/**
 * Coverage report: Compare extracted strings with translation files
 * to identify missing, empty, or obsolete translations
 */

import * as fs from "fs";

interface ExtractedString {
  text: string;
  file: string;
  line: number;
  category: string;
  context?: string;
}

interface TranslationFile {
  [key: string]: any;
}

// Load extracted strings
const extractedData = JSON.parse(fs.readFileSync("scripts/extracted-strings.json", "utf-8"));
const extractedStrings: ExtractedString[] = extractedData.strings;

// Load translation files
const enTranslations: TranslationFile = JSON.parse(fs.readFileSync("public/locales/en/common.json", "utf-8"));
const ukTranslations: TranslationFile = JSON.parse(fs.readFileSync("public/locales/uk/common.json", "utf-8"));

// Flatten nested translation keys to dot notation
function flattenKeys(obj: any, prefix = ""): Set<string> {
  const keys = new Set<string>();
  
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
      const nested = flattenKeys(obj[key], fullKey);
      nested.forEach(k => keys.add(k));
    } else {
      keys.add(fullKey);
    }
  }
  
  return keys;
}

// Get value from nested object using dot notation
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

const enKeys = flattenKeys(enTranslations);
const ukKeys = flattenKeys(ukTranslations);

console.log("\n=== I18N COVERAGE REPORT ===\n");
console.log(`Total extracted strings: ${extractedStrings.length}`);
console.log(`Total EN translation keys: ${enKeys.size}`);
console.log(`Total UK translation keys: ${ukKeys.size}`);

// Check for missing translations (EN)
const emptyEnTranslations: string[] = [];
enKeys.forEach(key => {
  const value = getNestedValue(enTranslations, key);
  if (!value || value === "") {
    emptyEnTranslations.push(key);
  }
});

// Check for missing translations (UK)
const emptyUkTranslations: string[] = [];
ukKeys.forEach(key => {
  const value = getNestedValue(ukTranslations, key);
  if (!value || value === "") {
    emptyUkTranslations.push(key);
  }
});

// Keys in EN but not in UK
const missingInUk = Array.from(enKeys).filter(k => !ukKeys.has(k));

// Keys in UK but not in EN
const missingInEn = Array.from(ukKeys).filter(k => !enKeys.has(k));

// Check coverage of extracted strings
// This is approximate - we can't perfectly map extracted strings to keys
// But we can check if key taxonomy covers major components
const componentCoverage: Record<string, { total: number; covered: number }> = {};

extractedData.byFile && Object.keys(extractedData.byFile).forEach((file: string) => {
  const fileName = file.split("/").pop()?.replace(".tsx", "") || file;
  const count = extractedData.byFile[file].length;
  
  // Check if we have keys for this component
  const componentPrefix = file.includes("/pages/") ? "page" : "component";
  const componentName = fileName.toLowerCase().replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const searchKey = `${componentPrefix}.${componentName}`;
  
  const covered = Array.from(enKeys).filter(k => k.startsWith(searchKey)).length;
  
  componentCoverage[fileName] = { total: count, covered };
});

console.log("\n## Translation Quality\n");
console.log(`Empty EN translations: ${emptyEnTranslations.length}`);
if (emptyEnTranslations.length > 0) {
  emptyEnTranslations.slice(0, 10).forEach(key => console.log(`  - ${key}`));
  if (emptyEnTranslations.length > 10) {
    console.log(`  ... and ${emptyEnTranslations.length - 10} more`);
  }
}

console.log(`\nEmpty UK translations: ${emptyUkTranslations.length}`);
if (emptyUkTranslations.length > 0) {
  emptyUkTranslations.slice(0, 10).forEach(key => console.log(`  - ${key}`));
  if (emptyUkTranslations.length > 10) {
    console.log(`  ... and ${emptyUkTranslations.length - 10} more`);
  }
}

console.log("\n## Translation Parity\n");
console.log(`Keys in EN but missing in UK: ${missingInUk.length}`);
if (missingInUk.length > 0) {
  missingInUk.slice(0, 10).forEach(key => console.log(`  - ${key}`));
  if (missingInUk.length > 10) {
    console.log(`  ... and ${missingInUk.length - 10} more`);
  }
}

console.log(`\nKeys in UK but missing in EN: ${missingInEn.length}`);
if (missingInEn.length > 0) {
  missingInEn.slice(0, 10).forEach(key => console.log(`  - ${key}`));
  if (missingInEn.length > 10) {
    console.log(`  ... and ${missingInEn.length - 10} more`);
  }
}

console.log("\n## Component Coverage (Approximate)\n");
Object.keys(componentCoverage)
  .sort((a, b) => componentCoverage[b].total - componentCoverage[a].total)
  .slice(0, 15)
  .forEach(component => {
    const { total, covered } = componentCoverage[component];
    const percentage = total > 0 ? Math.round((covered / total) * 100) : 0;
    const status = covered === 0 ? "❌" : covered < total ? "⚠️" : "✅";
    console.log(`${status} ${component}: ${covered}/${total} keys (${percentage}%)`);
  });

// Save detailed report
const report = {
  summary: {
    extractedStrings: extractedStrings.length,
    enKeys: enKeys.size,
    ukKeys: ukKeys.size,
    emptyEn: emptyEnTranslations.length,
    emptyUk: emptyUkTranslations.length,
    missingInUk: missingInUk.length,
    missingInEn: missingInEn.length,
  },
  issues: {
    emptyEnTranslations,
    emptyUkTranslations,
    missingInUk,
    missingInEn,
  },
  componentCoverage,
};

fs.writeFileSync("scripts/coverage-report.json", JSON.stringify(report, null, 2));
console.log(`\n✅ Detailed report saved to scripts/coverage-report.json`);

// Exit with error if coverage is incomplete
const hasIssues = emptyEnTranslations.length > 0 || 
                 emptyUkTranslations.length > 0 || 
                 missingInUk.length > 0 || 
                 missingInEn.length > 0;

if (hasIssues) {
  console.log("\n⚠️  Translation coverage incomplete - address issues above");
  process.exit(1);
} else {
  console.log("\n✅ All translations complete!");
  process.exit(0);
}
