export type EventLoopWatchdogOptions = {
  intervalMs?: number;
  thresholdMs?: number;
  exitCode?: number;
  now?: () => number;
  onStall?: (lagMs: number) => void;
};

export function calculateEventLoopLagMs(expectedAtMs: number, actualAtMs: number, intervalMs: number): number {
  return Math.max(0, actualAtMs - expectedAtMs - intervalMs);
}

export function startEventLoopWatchdog(options: EventLoopWatchdogOptions = {}): NodeJS.Timeout {
  const intervalMs = options.intervalMs ?? Number.parseInt(process.env.EVENT_LOOP_WATCHDOG_INTERVAL_MS || "5000", 10);
  const thresholdMs = options.thresholdMs ?? Number.parseInt(process.env.EVENT_LOOP_WATCHDOG_THRESHOLD_MS || "30000", 10);
  const exitCode = options.exitCode ?? 1;
  const now = options.now ?? Date.now;

  let lastTickAt = now();
  const timer = setInterval(() => {
    const currentTickAt = now();
    const lagMs = calculateEventLoopLagMs(lastTickAt, currentTickAt, intervalMs);
    lastTickAt = currentTickAt;

    if (lagMs <= thresholdMs) return;

    const onStall =
      options.onStall ||
      ((lag: number) => {
        console.error(
          `[watchdog] Event loop stalled for ${Math.round(lag)}ms; exiting for supervisor restart.`,
        );
        process.exit(exitCode);
      });
    onStall(lagMs);
  }, intervalMs);

  timer.unref();
  return timer;
}
