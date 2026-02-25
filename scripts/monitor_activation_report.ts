const baseUrl = process.env.MONITOR_BASE_URL || "http://localhost:5000";
const endpoint = `${baseUrl.replace(/\/$/, "")}/api/monitor/activation-report`;

function line(provider: any) {
  const status = provider?.status || "OFFLINE";
  const coverage = provider?.coverage || "0/0";
  const errorKind = provider?.lastError?.errorKind || "none";
  return `${provider?.providerId}: status=${status} coverage=${coverage} errorKind=${errorKind}`;
}

async function run() {
  const response = await fetch(endpoint, {
    headers: {
      accept: "application/json",
      "user-agent": "CroptoMonitor/activation-report-cli",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const providers: any[] = Array.isArray(data?.providers) ? data.providers : [];

  const db = providers.find((p) => p.providerId === "dbnomics-worldbank") || { providerId: "dbnomics-worldbank" };
  const fao = providers.find((p) => p.providerId === "fao-ffpi") || { providerId: "fao-ffpi" };
  const mars = providers.find((p) => p.providerId === "usda-mars-public") || { providerId: "usda-mars-public" };
  const alpha = providers.find((p) => p.providerId === "alpha-vantage-commodities") || { providerId: "alpha-vantage-commodities" };
  const gtr = providers.find((p) => p.providerId === "usda-gtr-logistics") || { providerId: "usda-gtr-logistics" };
  const faostat = providers.find((p) => p.providerId === "faostat-pp") || { providerId: "faostat-pp" };

  const marsWidget = (Array.isArray(data?.widgets) ? data.widgets : []).find((w: any) => w.widgetKind === "USDA_MARS_REPORTS");
  const reportsMatched = marsWidget?.reportsCount ?? mars?.mappedCount ?? 0;

  console.log(`activation-report: ${data?.runtime?.timestamp || new Date().toISOString()}`);
  console.log(line(db));
  console.log(line(fao));
  console.log(`${line(mars)} reportsMatched=${reportsMatched}`);
  console.log(line(alpha));
  console.log(line(gtr));
  console.log(line(faostat));
}

run().catch((error: any) => {
  console.error("monitor:activation-report failed", error?.message || error);
  process.exitCode = 1;
});
