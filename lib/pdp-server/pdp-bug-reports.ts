import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { appendFile, mkdir, readFile, readdir } from "fs/promises";
import path from "path";
import {
  normalizePdpBugReportInput,
  type PdpBugReportAdminEvent,
  type PdpBugReportNotificationStatus,
  type PdpBugReportRecord,
  type PdpBugReportStatus
} from "../shared/pdp-bug-report";

const BUG_REPORT_DIR = path.join(process.cwd(), "output", "bug-reports");
const ADMIN_EVENTS_FILE = "_admin-events.jsonl";
const MAX_REPORTS_TO_READ = 200;
const MAX_ADMIN_EVENTS_TO_READ = 1000;
const MAX_ADMIN_MEMO_LENGTH = 1200;
const STATUS_ORDER: PdpBugReportStatus[] = ["new", "reviewing", "resolved", "archived"];
const STATUS_LABELS: Record<PdpBugReportStatus, string> = {
  new: "접수",
  reviewing: "확인중",
  resolved: "해결",
  archived: "보관"
};
const NOTIFICATION_TIMEOUT_MS = 3500;
const ADMIN_SESSION_MESSAGE = "hanirum-pdp-maker-bug-report-admin";

export const PDP_BUG_REPORT_ADMIN_COOKIE = "pdp_bug_report_admin";

export async function createPdpBugReport(raw: unknown, request?: Request) {
  const normalized = normalizePdpBugReportInput(raw);
  if (!normalized.ok) {
    return normalized;
  }

  const createdAt = new Date().toISOString();
  const fileName = `${createdAt.slice(0, 10)}.jsonl`;
  const storagePath = `output/bug-reports/${fileName}`;
  const record: PdpBugReportRecord = {
    ...normalized.value,
    id: createReportId(createdAt),
    status: "new",
    source: "pdp-maker-widget",
    createdAt,
    updatedAt: createdAt,
    request: {
      userAgent: cleanLine(request?.headers.get("user-agent"), 320) || undefined
    },
    storagePath
  };

  record.notifications = await sendPdpBugReportNotifications(record);

  await mkdir(BUG_REPORT_DIR, { recursive: true });
  await appendFile(path.join(BUG_REPORT_DIR, fileName), `${JSON.stringify(record)}\n`, "utf8");

  return {
    ok: true as const,
    value: record
  };
}

export async function listPdpBugReports(options?: { status?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(options?.limit ?? MAX_REPORTS_TO_READ, MAX_REPORTS_TO_READ));
  const status = normalizeStatusFilter(options?.status);

  let fileNames: string[];
  try {
    fileNames = await readdir(BUG_REPORT_DIR);
  } catch {
    return [];
  }

  const reports: PdpBugReportRecord[] = [];
  const jsonlFiles = fileNames
    .filter((fileName) => fileName.endsWith(".jsonl") && fileName !== ADMIN_EVENTS_FILE)
    .sort((left, right) => right.localeCompare(left));

  for (const fileName of jsonlFiles) {
    const text = await readFile(path.join(BUG_REPORT_DIR, fileName), "utf8").catch(() => "");
    const lines = text.split("\n").filter(Boolean).reverse();

    for (const line of lines) {
      const report = parseReport(line, `output/bug-reports/${fileName}`);
      if (!report) {
        continue;
      }
      reports.push(report);
      if (reports.length >= MAX_REPORTS_TO_READ) {
        break;
      }
    }

    if (reports.length >= MAX_REPORTS_TO_READ) {
      break;
    }
  }

  const adminEvents = await readAdminEvents();
  const mergedReports = applyAdminEvents(reports, adminEvents).sort(sortReports);
  const filteredReports = status ? mergedReports.filter((report) => report.status === status) : mergedReports;

  return filteredReports.slice(0, limit);
}

export async function getPdpBugReportCounts() {
  const reports = await listPdpBugReports({ limit: MAX_REPORTS_TO_READ });
  const counts: Record<PdpBugReportStatus | "total", number> = {
    total: reports.length,
    new: 0,
    reviewing: 0,
    resolved: 0,
    archived: 0
  };

  reports.forEach((report) => {
    counts[report.status] += 1;
  });

  return counts;
}

export async function updatePdpBugReportStatus(
  reportId: string,
  nextStatus: PdpBugReportStatus,
  options?: {
    memo?: string;
    notifyCustomer?: boolean;
  }
) {
  const normalizedStatus = normalizeStatusFilter(nextStatus);
  if (!normalizedStatus) {
    return { ok: false as const, message: "상태 값을 확인하지 못했습니다." };
  }

  const report = await getPdpBugReportById(reportId);
  if (!report) {
    return { ok: false as const, message: "신고를 찾지 못했습니다." };
  }

  const memo = cleanText(options?.memo, MAX_ADMIN_MEMO_LENGTH);
  if (report.status === normalizedStatus && !memo) {
    return { ok: false as const, message: "이미 같은 상태입니다." };
  }

  const createdAt = new Date().toISOString();
  const event: PdpBugReportAdminEvent = {
    id: createAdminEventId(createdAt),
    reportId: report.id,
    type: "status",
    actor: "admin",
    previousStatus: report.status,
    status: normalizedStatus,
    memo: memo || undefined,
    createdAt
  };

  if (options?.notifyCustomer !== false) {
    event.notifications = [
      await notifyCustomerStatusChange(
        {
          ...report,
          status: normalizedStatus,
          updatedAt: createdAt
        },
        event
      )
    ];
  }

  await appendAdminEvent(event);

  return {
    ok: true as const,
    value: event
  };
}

export async function addPdpBugReportMemo(reportId: string, rawMemo: unknown) {
  const report = await getPdpBugReportById(reportId);
  if (!report) {
    return { ok: false as const, message: "신고를 찾지 못했습니다." };
  }

  const memo = cleanText(rawMemo, MAX_ADMIN_MEMO_LENGTH);
  if (memo.length < 2) {
    return { ok: false as const, message: "메모 내용을 조금 더 적어주세요." };
  }

  const createdAt = new Date().toISOString();
  const event: PdpBugReportAdminEvent = {
    id: createAdminEventId(createdAt),
    reportId: report.id,
    type: "memo",
    actor: "admin",
    memo,
    createdAt
  };

  await appendAdminEvent(event);

  return {
    ok: true as const,
    value: event
  };
}

export function isPdpBugReportAdminAuthorized(request: Request) {
  const configuredToken = getConfiguredAdminToken();
  if (!configuredToken) {
    return process.env.NODE_ENV !== "production";
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerToken = request.headers.get("x-pdp-admin-token");
  const cookieSession = readCookie(request.headers.get("cookie"), PDP_BUG_REPORT_ADMIN_COOKIE);

  return (
    [bearer, headerToken].some((token) => token === configuredToken) ||
    isPdpBugReportAdminSessionAuthorized(cookieSession)
  );
}

export function isPdpBugReportAdminPageAuthorized(token?: string | string[]) {
  const configuredToken = getConfiguredAdminToken();
  if (!configuredToken) {
    return process.env.NODE_ENV !== "production";
  }

  const candidate = Array.isArray(token) ? token[0] : token;
  return candidate === configuredToken;
}

export function isPdpBugReportAdminTokenConfigured() {
  return Boolean(getConfiguredAdminToken());
}

export function createPdpBugReportAdminSessionValue() {
  const configuredToken = getConfiguredAdminToken();
  if (!configuredToken) {
    return "";
  }

  return `v1.${createHmac("sha256", configuredToken).update(ADMIN_SESSION_MESSAGE).digest("hex")}`;
}

export function isPdpBugReportAdminSessionAuthorized(sessionValue?: string | null) {
  const configuredToken = getConfiguredAdminToken();
  if (!configuredToken) {
    return process.env.NODE_ENV !== "production";
  }

  const expected = createPdpBugReportAdminSessionValue();
  const candidate = String(sessionValue ?? "");
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  if (!candidate || candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

function getConfiguredAdminToken() {
  return process.env.PDP_BUG_REPORT_ADMIN_TOKEN || process.env.PDP_ADMIN_TOKEN || "";
}

async function getPdpBugReportById(reportId: string) {
  const reports = await listPdpBugReports({ limit: MAX_REPORTS_TO_READ });
  return reports.find((report) => report.id === reportId) ?? null;
}

async function appendAdminEvent(event: PdpBugReportAdminEvent) {
  await mkdir(BUG_REPORT_DIR, { recursive: true });
  await appendFile(path.join(BUG_REPORT_DIR, ADMIN_EVENTS_FILE), `${JSON.stringify(event)}\n`, "utf8");
}

async function readAdminEvents() {
  const text = await readFile(path.join(BUG_REPORT_DIR, ADMIN_EVENTS_FILE), "utf8").catch(() => "");
  const events = text
    .split("\n")
    .filter(Boolean)
    .map(parseAdminEvent)
    .filter((event): event is PdpBugReportAdminEvent => Boolean(event))
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));

  return events.slice(-MAX_ADMIN_EVENTS_TO_READ);
}

function applyAdminEvents(reports: PdpBugReportRecord[], events: PdpBugReportAdminEvent[]) {
  const reportMap = new Map<string, PdpBugReportRecord>();
  reports.forEach((report) => {
    reportMap.set(report.id, {
      ...report,
      adminEvents: []
    });
  });

  events.forEach((event) => {
    const report = reportMap.get(event.reportId);
    if (!report) {
      return;
    }

    report.adminEvents = [...(report.adminEvents ?? []), event];
    report.updatedAt = event.createdAt;
    if (event.type === "status" && event.status) {
      report.status = event.status;
    }
  });

  return Array.from(reportMap.values());
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return "";
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? "";
}

async function sendPdpBugReportNotifications(report: PdpBugReportRecord): Promise<PdpBugReportNotificationStatus[]> {
  const results = await Promise.all([
    notifyDiscord(report),
    notifyEmail(report)
  ]);

  return results;
}

async function notifyDiscord(report: PdpBugReportRecord): Promise<PdpBugReportNotificationStatus> {
  const webhookUrl = process.env.PDP_BUG_REPORT_DISCORD_WEBHOOK_URL || process.env.DISCORD_TRIAGE_WEBHOOK_URL || "";
  if (!webhookUrl) {
    return notificationStatus("discord", false, "PDP_BUG_REPORT_DISCORD_WEBHOOK_URL is not configured.", true);
  }

  const adminUrl = buildAdminReportUrl(report);
  const payload = {
    content: `새 PDP Maker 버그신고가 접수되었습니다: ${report.title}`,
    embeds: [
      {
        title: `PDP 버그신고 · ${report.title}`,
        description: report.description.slice(0, 1500),
        color: 0x171a1f,
        fields: [
          { name: "접수번호", value: report.id, inline: true },
          { name: "유형", value: report.category, inline: true },
          { name: "답변 이메일", value: report.reporterEmail, inline: true },
          { name: "화면", value: String(report.context.surface || report.context.route || "unknown").slice(0, 220), inline: true },
          { name: "어드민", value: adminUrl || "로컬 어드민에서 확인", inline: false }
        ],
        timestamp: report.createdAt
      }
    ]
  };

  try {
    const response = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return notificationStatus("discord", false, `Discord webhook failed with ${response.status}.`);
    }

    return notificationStatus("discord", true, "Discord triage webhook sent.");
  } catch (error) {
    return notificationStatus("discord", false, error instanceof Error ? error.message : String(error));
  }
}

async function notifyEmail(report: PdpBugReportRecord): Promise<PdpBugReportNotificationStatus> {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.PDP_BUG_REPORT_EMAIL_FROM || "";
  const to = process.env.PDP_BUG_REPORT_NOTIFY_EMAIL_TO || process.env.PDP_BUG_REPORT_EMAIL_TO || "";

  if (!apiKey || !from || !to) {
    return notificationStatus(
      "email",
      false,
      "RESEND_API_KEY, PDP_BUG_REPORT_EMAIL_FROM, and PDP_BUG_REPORT_NOTIFY_EMAIL_TO are required.",
      true
    );
  }

  const subject = `[PDP Maker 버그신고] ${report.title}`;
  const text = buildBugReportEmailText(report);
  const html = buildBugReportEmailHtml(report);

  try {
    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: splitEmailList(to),
        subject,
        text,
        html,
        reply_to: report.reporterEmail
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return notificationStatus("email", false, `Resend failed with ${response.status}${detail ? `: ${detail.slice(0, 220)}` : ""}`);
    }

    return notificationStatus("email", true, "Email notification sent.");
  } catch (error) {
    return notificationStatus("email", false, error instanceof Error ? error.message : String(error));
  }
}

async function notifyCustomerStatusChange(
  report: PdpBugReportRecord,
  event: PdpBugReportAdminEvent
): Promise<PdpBugReportNotificationStatus> {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.PDP_BUG_REPORT_EMAIL_FROM || "";
  const replyTo = process.env.PDP_BUG_REPORT_REPLY_TO || process.env.PDP_BUG_REPORT_NOTIFY_EMAIL_TO || from;

  if (!apiKey || !from || !report.reporterEmail) {
    return notificationStatus(
      "customer-email",
      false,
      "RESEND_API_KEY, PDP_BUG_REPORT_EMAIL_FROM, and reporterEmail are required.",
      true
    );
  }

  const subject = `[상세페이지 마법사 문의] ${STATUS_LABELS[report.status]} · ${report.title}`;
  const text = buildCustomerStatusEmailText(report, event);
  const html = buildCustomerStatusEmailHtml(report, event);

  try {
    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [report.reporterEmail],
        subject,
        text,
        html,
        reply_to: replyTo
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return notificationStatus("customer-email", false, `Resend failed with ${response.status}${detail ? `: ${detail.slice(0, 220)}` : ""}`);
    }

    return notificationStatus("customer-email", true, "Customer status email sent.");
  } catch (error) {
    return notificationStatus("customer-email", false, error instanceof Error ? error.message : String(error));
  }
}

function notificationStatus(
  channel: PdpBugReportNotificationStatus["channel"],
  ok: boolean,
  message: string,
  skipped = false
): PdpBugReportNotificationStatus {
  return {
    channel,
    ok,
    skipped,
    message,
    timestamp: new Date().toISOString()
  };
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildBugReportEmailText(report: PdpBugReportRecord) {
  return [
    "새 PDP Maker 3.0 버그신고가 접수되었습니다.",
    "",
    `접수번호: ${report.id}`,
    `유형: ${report.category}`,
    `답변 이메일: ${report.reporterEmail}`,
    `접수시각: ${report.createdAt}`,
    `어드민: ${buildAdminReportUrl(report) || "로컬 어드민에서 확인"}`,
    "",
    "제목:",
    report.title,
    "",
    "내용:",
    report.description,
    "",
    "화면 맥락:",
    JSON.stringify(report.context, null, 2)
  ].join("\n");
}

function buildBugReportEmailHtml(report: PdpBugReportRecord) {
  const adminUrl = buildAdminReportUrl(report);
  return [
    "<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#171a1f\">",
    "<h2>새 PDP Maker 3.0 버그신고</h2>",
    `<p><strong>접수번호:</strong> ${escapeHtml(report.id)}</p>`,
    `<p><strong>유형:</strong> ${escapeHtml(report.category)}</p>`,
    `<p><strong>답변 이메일:</strong> ${escapeHtml(report.reporterEmail)}</p>`,
    `<p><strong>접수시각:</strong> ${escapeHtml(report.createdAt)}</p>`,
    adminUrl ? `<p><a href="${escapeHtml(adminUrl)}">어드민에서 보기</a></p>` : "",
    `<h3>${escapeHtml(report.title)}</h3>`,
    `<pre style="white-space:pre-wrap;background:#f7f8f5;border-radius:8px;padding:12px">${escapeHtml(report.description)}</pre>`,
    "<h3>화면 맥락</h3>",
    `<pre style="white-space:pre-wrap;background:#f7f8f5;border-radius:8px;padding:12px">${escapeHtml(JSON.stringify(report.context, null, 2))}</pre>`,
    "</div>"
  ].join("");
}

function buildCustomerStatusEmailText(report: PdpBugReportRecord, event: PdpBugReportAdminEvent) {
  return [
    "안녕하세요. 한이룸의 상세페이지 마법사 3.0 문의 처리 상태가 업데이트되었습니다.",
    "",
    `접수번호: ${report.id}`,
    `현재 상태: ${STATUS_LABELS[report.status]}`,
    `문의 제목: ${report.title}`,
    "",
    buildCustomerStatusMessage(report.status),
    event.memo ? ["", "운영 메모:", event.memo].join("\n") : "",
    "",
    "문의 내용:",
    report.description,
    "",
    "이 메일에 답장하시면 운영자에게 전달됩니다."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCustomerStatusEmailHtml(report: PdpBugReportRecord, event: PdpBugReportAdminEvent) {
  return [
    "<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#171a1f\">",
    "<h2>상세페이지 마법사 문의 처리 상태</h2>",
    `<p><strong>접수번호:</strong> ${escapeHtml(report.id)}</p>`,
    `<p><strong>현재 상태:</strong> ${escapeHtml(STATUS_LABELS[report.status])}</p>`,
    `<p><strong>문의 제목:</strong> ${escapeHtml(report.title)}</p>`,
    `<p>${escapeHtml(buildCustomerStatusMessage(report.status))}</p>`,
    event.memo ? `<h3>운영 메모</h3><pre style="white-space:pre-wrap;background:#f7f8f5;border-radius:8px;padding:12px">${escapeHtml(event.memo)}</pre>` : "",
    "<h3>문의 내용</h3>",
    `<pre style="white-space:pre-wrap;background:#f7f8f5;border-radius:8px;padding:12px">${escapeHtml(report.description)}</pre>`,
    "<p>이 메일에 답장하시면 운영자에게 전달됩니다.</p>",
    "</div>"
  ].join("");
}

function buildCustomerStatusMessage(status: PdpBugReportStatus) {
  if (status === "new") {
    return "문의가 접수 상태로 변경되었습니다. 내용을 확인할 준비가 되었습니다.";
  }
  if (status === "reviewing") {
    return "문의 내용을 확인 중입니다. 원인을 살피고 필요한 조치를 검토하겠습니다.";
  }
  if (status === "resolved") {
    return "문의가 해결 상태로 변경되었습니다. 처리 결과를 확인해 주세요.";
  }

  return "문의 처리를 마무리하고 보관 상태로 변경했습니다.";
}

function buildAdminReportUrl(report: PdpBugReportRecord) {
  const baseUrl = process.env.PDP_MAKER_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  if (!baseUrl) {
    return "";
  }

  try {
    const url = new URL("/pdp-maker/admin/bug-reports", baseUrl);
    url.searchParams.set("highlight", report.id);
    return url.toString();
  } catch {
    return "";
  }
}

function splitEmailList(value: string) {
  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeStatusFilter(status?: string): PdpBugReportStatus | "" {
  return STATUS_ORDER.includes(status as PdpBugReportStatus) ? (status as PdpBugReportStatus) : "";
}

function parseReport(line: string, storagePath: string): PdpBugReportRecord | null {
  try {
    const parsed = JSON.parse(line) as PdpBugReportRecord;
    if (!parsed?.id || !parsed.description || !parsed.createdAt) {
      return null;
    }

    return {
      ...parsed,
      status: normalizeStatusFilter(parsed.status) || "new",
      storagePath: parsed.storagePath || storagePath
    };
  } catch {
    return null;
  }
}

function parseAdminEvent(line: string): PdpBugReportAdminEvent | null {
  try {
    const parsed = JSON.parse(line) as PdpBugReportAdminEvent;
    if (!parsed?.id || !parsed.reportId || !parsed.createdAt) {
      return null;
    }
    if (parsed.type !== "status" && parsed.type !== "memo") {
      return null;
    }

    const status = normalizeStatusFilter(parsed.status);
    const previousStatus = normalizeStatusFilter(parsed.previousStatus);
    if (parsed.type === "status" && !status) {
      return null;
    }

    return {
      id: cleanLine(parsed.id, 120),
      reportId: cleanLine(parsed.reportId, 120),
      type: parsed.type,
      actor: "admin",
      createdAt: parsed.createdAt,
      status: status || undefined,
      previousStatus: previousStatus || undefined,
      memo: cleanText(parsed.memo, MAX_ADMIN_MEMO_LENGTH) || undefined,
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications.slice(0, 6) : undefined
    };
  } catch {
    return null;
  }
}

function sortReports(left: PdpBugReportRecord, right: PdpBugReportRecord) {
  return String(right.createdAt).localeCompare(String(left.createdAt));
}

function createReportId(createdAt: string) {
  return `pdp-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
}

function createAdminEventId(createdAt: string) {
  return `pdp-admin-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
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
