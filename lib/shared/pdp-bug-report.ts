import {
  sanitizePdpUsageLogEvent,
  sanitizePdpUsageValue,
  type PdpUsageLogEvent
} from "./pdp-usage-log";

export type PdpBugReportCategory = "bug" | "generation" | "editor" | "account" | "other";
export type PdpBugReportStatus = "new" | "reviewing" | "resolved" | "archived";

export interface PdpBugReportContext {
  surface?: string;
  route?: string;
  pageTitle?: string;
  appState?: string;
  setupStep?: string;
  outputMode?: string;
  aiProvider?: string;
  sectionName?: string;
  sectionIndex?: number;
  sectionCount?: number;
  errorMessage?: string;
  [key: string]: unknown;
}

export interface PdpBugReportInput {
  category: PdpBugReportCategory;
  title: string;
  description: string;
  contact?: string;
  reporterEmail: string;
  sessionId?: string;
  context: PdpBugReportContext;
  recentEvents: PdpUsageLogEvent[];
}

export interface PdpBugReportNotificationStatus {
  channel: "discord" | "email" | "customer-email";
  ok: boolean;
  skipped?: boolean;
  message: string;
  timestamp: string;
}

export type PdpBugReportAdminEventType = "status" | "memo";

export interface PdpBugReportAdminEvent {
  id: string;
  reportId: string;
  type: PdpBugReportAdminEventType;
  createdAt: string;
  actor: "admin";
  status?: PdpBugReportStatus;
  previousStatus?: PdpBugReportStatus;
  memo?: string;
  notifications?: PdpBugReportNotificationStatus[];
}

export interface PdpBugReportRecord extends PdpBugReportInput {
  id: string;
  status: PdpBugReportStatus;
  source: "pdp-maker-widget";
  createdAt: string;
  updatedAt: string;
  notifications?: PdpBugReportNotificationStatus[];
  adminEvents?: PdpBugReportAdminEvent[];
  request?: {
    userAgent?: string;
  };
  storagePath?: string;
}

export const PDP_BUG_REPORT_CATEGORIES: Array<{
  value: PdpBugReportCategory;
  label: string;
  description: string;
}> = [
  { value: "bug", label: "오류", description: "화면, 버튼, 저장 문제" },
  { value: "generation", label: "생성", description: "AI 생성 실패나 결과 문제" },
  { value: "editor", label: "편집", description: "캔버스, 텍스트, 다운로드 문제" },
  { value: "account", label: "키/비용", description: "API 키나 과금 관련 문제" },
  { value: "other", label: "기타", description: "분류하기 어려운 문제" }
];

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2400;
const MAX_CONTACT_LENGTH = 140;
const MAX_EMAIL_LENGTH = 180;
const MAX_CONTEXT_KEYS = 36;
const MAX_RECENT_EVENTS = 16;
const SENSITIVE_CONTEXT_KEY_PATTERN =
  /(api[-_ ]?key|apikey|authorization|bearer|token|secret|password|base64|dataurl|data-url|previewurl|preview-url|originalimage|generatedimage|imagebase64|generationimagebase64|modelimagebase64|knowledgeText)/i;

export function normalizePdpBugReportInput(raw: unknown):
  | { ok: true; value: PdpBugReportInput }
  | { ok: false; message: string } {
  const record = asRecord(raw);
  if (!record) {
    return { ok: false, message: "신고 내용을 읽지 못했습니다." };
  }

  const description = cleanText(record.description ?? record.message, MAX_DESCRIPTION_LENGTH);
  if (description.length < 5) {
    return { ok: false, message: "어떤 문제가 있었는지 조금 더 적어주세요." };
  }

  const title = cleanLine(record.title, MAX_TITLE_LENGTH) || firstLine(description, MAX_TITLE_LENGTH);
  const category = normalizeBugCategory(record.category);
  const contact = cleanLine(record.contact ?? record.name, MAX_CONTACT_LENGTH);
  const reporterEmail = normalizeEmail(record.reporterEmail ?? record.email ?? record.contact);
  if (!reporterEmail) {
    return { ok: false, message: "처리 결과를 받을 이메일을 입력해 주세요." };
  }

  const sessionId = cleanLine(record.sessionId, 140);
  const context = normalizeBugContext(record.context);
  const recentEvents = normalizeRecentEvents(record.recentEvents ?? record.events);

  return {
    ok: true,
    value: {
      category,
      title,
      description,
      contact: contact || undefined,
      reporterEmail,
      sessionId: sessionId || undefined,
      context,
      recentEvents
    }
  };
}

export function getPdpBugReportCategoryLabel(category: PdpBugReportCategory) {
  return PDP_BUG_REPORT_CATEGORIES.find((item) => item.value === category)?.label ?? "기타";
}

function normalizeBugCategory(value: unknown): PdpBugReportCategory {
  const normalized = cleanLine(value, 40);
  return PDP_BUG_REPORT_CATEGORIES.some((item) => item.value === normalized)
    ? (normalized as PdpBugReportCategory)
    : "bug";
}

function normalizeBugContext(value: unknown): PdpBugReportContext {
  const sanitized = sanitizePdpUsageValue(value);
  const record = asRecord(sanitized);
  if (!record) {
    return {};
  }

  const next: PdpBugReportContext = {};
  Object.entries(record).slice(0, MAX_CONTEXT_KEYS).forEach(([key, entryValue]) => {
    if (SENSITIVE_CONTEXT_KEY_PATTERN.test(key)) {
      next[key] = "[redacted]";
      return;
    }

    next[key] = entryValue;
  });

  return next;
}

function normalizeRecentEvents(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((event) => sanitizePdpUsageLogEvent(event))
    .filter((event): event is PdpUsageLogEvent => event !== null)
    .slice(-MAX_RECENT_EVENTS);
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function cleanLine(value: unknown, maxLength: number) {
  return cleanText(value, maxLength).replace(/\s+/g, " ");
}

function normalizeEmail(value: unknown) {
  const email = cleanLine(value, MAX_EMAIL_LENGTH).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "";
  }

  return email;
}

function firstLine(value: string, maxLength: number) {
  return cleanLine(value.split("\n")[0] ?? value, maxLength);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}
