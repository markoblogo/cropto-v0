import { parseIndexMessage, parseSpikeMessage, parseSimpleMessage } from "../server/services/telegramParser.js";

console.log("🧪 Testing Telegram Parser (Unit Tests)");
console.log("======================================\n");

const tests = [
  {
    name: "Test 1: Simple Format (WHEAT 240.50)",
    text: "WHEAT 240.50",
    expected: { commodity: "WHEAT", price: 240.50 },
  },
  {
    name: "Test 2: Spike Format - Ukrainian (Пшениця 11.5pro – 221$)",
    text: "• Пшениця 11.5pro – 221$ (0$)",
    expected: { commodity: "WHEAT", price: 221 },
  },
  {
    name: "Test 3: Full Spike Message",
    text: `SPIKE Spot Commodity Index Ukraine
11.11.2025

CPT ОДЕСА, УКРАЇНА (експорт)

• Кукурудза – 208$ (0$)
• Пшениця 11.5pro – 221$ (0$)
• Пшениця фураж – 211$ (0$) 
• Соя ГМО – 412$ (0$)`,
    expected: { commodity: "WHEAT", price: 221 },
  },
  {
    name: "Test 4: Price with comma (221,5$)",
    text: "• Пшениця 11.5pro – 221,5$ (+2$)",
    expected: { commodity: "WHEAT", price: 221.5 },
  },
  {
    name: "Test 5: Simple with BTC",
    text: "BTC 45000.00",
    expected: { commodity: "BTC", price: 45000 },
  },
  {
    name: "Test 6: Invalid format (should fail)",
    text: "This is just random text",
    expected: null,
  },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  console.log(`\n${test.name}`);
  console.log("-".repeat(50));
  console.log(`Input: "${test.text.substring(0, 60)}${test.text.length > 60 ? '...' : ''}"`);
  
  const result = parseIndexMessage(test.text);
  
  if (test.expected === null) {
    if (!result.success) {
      console.log(`✅ PASS: Correctly rejected invalid format`);
      console.log(`   Error: ${result.error}`);
      passed++;
    } else {
      console.log(`❌ FAIL: Should have rejected but got: ${JSON.stringify(result.data)}`);
      failed++;
    }
  } else {
    if (result.success && result.data) {
      const { commodity, price } = result.data;
      const commodityMatch = commodity === test.expected.commodity;
      const priceMatch = Math.abs(price - test.expected.price) < 0.01;
      
      if (commodityMatch && priceMatch) {
        console.log(`✅ PASS: ${commodity} = $${price}`);
        if (result.data.location) {
          console.log(`   Location: ${result.data.location}`);
        }
        if (result.data.change !== undefined) {
          console.log(`   Change: ${result.data.change > 0 ? '+' : ''}${result.data.change}$`);
        }
        passed++;
      } else {
        console.log(`❌ FAIL:`);
        console.log(`   Expected: ${test.expected.commodity} = $${test.expected.price}`);
        console.log(`   Got: ${commodity} = $${price}`);
        failed++;
      }
    } else {
      console.log(`❌ FAIL: Parse failed`);
      console.log(`   Error: ${result.error}`);
      console.log(`   Expected: ${test.expected.commodity} = $${test.expected.price}`);
      failed++;
    }
  }
}

console.log("\n" + "=".repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log("\n✅ All tests passed!");
  process.exit(0);
} else {
  console.log(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
}
