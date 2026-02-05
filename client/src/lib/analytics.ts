const SESSION_KEY = "cropto_session_id";

function getSessionId() {
  if (typeof window === "undefined") return undefined;
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export async function trackAnalyticsEvent(
  eventName: string,
  payload?: Record<string, unknown>
) {
  try {
    await fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName,
        sessionId: getSessionId(),
        payload: payload || {},
      }),
    });
  } catch {
    // best-effort only
  }
}
