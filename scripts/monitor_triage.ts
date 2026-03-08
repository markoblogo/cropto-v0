const baseUrl = process.env.MONITOR_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const endpoint = `${baseUrl.replace(/\/$/, "")}/api/monitor/triage-report`;

function pad(value: string, size: number): string {
  const raw = String(value || "");
  return raw.length >= size ? raw.slice(0, size) : raw.padEnd(size, " ");
}

async function run() {
  const response = await fetch(endpoint, {
    headers: {
      accept: "application/json",
      "user-agent": "CroptoMonitor/triage-cli",
    },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  const providers: any[] = Array.isArray(data?.providers) ? data.providers : [];
  const lines = [
    `${pad("Provider", 22)} ${pad("Status", 12)} ${pad("Coverage", 10)} ${pad("errorKind", 16)} Quick Fix`,
    `${"-".repeat(22)} ${"-".repeat(12)} ${"-".repeat(10)} ${"-".repeat(16)} ${"-".repeat(40)}`,
  ];

  for (const provider of providers) {
    const fix = Array.isArray(provider?.suggestedFix?.actions) ? provider.suggestedFix.actions[0] : "No action";
    lines.push(
      `${pad(provider?.providerId || "unknown", 22)} ${pad(provider?.status || "OFFLINE", 12)} ${pad(provider?.coverage || "0/0", 10)} ${pad(provider?.errorKind || "none", 16)} ${fix}`,
    );
  }

  const suggested = providers
    .flatMap((provider) =>
      (provider?.suggestedFix?.actions || []).map((action: string) => ({
        severity: provider?.suggestedFix?.severity || "INFO",
        providerId: provider?.providerId || "unknown",
        action,
      })),
    )
    .slice(0, 5);

  console.log(`triage-report: ${data?.runtime?.timestamp || new Date().toISOString()}`);
  console.log(lines.join("\n"));
  if (suggested.length) {
    console.log("");
    console.log("Top suggested actions:");
    for (const item of suggested) {
      console.log(`- [${item.severity}] ${item.providerId}: ${item.action}`);
    }
  }
}

run().catch((error: any) => {
  console.error("monitor:triage failed", error?.message || error);
  process.exitCode = 1;
});
