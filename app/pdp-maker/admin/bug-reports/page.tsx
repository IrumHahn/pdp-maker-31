import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Bug, CheckCircle2, LogOut, Mail, MessageSquareText, RefreshCw } from "lucide-react";
import {
  isPdpBugReportAdminSessionAuthorized,
  isPdpBugReportAdminTokenConfigured,
  listPdpBugReports,
  PDP_BUG_REPORT_ADMIN_COOKIE
} from "../../../../lib/pdp-server/pdp-bug-reports";
import {
  getPdpBugReportCategoryLabel,
  type PdpBugReportAdminEvent,
  type PdpBugReportRecord,
  type PdpBugReportStatus
} from "../../../../lib/shared/pdp-bug-report";
import styles from "../../pdp-maker.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PDP Maker 버그신고 어드민",
  robots: {
    index: false,
    follow: false
  }
};

const STATUS_FILTERS: Array<{ value: "" | PdpBugReportStatus; label: string }> = [
  { value: "", label: "전체" },
  { value: "new", label: "접수" },
  { value: "reviewing", label: "확인" },
  { value: "resolved", label: "해결" },
  { value: "archived", label: "보관" }
];

const STATUS_LABELS: Record<PdpBugReportStatus, string> = {
  new: "접수",
  reviewing: "확인",
  resolved: "해결",
  archived: "보관"
};

interface PdpMakerBugReportsAdminPageProps {
  searchParams?: {
    status?: string;
    login?: string;
    updated?: string;
    memo?: string;
    error?: string;
  };
}

export default async function PdpMakerBugReportsAdminPage({ searchParams }: PdpMakerBugReportsAdminPageProps) {
  const adminSession = cookies().get(PDP_BUG_REPORT_ADMIN_COOKIE)?.value;
  const tokenConfigured = isPdpBugReportAdminTokenConfigured();
  const authorized = isPdpBugReportAdminSessionAuthorized(adminSession);
  const activeStatus = normalizeStatus(searchParams?.status);
  const allReports = authorized ? await listPdpBugReports({ limit: 200 }) : [];
  const reports = activeStatus ? allReports.filter((report) => report.status === activeStatus) : allReports;
  const counts = countReports(allReports);

  return (
    <main className={styles.bugAdminPage}>
      <div className={styles.bugAdminShell}>
        <header className={styles.bugAdminHeader}>
          <div>
            <span className={styles.bugAdminKicker}>PDP Maker 3.0 Admin</span>
            <h1>버그신고 어드민</h1>
            <p>우하단 신고 메뉴로 접수된 내용을 확인합니다. 신고 내용에는 원본 이미지와 API 키가 저장되지 않습니다.</p>
          </div>
          <div className={styles.bugAdminActions}>
            <Link className={styles.secondaryButton} href="/pdp-maker">
              <Bug size={15} />
              작업 화면
            </Link>
            {authorized && tokenConfigured ? (
              <form action="/api/pdp/bug-reports/admin-logout" method="post">
                <button className={styles.secondaryButton} type="submit">
                  <LogOut size={15} />
                  로그아웃
                </button>
              </form>
            ) : null}
            <Link className={styles.primaryButton} href={makeFilterHref(activeStatus)}>
              <RefreshCw size={15} />
              새로고침
            </Link>
          </div>
        </header>

        {!authorized ? (
          <section className={styles.bugAdminAuthBox}>
            <strong>관리자 확인이 필요합니다.</strong>
            <p>
              운영 배포에서는 `PDP_BUG_REPORT_ADMIN_TOKEN` 또는 `PDP_ADMIN_TOKEN` 환경변수로 보호됩니다.
              로컬 개발 환경에서는 토큰 없이 확인할 수 있습니다.
            </p>
            {searchParams?.login === "failed" ? (
              <p className={styles.bugAdminAuthError}>관리 토큰이 맞지 않습니다.</p>
            ) : null}
            <form action="/api/pdp/bug-reports/admin-login" className={styles.bugAdminAuthForm} method="post">
              <input name="token" placeholder="관리 토큰" type="password" />
              <input name="returnTo" type="hidden" value={makeFilterHref(activeStatus)} />
              <button className={styles.primaryButton} type="submit">
                확인
              </button>
            </form>
          </section>
        ) : (
          <>
            <AdminNotice searchParams={searchParams} />
            <nav className={styles.bugAdminSummary} aria-label="버그신고 상태 필터">
              {STATUS_FILTERS.map((item) => (
                <Link
                  className={activeStatus === item.value ? styles.bugAdminFilterActive : styles.bugAdminFilter}
                  href={makeFilterHref(item.value)}
                  key={item.value || "all"}
                >
                  <span>{item.label}</span>
                  <strong>{item.value ? counts[item.value] : counts.total}</strong>
                </Link>
              ))}
            </nav>

            {reports.length ? (
              <section className={styles.bugAdminList}>
                {reports.map((report) => (
                  <BugReportAdminCard activeStatus={activeStatus} key={report.id} report={report} />
                ))}
              </section>
            ) : (
              <section className={styles.bugAdminEmpty}>
                <strong>접수된 신고가 없습니다.</strong>
                <p>사용자가 우하단 신고 메뉴에서 접수하면 이곳에 표시됩니다.</p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function AdminNotice({ searchParams }: { searchParams?: PdpMakerBugReportsAdminPageProps["searchParams"] }) {
  if (searchParams?.updated) {
    return (
      <div className={styles.bugAdminNotice}>
        <CheckCircle2 size={16} />
        상태를 변경했고 고객 이메일 알림 결과를 기록했습니다.
      </div>
    );
  }

  if (searchParams?.memo) {
    return (
      <div className={styles.bugAdminNotice}>
        <MessageSquareText size={16} />
        내부 메모를 저장했습니다.
      </div>
    );
  }

  if (searchParams?.error) {
    return <div className={styles.bugAdminNoticeError}>요청을 처리하지 못했습니다. 새로고침 후 다시 시도해 주세요.</div>;
  }

  return null;
}

function BugReportAdminCard({
  activeStatus,
  report
}: {
  activeStatus: "" | PdpBugReportStatus;
  report: PdpBugReportRecord;
}) {
  const eventCount = report.recentEvents?.length ?? 0;
  const adminEvents = report.adminEvents ?? [];
  const latestCustomerNotification = [...adminEvents]
    .reverse()
    .flatMap((event) => event.notifications ?? [])
    .find((item) => item.channel === "customer-email");

  return (
    <article className={styles.bugAdminCard}>
      <div className={styles.bugAdminCardHeader}>
        <div className={styles.bugAdminCardTitle}>
          <div className={styles.bugAdminBadges}>
            <span className={statusBadgeClass(report.status)}>{STATUS_LABELS[report.status]}</span>
            <span className={styles.bugAdminBadge}>{getPdpBugReportCategoryLabel(report.category)}</span>
            {eventCount ? <span className={styles.bugAdminBadge}>로그 {eventCount}</span> : null}
          </div>
          <h2>{report.title}</h2>
        </div>
        <div className={styles.bugAdminMeta}>
          <strong>{formatKst(report.createdAt)}</strong>
          <span>{report.id}</span>
          <span>{report.reporterEmail || report.contact || "이메일 없음"}</span>
          {latestCustomerNotification ? (
            <span>{latestCustomerNotification.ok ? "고객 메일 발송됨" : "고객 메일 실패"}</span>
          ) : null}
        </div>
      </div>

      <p className={styles.bugAdminDescription}>{report.description}</p>

      <div className={styles.bugAdminDetailGrid}>
        <div className={styles.bugAdminDetailBox}>
          <strong>화면 맥락</strong>
          <pre>{formatJson(report.context)}</pre>
        </div>
        <div className={styles.bugAdminDetailBox}>
          <strong>진단 정보</strong>
          <code>session: {report.sessionId || "없음"}</code>
          <code>path: {report.storagePath || "output/bug-reports"}</code>
          <code>ua: {report.request?.userAgent || "미수집"}</code>
        </div>
      </div>

      <div className={styles.bugAdminDetailBox}>
        <strong>운영 알림</strong>
        {report.notifications?.length ? (
          <pre>{formatNotifications(report)}</pre>
        ) : (
          <code>알림 결과가 기록되지 않았습니다.</code>
        )}
      </div>

      <section className={styles.bugAdminWorkflow}>
        <div className={styles.bugAdminWorkflowHeader}>
          <strong>처리 단계</strong>
          <span>단계를 바꾸면 고객에게 이메일이 발송됩니다.</span>
        </div>
        <form action="/api/pdp/bug-reports/admin-actions" className={styles.bugAdminStatusForm} method="post">
          <input name="action" type="hidden" value="status" />
          <input name="reportId" type="hidden" value={report.id} />
          <input name="returnTo" type="hidden" value={makeFilterHref(activeStatus)} />
          <textarea
            maxLength={1200}
            name="memo"
            placeholder="상태 변경 메모: 고객에게 보낼 안내가 있으면 적어주세요."
            rows={3}
          />
          <div className={styles.bugAdminStatusButtons}>
            {STATUS_FILTERS.filter((item): item is { value: PdpBugReportStatus; label: string } => Boolean(item.value)).map((item) => (
              <button
                className={report.status === item.value ? styles.bugAdminStatusButtonActive : styles.bugAdminStatusButton}
                disabled={report.status === item.value}
                key={item.value}
                name="status"
                type="submit"
                value={item.value}
              >
                {item.label}
              </button>
            ))}
          </div>
        </form>
      </section>

      <section className={styles.bugAdminMemoPanel}>
        <div className={styles.bugAdminWorkflowHeader}>
          <strong>내부 메모</strong>
          <span>고객에게 발송되지 않는 운영 기록입니다.</span>
        </div>
        <form action="/api/pdp/bug-reports/admin-actions" className={styles.bugAdminMemoForm} method="post">
          <input name="action" type="hidden" value="memo" />
          <input name="reportId" type="hidden" value={report.id} />
          <input name="returnTo" type="hidden" value={makeFilterHref(activeStatus)} />
          <textarea maxLength={1200} name="memo" placeholder="확인한 내용, 재현 방법, 처리 계획 등을 남겨주세요." required rows={3} />
          <button className={styles.secondaryButton} type="submit">
            <MessageSquareText size={15} />
            메모 저장
          </button>
        </form>
      </section>

      <div className={styles.bugAdminTimelineBox}>
        <strong>처리 이력</strong>
        {adminEvents.length ? (
          <div className={styles.bugAdminTimeline}>
            {[...adminEvents].reverse().map((event) => (
              <div className={styles.bugAdminTimelineItem} key={event.id}>
                <div>
                  <strong>{formatAdminEventTitle(event)}</strong>
                  <span>{formatKst(event.createdAt)}</span>
                </div>
                {event.memo ? <p>{event.memo}</p> : null}
                {event.notifications?.length ? (
                  <code>
                    <Mail size={13} />
                    {formatNotifications({ ...report, notifications: event.notifications })}
                  </code>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <code>아직 처리 이력이 없습니다.</code>
        )}
      </div>

      {eventCount ? (
        <div className={styles.bugAdminDetailBox}>
          <strong>최근 사용 로그</strong>
          <pre>{formatRecentEvents(report)}</pre>
        </div>
      ) : null}
    </article>
  );
}

function countReports(reports: PdpBugReportRecord[]) {
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

function normalizeStatus(value?: string): "" | PdpBugReportStatus {
  return value === "new" || value === "reviewing" || value === "resolved" || value === "archived" ? value : "";
}

function makeFilterHref(status: "" | PdpBugReportStatus) {
  const params = new URLSearchParams();
  if (status) {
    params.set("status", status);
  }

  const query = params.toString();
  return `/pdp-maker/admin/bug-reports${query ? `?${query}` : ""}`;
}

function statusBadgeClass(status: PdpBugReportStatus) {
  if (status === "new") {
    return styles.bugAdminBadgeNew;
  }
  if (status === "reviewing") {
    return styles.bugAdminBadgeReviewing;
  }
  if (status === "resolved") {
    return styles.bugAdminBadgeResolved;
  }

  return styles.bugAdminBadgeArchived;
}

function formatKst(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "시간 미상";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatRecentEvents(report: PdpBugReportRecord) {
  return report.recentEvents
    .map((event) => `${formatKst(event.timestamp)} · ${event.level} · ${event.source} · ${event.event}`)
    .join("\n");
}

function formatAdminEventTitle(event: PdpBugReportAdminEvent) {
  if (event.type === "memo") {
    return "내부 메모";
  }

  const previous = event.previousStatus ? STATUS_LABELS[event.previousStatus] : "이전 상태";
  const next = event.status ? STATUS_LABELS[event.status] : "상태 변경";
  return `${previous} → ${next}`;
}

function formatNotifications(report: PdpBugReportRecord) {
  return (report.notifications ?? [])
    .map((item) => {
      const state = item.skipped ? "skipped" : item.ok ? "sent" : "failed";
      return `${formatKst(item.timestamp)} · ${formatNotificationChannel(item.channel)} · ${state} · ${item.message}`;
    })
    .join("\n");
}

function formatNotificationChannel(channel: string) {
  if (channel === "customer-email") {
    return "customer email";
  }
  return channel;
}
