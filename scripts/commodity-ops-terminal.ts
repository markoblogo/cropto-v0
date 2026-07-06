#!/usr/bin/env tsx
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type OpsMode = "readonly" | "demo" | "operator";

type SessionState = {
  mode: OpsMode;
  startedAt: string;
};

type Preview = {
  action: string;
  mode: OpsMode;
  idempotencyKey: string;
  previewHash: string;
  payload: Record<string, unknown>;
  sideEffects: string[];
  executeAllowed: boolean;
  warnings: string[];
};

const MODES: OpsMode[] = ["readonly", "demo", "operator"];
const CONFIG_DIR = process.env.CROPTO_OPS_CONFIG_DIR || path.join(os.homedir(), ".config", "cropto-ops-terminal");
const SESSION_PATH = path.join(CONFIG_DIR, "session.json");
const AUDIT_LOG_PATH = process.env.CROPTO_OPS_AUDIT_LOG || path.join(CONFIG_DIR, "audit.log");
const OPERATOR_GATE_ENV = "CROPTO_OPS_ALLOW_OPERATOR_ACTIONS";

class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }

  return { positional, flags };
}

function parseMode(value: unknown): OpsMode {
  const raw = String(value || "").trim();
  if (MODES.includes(raw as OpsMode)) return raw as OpsMode;
  throw new CliError("CROPTO_OPS_INVALID_MODE", `Unknown mode "${raw}". Use: ${MODES.join(" | ")}.`);
}

function readSession(): SessionState | null {
  if (!fs.existsSync(SESSION_PATH)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(SESSION_PATH, "utf8")) as SessionState;
    if (!MODES.includes(state.mode)) throw new Error("unknown mode");
    return state;
  } catch (error) {
    throw new CliError("CROPTO_OPS_SESSION_CORRUPT", `Session file is corrupt: ${SESSION_PATH}. Delete it and run session start.`);
  }
}

function writeSession(mode: OpsMode) {
  const state: SessionState = { mode, startedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(SESSION_PATH), { recursive: true });
  fs.writeFileSync(SESSION_PATH, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  return state;
}

function clearSession() {
  if (fs.existsSync(SESSION_PATH)) fs.rmSync(SESSION_PATH);
}

function requireSession(): SessionState {
  const state = readSession();
  if (!state) {
    throw new CliError(
      "CROPTO_OPS_SESSION_REQUIRED",
      "No active ops mode. Run: npm run ops:terminal -- session start --mode readonly",
    );
  }
  return state;
}

function requireValue(flags: Record<string, string | boolean>, key: string): string {
  const value = flags[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new CliError("CROPTO_OPS_INVALID_ARGUMENT", `Missing required --${key}.`);
  }
  return value.trim();
}

function optionalValue(flags: Record<string, string | boolean>, key: string): string | null {
  const value = flags[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boolFlag(flags: Record<string, string | boolean>, key: string): boolean {
  return flags[key] === true || flags[key] === "true";
}

function makeIdempotencyKey(action: string) {
  return `cropto_${action.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${crypto.randomUUID()}`;
}

function stableHash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function appendAudit(entry: Record<string, unknown>) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    fs.appendFileSync(AUDIT_LOG_PATH, `${line}\n`, { mode: 0o600 });
  } catch (error) {
    console.error(`Warning: failed to write audit log ${AUDIT_LOG_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function assertNoAutonomousIntent(flags: Record<string, string | boolean>) {
  const text = Object.values(flags)
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const banned = [
    "autonomous",
    "auto-trade",
    "stonks",
    "without confirmation",
    "no confirmation",
    "price trigger",
    "price-triggered",
    "profitable match",
    "automatically execute",
    "execute all",
    "trade with real funds",
    "real money",
  ];
  const matched = banned.find((item) => text.includes(item));
  if (matched) {
    throw new CliError(
      "CROPTO_OPS_AUTONOMOUS_TRADING_FORBIDDEN",
      `Autonomous trading/execution is forbidden (${matched}). Use alerts, reports or previews for human approval.`,
    );
  }
}

function buildPreview(state: SessionState, action: string, payload: Record<string, unknown>, sideEffects: string[], warnings: string[]): Preview {
  const idempotencyKey = String(payload.idempotencyKey || makeIdempotencyKey(action));
  const canonicalPayload = { ...payload, idempotencyKey };
  return {
    action,
    mode: state.mode,
    idempotencyKey,
    previewHash: stableHash({ action, mode: state.mode, payload: canonicalPayload }),
    payload: canonicalPayload,
    sideEffects,
    executeAllowed: false,
    warnings,
  };
}

function handleSession(command: string | undefined, flags: Record<string, string | boolean>) {
  if (command === "status") {
    const state = readSession();
    printJson({
      active: Boolean(state),
      activeMode: state?.mode || null,
      startedAt: state?.startedAt || null,
      modes: {
        readonly: "market/data scanner only",
        demo: "sandbox previews and simulated workflows",
        operator: "approval-gated production operator dispatch, not autonomous market execution",
      },
      operatorGate: {
        env: OPERATOR_GATE_ENV,
        enabled: process.env[OPERATOR_GATE_ENV] === "true",
      },
      auditLogPath: AUDIT_LOG_PATH,
      autonomousTrading: "forbidden",
    });
    return;
  }

  if (command === "start") {
    const mode = parseMode(flags.mode || "readonly");
    const state = writeSession(mode);
    appendAudit({ mode, action: "session.start", status: "ok" });
    printJson({ ok: true, ...state });
    return;
  }

  if (command === "end") {
    const previous = readSession();
    clearSession();
    appendAudit({ mode: previous?.mode || null, action: "session.end", status: "ok" });
    printJson({ ok: true, previousMode: previous?.mode || null });
    return;
  }

  throw new CliError("CROPTO_OPS_INVALID_COMMAND", "Use: session status | start | end.");
}

function handleExposure(command: string | undefined, flags: Record<string, string | boolean>) {
  if (command !== "scan") throw new CliError("CROPTO_OPS_INVALID_COMMAND", "Use: exposure scan.");
  const state = requireSession();
  assertNoAutonomousIntent(flags);
  const payload = {
    scope: optionalValue(flags, "scope") || "all",
    commodity: optionalValue(flags, "commodity"),
    basis: optionalValue(flags, "basis"),
    source: optionalValue(flags, "source") || "api-snapshot",
  };
  const preview = buildPreview(state, "exposure.scan", payload, ["read market, portfolio and open workflow data"], [
    "readonly scanner: no production mutations",
    "wire to /api/portfolio/summary, /api/markets/chain and monitor endpoints in the next implementation slice",
  ]);
  appendAudit({ mode: state.mode, action: "exposure.scan.preview", status: "preview", key: preview.idempotencyKey, hash: preview.previewHash });
  printJson(preview);
}

function handleTrade(command: string | undefined, flags: Record<string, string | boolean>) {
  if (command !== "preview") throw new CliError("CROPTO_OPS_INVALID_COMMAND", "Use: trade preview.");
  const state = requireSession();
  assertNoAutonomousIntent(flags);
  const type = requireValue(flags, "type").toLowerCase();
  if (!["bid", "offer", "trade"].includes(type)) {
    throw new CliError("CROPTO_OPS_INVALID_ARGUMENT", "--type must be bid | offer | trade.");
  }
  const payload = {
    type,
    commodity: requireValue(flags, "commodity"),
    side: optionalValue(flags, "side"),
    quantityMt: optionalValue(flags, "quantity-mt"),
    basis: optionalValue(flags, "basis"),
    price: optionalValue(flags, "price"),
    currency: optionalValue(flags, "currency") || "USD",
    delivery: optionalValue(flags, "delivery"),
    broker: optionalValue(flags, "broker"),
    idempotencyKey: optionalValue(flags, "idempotency-key"),
  };
  const preview = buildPreview(state, `trade.${type}.preview`, payload, [
    "no BID/OFFER/TRADE entry is created",
    "no Telegram relay is sent",
  ], [
    "operator dispatch requires exact preview confirmation and server-side idempotency",
  ]);
  appendAudit({ mode: state.mode, action: "trade.preview", target: type, status: "preview", key: preview.idempotencyKey, hash: preview.previewHash });
  printJson(preview);
}

function handleTelegram(command: string | undefined, flags: Record<string, string | boolean>) {
  if (command !== "preview") throw new CliError("CROPTO_OPS_INVALID_COMMAND", "Use: telegram preview.");
  const state = requireSession();
  assertNoAutonomousIntent(flags);
  const payload = {
    channel: optionalValue(flags, "channel") || "internal-preview",
    title: optionalValue(flags, "title") || "Cropto market update",
    body: requireValue(flags, "body"),
    idempotencyKey: optionalValue(flags, "idempotency-key"),
  };
  const preview = buildPreview(state, "telegram.report.preview", payload, ["no Telegram message is sent"], [
    "preview only; real sends require operator mode, confirm and relay adapter",
  ]);
  appendAudit({ mode: state.mode, action: "telegram.preview", target: payload.channel, status: "preview", key: preview.idempotencyKey, hash: preview.previewHash });
  printJson(preview);
}

function handleExecute(command: string | undefined, flags: Record<string, string | boolean>) {
  if (command !== "previewed") throw new CliError("CROPTO_OPS_INVALID_COMMAND", "Use: execute previewed.");
  const state = requireSession();
  if (state.mode !== "operator") {
    throw new CliError("CROPTO_OPS_OPERATOR_MODE_REQUIRED", "Execution requires an active operator session.");
  }
  if (process.env[OPERATOR_GATE_ENV] !== "true") {
    throw new CliError("CROPTO_OPS_OPERATOR_GATE_DISABLED", `Set ${OPERATOR_GATE_ENV}=true only in an approved operator environment.`);
  }
  if (!boolFlag(flags, "confirm")) {
    throw new CliError("CROPTO_OPS_CONFIRM_REQUIRED", "Execution requires --confirm after explicit human approval.");
  }
  const idempotencyKey = requireValue(flags, "idempotency-key");
  const previewHash = requireValue(flags, "preview-hash");
  appendAudit({ mode: state.mode, action: "execute.previewed", status: "blocked:not_implemented", key: idempotencyKey, hash: previewHash });
  throw new CliError(
    "CROPTO_OPS_EXECUTION_ADAPTER_NOT_IMPLEMENTED",
    "Operator dispatch is intentionally not wired yet. Add endpoint-specific auth, server idempotency and eval coverage first.",
  );
}

function printHelp() {
  console.log(`commodity-ops-terminal

Usage:
  npm run ops:terminal -- session status
  npm run ops:terminal -- session start --mode readonly|demo|operator
  npm run ops:terminal -- session end
  npm run ops:terminal -- exposure scan [--scope all] [--commodity wheat]
  npm run ops:terminal -- trade preview --type bid|offer|trade --commodity wheat [--quantity-mt 1000] [--price 200]
  npm run ops:terminal -- telegram preview --body "message"
  npm run ops:terminal -- execute previewed --idempotency-key <key> --preview-hash <hash> --confirm

Autonomous trading/execution is forbidden. Operator dispatch is not wired in this skeleton.`);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [domain, command] = positional;

  if (!domain || domain === "help" || domain === "--help") return printHelp();
  if (domain === "session") return handleSession(command, flags);
  if (domain === "exposure") return handleExposure(command, flags);
  if (domain === "trade") return handleTrade(command, flags);
  if (domain === "telegram") return handleTelegram(command, flags);
  if (domain === "execute") return handleExecute(command, flags);

  throw new CliError("CROPTO_OPS_INVALID_COMMAND", `Unknown command domain "${domain}".`);
}

main().catch((error) => {
  if (error instanceof CliError) {
    console.error(`Error: ${error.message} [${error.code}]`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
