import {
  sanitizePdpUsageLogEvent,
  type PdpUsageLogError,
  type PdpUsageLogEvent,
  type PdpUsageLogLevel,
  type PdpUsageLogSource
} from "../../lib/shared/pdp-usage-log";

type PdpUsageLogInput = {
  event: string;
  source?: PdpUsageLogSource;
  level?: PdpUsageLogLevel;
  state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  error?: PdpUsageLogError | Error | string;
};

const SESSION_STORAGE_KEY = "hanirum-pdp-maker-usage-session";
const RECENT_LOG_STORAGE_KEY = "hanirum-pdp-maker-recent-usage-log";
const LOG_ENDPOINT = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api"}/pdp/usage-log`;
const MAX_BUFFER_SIZE = 80;
const MAX_RECENT_LOGS = 120;

let sessionId = "";
let sequence = 0;
let pendingEvents: PdpUsageLogEvent[] = [];
let flushTimer: number | null = null;
let isFlushing = false;
let handlersInstalled = false;

export function logPdpUsage(input: PdpUsageLogInput) {
  if (typeof window === "undefined") {
    return;
  }

  const rawEvent = {
    id: createEventId(),
    sessionId: getUsageSessionId(),
    sequence: nextSequence(),
    timestamp: new Date().toISOString(),
    event: input.event,
    level: input.level ?? "info",
    source: input.source ?? "setup",
    route: window.location.pathname,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    },
    state: input.state,
    metadata: input.metadata,
    error: normalizeLogError(input.error)
  };

  const event = sanitizePdpUsageLogEvent(rawEvent);
  if (!event) {
    return;
  }

  pendingEvents.push(event);
  if (pendingEvents.length > MAX_BUFFER_SIZE) {
    pendingEvents = pendingEvents.slice(-MAX_BUFFER_SIZE);
  }

  rememberRecentLog(event);
  scheduleFlush(event.level === "error" ? 80 : 1000);
}

export async function flushPdpUsageLogs(options?: { preferBeacon?: boolean }) {
  if (typeof window === "undefined" || isFlushing || !pendingEvents.length) {
    return;
  }

  const batch = pendingEvents.splice(0, 20);
  const body = JSON.stringify({ events: batch });

  if (options?.preferBeacon && "sendBeacon" in navigator) {
    const didQueue = navigator.sendBeacon(LOG_ENDPOINT, new Blob([body], { type: "application/json" }));
    if (!didQueue) {
      pendingEvents = [...batch, ...pendingEvents].slice(-MAX_BUFFER_SIZE);
    }
    return;
  }

  isFlushing = true;
  try {
    const response = await fetch(LOG_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body,
      keepalive: true
    });

    if (!response.ok) {
      pendingEvents = [...batch, ...pendingEvents].slice(-MAX_BUFFER_SIZE);
    }
  } catch {
    pendingEvents = [...batch, ...pendingEvents].slice(-MAX_BUFFER_SIZE);
  } finally {
    isFlushing = false;
    if (pendingEvents.length) {
      scheduleFlush(1200);
    }
  }
}

export function getPdpUsageSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  return getUsageSessionId();
}

export function getRecentPdpUsageLogs(limit = 12) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const saved = window.localStorage.getItem(RECENT_LOG_STORAGE_KEY);
    const parsed = saved ? (JSON.parse(saved) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((event) => sanitizePdpUsageLogEvent(event))
      .filter((event): event is PdpUsageLogEvent => event !== null)
      .slice(-Math.max(0, Math.min(limit, 20)));
  } catch {
    return [];
  }
}

export function installPdpUsageLogFlushHandlers() {
  if (typeof window === "undefined" || handlersInstalled) {
    return () => undefined;
  }

  handlersInstalled = true;

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      void flushPdpUsageLogs({ preferBeacon: true });
    }
  };

  const handlePageHide = () => {
    logPdpUsage({
      event: "client.page_hide",
      source: "client"
    });
    void flushPdpUsageLogs({ preferBeacon: true });
  };

  const handleWindowError = (event: ErrorEvent) => {
    logPdpUsage({
      event: "client.window_error",
      source: "client",
      level: "error",
      metadata: {
        file: event.filename,
        line: event.lineno,
        column: event.colno
      },
      error: event.error instanceof Error ? event.error : event.message
    });
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    logPdpUsage({
      event: "client.unhandled_rejection",
      source: "client",
      level: "error",
      error: event.reason instanceof Error ? event.reason : String(event.reason)
    });
  };

  window.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    window.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    handlersInstalled = false;
  };
}

function getUsageSessionId() {
  if (sessionId) {
    return sessionId;
  }

  try {
    const savedSessionId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (savedSessionId) {
      sessionId = savedSessionId;
      return sessionId;
    }

    sessionId = createEventId("session");
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    return sessionId;
  } catch {
    sessionId = createEventId("session");
    return sessionId;
  }
}

function nextSequence() {
  sequence += 1;
  return sequence;
}

function scheduleFlush(delayMs: number) {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
  }

  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushPdpUsageLogs();
  }, delayMs);
}

function rememberRecentLog(event: PdpUsageLogEvent) {
  try {
    const saved = window.localStorage.getItem(RECENT_LOG_STORAGE_KEY);
    const current = saved ? (JSON.parse(saved) as unknown) : [];
    const currentLogs = Array.isArray(current) ? current : [];
    const nextLogs = [...currentLogs, event].slice(-MAX_RECENT_LOGS);
    window.localStorage.setItem(RECENT_LOG_STORAGE_KEY, JSON.stringify(nextLogs));
  } catch {
    // Local mirror is best-effort only. The server JSONL log is the durable diagnostic surface.
  }
}

function normalizeLogError(error: PdpUsageLogInput["error"]) {
  if (!error) {
    return undefined;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  if (typeof error === "string") {
    return {
      message: error
    };
  }

  return error;
}

function createEventId(prefix = "evt") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
