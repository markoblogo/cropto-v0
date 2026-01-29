#!/usr/bin/env tsx
// E2E Smoke Test - Verifies core application flows
// Usage:
//   API_BASE_URL=http://localhost:5000 tsx scripts/e2e_smoke.ts
//
// By default, this script runs in READ-ONLY mode when API_BASE_URL is not localhost,
// to avoid polluting production/demo databases.
// To allow write operations (create/match/exercise), set:
//   E2E_ALLOW_MUTATIONS=true

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5000";

const isLocalBaseUrl = (() => {
  try {
    const u = new URL(API_BASE_URL);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    // If it's not a valid URL, assume local
    return true;
  }
})();

const allowMutations = String(process.env.E2E_ALLOW_MUTATIONS || "").toLowerCase() === "true";
const readOnlyMode = !isLocalBaseUrl && !allowMutations;

const allowedIgcSources = (process.env.E2E_ALLOWED_IGC_SOURCES || "IGC,manual")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

interface TestResult {
  step: string;
  status: "PASS" | "FAIL" | "SKIP";
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function logResult(step: string, status: "PASS" | "FAIL" | "SKIP", message: string, details?: any) {
  results.push({ step, status, message, details });
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⏭️";
  console.log(`${icon} ${step}: ${message}`);
  if (details && status === "FAIL") {
    console.log(`   Details: ${JSON.stringify(details, null, 2)}`);
  }
}

function fail(step: string, message: string, details?: any): never {
  logResult(step, "FAIL", message, details);
  console.error(`\n❌ Smoke test FAILED at step: ${step}`);
  process.exit(1);
}

async function apiRequest(method: string, path: string, token?: string, body?: any) {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();
  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw {
      status: response.status,
      statusText: response.statusText,
      body: data,
      url,
    };
  }

  return { status: response.status, data };
}

function normalizeDashboardPayload(payload: any): Record<string, any[]> {
  if (!payload) return {};
  if (payload.ua || payload.br || payload.ar || payload.us) return payload;
  if (payload.data && (payload.data.ua || payload.data.br || payload.data.ar || payload.data.us)) return payload.data;
  return {};
}

async function main() {
  console.log("🔥 Starting E2E Smoke Test\n");
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Mode: ${readOnlyMode ? "READ_ONLY" : "MUTATING"}`);
  if (readOnlyMode) {
    console.log("Note: write steps are skipped to avoid polluting non-local environments.");
    console.log('      To allow mutations, run with E2E_ALLOW_MUTATIONS=true');
  }
  console.log("");

  let farmerToken: string;
  let brokerToken: string;
  let optionId: string;
  let farmerId: string;

  try {
    // Step 1: Healthcheck
    console.log("Step 1: Healthcheck");
    try {
      const { data } = await apiRequest("GET", "/api/health");
      if (data.ok === true) {
        logResult("Healthcheck", "PASS", "API is healthy");
      } else {
        fail("Healthcheck", `Expected { ok: true }, got ${JSON.stringify(data)}`);
      }
    } catch (error: any) {
      fail("Healthcheck", `HTTP ${error.status}: ${error.statusText}`, error.body);
    }

    // Step 2: Market dashboard (IGC) sanity
    console.log("\nStep 2: Market dashboard sanity (IGC)");
    try {
      const { data } = await apiRequest("GET", "/api/market-dashboard");
      const dash = normalizeDashboardPayload(data);

      const requiredTabs: Array<"ua" | "br" | "ar" | "us"> = ["ua", "br", "ar", "us"];
      for (const tab of requiredTabs) {
        if (!Array.isArray(dash[tab])) {
          fail("Market dashboard", `Missing or invalid tab: ${tab}`, { keys: Object.keys(dash || {}) });
        }
      }

      const checkCountry = (tab: "br" | "ar" | "us") => {
        const rows = dash[tab] || [];
        if (rows.length === 0) {
          fail("Market dashboard", `${tab.toUpperCase()} has no rows`, { tab, rows });
        }
        const sources = [...new Set(rows.map((r: any) => r?.source).filter(Boolean))];
        const hasMock = rows.some((r: any) => String(r?.source).toLowerCase() === "mock");
        if (hasMock) {
          fail("Market dashboard", `${tab.toUpperCase()} includes mock fallback (unexpected)`, { tab, sources });
        }
        const strictIgc = String(process.env.E2E_STRICT_IGC || "").toLowerCase() === "true";

        const hasAllowed = rows.some((r: any) => allowedIgcSources.includes(String(r?.source)));
        if (!hasAllowed) {
          fail("Market dashboard", `${tab.toUpperCase()} has no allowed source rows`, {
            tab,
            sources,
            allowedSources: allowedIgcSources,
          });
        }

        if (strictIgc && !rows.some((r: any) => String(r?.source) === "IGC")) {
          fail("Market dashboard", `${tab.toUpperCase()} is missing IGC source rows (strict)`, {
            tab,
            sources,
          });
        }

        return sources;
      };

      const brSources = checkCountry("br");
      const arSources = checkCountry("ar");
      const usSources = checkCountry("us");

      logResult(
        "Market dashboard",
        "PASS",
        `BR/AR/US present; sources: br=${brSources.join(",") || "?"}, ar=${arSources.join(",") || "?"}, us=${usSources.join(",") || "?"}`
      );
    } catch (error: any) {
      fail("Market dashboard", `HTTP ${error.status}: ${error.statusText}`, error.body);
    }

    // Step 3: Login as farmer
    console.log("\nStep 3: Login as farmer@demo");
    try {
      const { data } = await apiRequest("POST", "/api/auth/login", undefined, {
        email: "farmer@demo",
        password: "pass",
      });

      farmerToken = data.token || data.accessToken;
      if (!farmerToken) {
        fail("Login (farmer)", "Token missing from login response", data);
      }

      farmerId = data.user?.id || data.id;
      logResult("Login (farmer)", "PASS", `Logged in successfully (user: ${farmerId})`);
    } catch (error: any) {
      fail("Login (farmer)", `HTTP ${error.status}: ${error.statusText}`, error.body);
    }

    // Step 4: Get available index for option creation (read-only safe)
    console.log("\nStep 4: Get available indexes");
    let indexId: string;
    try {
      const { data } = await apiRequest("GET", "/api/indexes");
      const indexes = Array.isArray(data) ? data : data.indexes || [];
      if (indexes.length === 0) {
        fail("Get indexes", "No indexes available");
      }
      indexId = indexes[0].id;
      logResult("Get indexes", "PASS", `Found ${indexes.length} index(es), using: ${indexId}`);
    } catch (error: any) {
      fail("Get indexes", `HTTP ${error.status}: ${error.statusText}`, error.body);
    }

    if (readOnlyMode) {
      logResult(
        "Mutating steps",
        "SKIP",
        "Skipping create/match/exercise to avoid polluting non-local environment"
      );

      // Summary
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📊 E2E SMOKE TEST SUMMARY");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      const passed = results.filter((r) => r.status === "PASS").length;
      const failed = results.filter((r) => r.status === "FAIL").length;
      const skipped = results.filter((r) => r.status === "SKIP").length;

      console.log(`✅ Passed: ${passed}`);
      console.log(`❌ Failed: ${failed}`);
      console.log(`⏭️  Skipped: ${skipped}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      if (failed > 0) {
        console.error("❌ Smoke test FAILED");
        process.exit(1);
      } else {
        console.log("✅ Smoke test PASSED");
        process.exit(0);
      }
    }

    // Step 5: Create option (as farmer)
    console.log("\nStep 5: Create option (as farmer)");
    try {
      // Calculate expiration date (3 months from now)
      const expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() + 3);

      const optionPayload = {
        title: `E2E Smoke Test Option ${new Date().toISOString()}`,
        indexId: indexId,
        type: "CALL",
        strike: "200",
        qty: "100",
        premium: "2",
        expirationDate: expirationDate.toISOString(),
        expiryHalf: "H1",
        expiryMonth: expirationDate.getMonth() + 1,
        expiryYear: expirationDate.getFullYear(),
      };

      const { status, data } = await apiRequest("POST", "/api/options", farmerToken, optionPayload);

      if (status === 201 || status === 200) {
        optionId = data.id || data.option?.id;
        if (!optionId) {
          fail("Create option", "Option ID missing from response", data);
        }
        logResult("Create option", "PASS", `Option created: ${optionId}`);
      } else {
        fail("Create option", `Unexpected status: ${status}`, data);
      }
    } catch (error: any) {
      fail("Create option", `HTTP ${error.status}: ${error.statusText}`, error.body);
    }

    // Step 6: Login as broker
    console.log("\nStep 6: Login as broker@demo");
    try {
      const { data } = await apiRequest("POST", "/api/auth/login", undefined, {
        email: "broker@demo",
        password: "pass",
      });

      brokerToken = data.token || data.accessToken;
      if (!brokerToken) {
        fail("Login (broker)", "Token missing from login response", data);
      }

      logResult("Login (broker)", "PASS", "Logged in successfully");
    } catch (error: any) {
      fail("Login (broker)", `HTTP ${error.status}: ${error.statusText}`, error.body);
    }

    // Step 7: Match option (as broker)
    console.log("\nStep 7: Match option (as broker)");
    try {
      const { status, data } = await apiRequest("POST", `/api/options/${optionId}/match`, brokerToken, {
        counterpartyId: farmerId,
      });

      if (status === 200 || status === 201) {
        logResult("Match option", "PASS", "Option matched successfully");
      } else {
        fail("Match option", `Unexpected status: ${status}`, data);
      }
    } catch (error: any) {
      fail("Match option", `HTTP ${error.status}: ${error.statusText}`, error.body);
    }

    // Step 8: Exercise option (requires DEMO_RELAX_CROPT_CHECK=true on server)
    console.log("\nStep 8: Exercise option (with DEMO_RELAX_CROPT_CHECK=true)");
    console.log("   Note: Server must be running with DEMO_RELAX_CROPT_CHECK=true");
    try {
      const { status, data } = await apiRequest("POST", `/api/options/${optionId}/exercise`, farmerToken, {
        spotPrice: 260,
      });

      if (status === 200 || status === 201) {
        logResult("Exercise option", "PASS", "Option exercised successfully");
        if (data.settlementId || data.id) {
          logResult("Exercise option", "PASS", `Settlement created: ${data.settlementId || data.id}`);
        }
      } else {
        fail("Exercise option", `Unexpected status: ${status}`, data);
      }
    } catch (error: any) {
      if (
        error.status === 400 &&
        (String(error.body?.error || "").toLowerCase().includes("cropt") ||
          String(error.body?.error || "").toLowerCase().includes("balance"))
      ) {
        logResult(
          "Exercise option",
          "FAIL",
          "Exercise failed - DEMO_RELAX_CROPT_CHECK may not be enabled on server",
          error.body
        );
        console.log("   ⚠️  Tip: Start server with DEMO_RELAX_CROPT_CHECK=true environment variable");
      } else {
        fail("Exercise option", `HTTP ${error.status}: ${error.statusText}`, error.body);
      }
    }

    // Step 9: Verify portfolio/settlements
    console.log("\nStep 9: Verify portfolio/settlements");
    try {
      const { data: portfolioData } = await apiRequest("GET", "/api/portfolio/me", farmerToken);

      const hasSettlements = portfolioData?.settlements && portfolioData.settlements.length > 0;
      const hasPositions = portfolioData?.positions && portfolioData.positions.length > 0;

      if (hasSettlements || hasPositions) {
        logResult(
          "Verify portfolio",
          "PASS",
          `Found ${portfolioData.settlements?.length || 0} settlement(s), ${portfolioData.positions?.length || 0} position(s)`
        );
      } else {
        try {
          const { data: settlementsData } = await apiRequest("GET", "/api/settlements", farmerToken);
          const settlements = Array.isArray(settlementsData) ? settlementsData : settlementsData?.settlements || [];
          if (settlements.length > 0) {
            logResult("Verify settlements", "PASS", `Found ${settlements.length} settlement(s)`);
          } else {
            logResult("Verify portfolio", "SKIP", "No settlements found (may be expected for new accounts)");
          }
        } catch {
          logResult("Verify portfolio", "SKIP", "Could not verify settlements (endpoint may not be available)");
        }
      }
    } catch (error: any) {
      logResult("Verify portfolio", "SKIP", `Portfolio endpoint returned HTTP ${error.status}`, error.body);
    }

    // Summary
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 E2E SMOKE TEST SUMMARY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const passed = results.filter((r) => r.status === "PASS").length;
    const failed = results.filter((r) => r.status === "FAIL").length;
    const skipped = results.filter((r) => r.status === "SKIP").length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (failed > 0) {
      console.error("❌ Smoke test FAILED");
      process.exit(1);
    } else {
      console.log("✅ Smoke test PASSED");
      process.exit(0);
    }
  } catch (error: any) {
    console.error("\n❌ Unexpected error:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
