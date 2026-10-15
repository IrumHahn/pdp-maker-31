export type PdpUsageLogLevel = "info" | "warn" | "error";
export type PdpUsageLogSource = "setup" | "editor" | "client" | "server";

export interface PdpUsageLogError {
  name?: string;
  message: string;
  detail?: string;
  stack?: string;
  code?: string;
}

export interface PdpUsageLogViewport {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface PdpUsageLogEvent {
  id: string;
  sessionId: string;
  sequence: number;
  timestamp: string;
  event: string;
  level: PdpUsageLogLevel;
  source: PdpUsageLogSource;
  route?: string;
  viewport?: PdpUsageLogViewport;
  state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  error?: PdpUsageLogError;
}

const MAX_STRING_LENGTH = 700;
const MAX_ERROR_STRING_LENGTH = 1800;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 60;
const MAX_DEPTH = 4;
const SENSITIVE_KEY_PATTERN =
  /(api[-_ ]?key|apikey|authorization|bearer|token|secret|password|base64|dataurl|data-url|previewurl|preview-url|originalimage|generatedimage|imagebase64|generationimagebase64|modelimagebase64|knowledgeText)/i;

export function sanitizePdpUsageLogEvent(raw: unknown): PdpUsageLogEvent | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const event = normalizeEventName(toStringValue(record.event));
  const sessionId = toStringValue(record.sessionId);
  if (!event || !sessionId) {
    return null;
  }

  const source = normalizeSource(record.source);
  const level = normalizeLevel(record.level);
  const metadata = toSanitizedRecord(record.metadata);
  const state = toSanitizedRecord(record.state);
  const error = sanitizeError(record.error);
  const viewport = sanitizeViewport(record.viewport);

  return {
    id: toStringValue(record.id) || createFallbackId(),
    sessionId,
    sequence: toFiniteNumber(record.sequence) ?? 0,
    timestamp: toIsoTimestamp(record.timestamp) ?? new Date().toISOString(),
    event,
    level,
    source,
    route: sanitizeRoute(record.route),
    viewport,
    state,
    metadata,
    error
  };
}

export function sanitizePdpUsageValue(value: unknown) {
  return sanitizeValue(value, 0, "");
}

function sanitizeError(value: unknown): PdpUsageLogError | undefined {
  if (typeof value === "string") {
    return { message: truncateString(value, MAX_ERROR_STRING_LENGTH) };
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const message = toStringValue(record.message) || "Unknown error";
  return {
    name: truncateOptionalString(record.name, 180),
    message: truncateString(message, MAX_ERROR_STRING_LENGTH),
    detail: truncateOptionalString(record.detail, MAX_ERROR_STRING_LENGTH),
    stack: truncateOptionalString(record.stack, MAX_ERROR_STRING_LENGTH),
    code: truncateOptionalString(record.code, 180)
  };
}

function sanitizeViewport(value: unknown): PdpUsageLogViewport | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const width = toFiniteNumber(record.width);
  const height = toFiniteNumber(record.height);
  const devicePixelRatio = toFiniteNumber(record.devicePixelRatio);
  if (!width || !height || !devicePixelRatio) {
    return undefined;
  }

  return {
    width,
    height,
    devicePixelRatio
  };
}

function toSanitizedRecord(value: unknown): Record<string, unknown> | undefined {
  const sanitized = sanitizeValue(value, 0, "");
  return asRecord(sanitized) ?? undefined;
}

function sanitizeValue(value: unknown, depth: number, key: string): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[redacted]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (looksLikeLargeEncodedPayload(value)) {
      return `[redacted ${value.length} chars]`;
    }

    return truncateString(value, MAX_STRING_LENGTH);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return Number.isFinite(value as number) || typeof value === "boolean" ? value : null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) {
      return `[array ${value.length}]`;
    }

    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, depth + 1, key));
  }

  const record = asRecord(value);
  if (!record) {
    return String(value);
  }

  if (depth >= MAX_DEPTH) {
    return "[object]";
  }

  const next: Record<string, unknown> = {};
  Object.entries(record)
    .slice(0, MAX_OBJECT_KEYS)
    .forEach(([entryKey, entryValue]) => {
      next[entryKey] = sanitizeValue(entryValue, depth + 1, entryKey);
    });

  return next;
}

function normalizeEventName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 120);
}

function normalizeLevel(value: unknown): PdpUsageLogLevel {
  return value === "warn" || value === "error" ? value : "info";
}

function normalizeSource(value: unknown): PdpUsageLogSource {
  return value === "editor" || value === "client" || value === "server" ? value : "setup";
}

function sanitizeRoute(value: unknown) {
  const route = toStringValue(value);
  if (!route) {
    return undefined;
  }

  return truncateString(route.replace(/[?#].*$/, ""), 220);
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function truncateOptionalString(value: unknown, maxLength: number) {
  const stringValue = toStringValue(value);
  return stringValue ? truncateString(stringValue, maxLength) : undefined;
}

function truncateString(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]` : value;
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toIsoTimestamp(value: unknown) {
  const timestamp = toStringValue(value);
  if (!timestamp) {
    return undefined;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function looksLikeLargeEncodedPayload(value: string) {
  if (value.startsWith("data:image/") || value.startsWith("data:application/")) {
    return true;
  }

  return value.length > 1200 && /^[A-Za-z0-9+/=\s]+$/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function createFallbackId() {
  return `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
