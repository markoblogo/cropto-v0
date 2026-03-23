const baseUrl = process.env.MONITOR_BASE_URL || "http://localhost:5000";
const endpoint = `${baseUrl.replace(/\/$/, "")}/api/monitor/activation-report`;

async function run() {
  const response = await fetch(endpoint, {
    headers: {
      accept: "application/json",
      "user-agent": "CroptoMonitor/fpma-discovery-smoke",
    },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();

  const discovery = data?.fpmaDiscovery || {};
  const testRows: any[] = Array.isArray(data?.fpmaResolutionTest) ? data.fpmaResolutionTest : [];

  console.log(`fpmaDiscovery: fetchedAt=${discovery?.fetchedAt || "n/a"} cacheHit=${discovery?.cacheHit ? "yes" : "no"} countries=${discovery?.countriesCount ?? 0} commodities=${discovery?.commoditiesCount ?? 0} priceTypes=${discovery?.priceTypesCount ?? 0}`);
  const tried = Array.isArray(discovery?.endpointsTried) ? discovery.endpointsTried : [];
  if (tried.length) {
    console.log(`endpointsTried: ${tried.map((item: any) => `${item.name}:${item.ok ? "ok" : "err"}${item.status ? `(${item.status})` : ""}`).join(", ")}`);
  }
  if (Array.isArray(discovery?.notes) && discovery.notes.length) {
    console.log(`notes: ${discovery.notes.join(" | ")}`);
  }

  const keyCases = [
    { country: "UA", crop: "WHEAT" },
    { country: "US", crop: "WHEAT" },
    { country: "BR", crop: "WHEAT" },
    { country: "AR", crop: "WHEAT" },
  ];

  for (const keyCase of keyCases) {
    const test = testRows.find((row) => row?.country === keyCase.country && row?.crop === keyCase.crop);
    console.log(`${keyCase.country} ${keyCase.crop}: ok=${test?.ok ? "yes" : "no"} ids=${test?.idsCount ?? 0} method=${test?.methodUsed || "n/a"}`);
  }
}

run().catch((error: any) => {
  console.error("fpma discovery smoke failed", error?.message || error);
  process.exitCode = 1;
});
