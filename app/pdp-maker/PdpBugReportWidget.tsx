"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import {
  PDP_BUG_REPORT_CATEGORIES,
  type PdpBugReportCategory,
  type PdpBugReportContext
} from "../../lib/shared/pdp-bug-report";
import styles from "./pdp-maker.module.css";
import {
  flushPdpUsageLogs,
  getPdpUsageSessionId,
  getRecentPdpUsageLogs,
  logPdpUsage
} from "./pdp-usage-log";

export interface PdpBugReportWidgetProps {
  context: PdpBugReportContext;
}

const REPORTER_EMAIL_STORAGE_KEY = "hanirum-pdp-maker-bug-reporter-email";
const API_ENDPOINT = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api"}/pdp/bug-reports`;

export function PdpBugReportWidget({ context }: PdpBugReportWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<PdpBugReportCategory>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [attachDiagnostics, setAttachDiagnostics] = useState(true);
  const [honeypot, setHoneypot] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "success" | "error"; message: string; id?: string }>({
    kind: "idle",
    message: ""
  });

  useEffect(() => {
    try {
      setReporterEmail(window.localStorage.getItem(REPORTER_EMAIL_STORAGE_KEY) ?? "");
    } catch {
      setReporterEmail("");
    }
  }, []);

  const enrichedContext = useMemo(() => {
    if (typeof window === "undefined") {
      return context;
    }

    return {
      ...context,
      route: buildCurrentRoute(),
      pageTitle: document.title,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }, [context]);

  const openPanel = () => {
    setIsOpen(true);
    setStatus({ kind: "idle", message: "" });
    logPdpUsage({
      event: "bug_report.open",
      source: context.surface === "editor" ? "editor" : "setup",
      state: compactWidgetState(enrichedContext)
    });
  };

  const closePanel = () => {
    setIsOpen(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedDescription = description.trim();
    if (trimmedDescription.length < 5) {
      setStatus({ kind: "error", message: "문제가 난 상황을 조금 더 적어주세요." });
      return;
    }

    const trimmedEmail = reporterEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setStatus({ kind: "error", message: "처리 결과를 받을 이메일을 입력해 주세요." });
      return;
    }

    setIsSubmitting(true);
    setStatus({ kind: "idle", message: "" });

    const recentEvents = attachDiagnostics ? getRecentPdpUsageLogs(12) : [];
    const sessionId = attachDiagnostics ? getPdpUsageSessionId() : "";

    logPdpUsage({
      event: "bug_report.submit_attempt",
      source: context.surface === "editor" ? "editor" : "setup",
      state: {
        category,
        hasReporterEmail: Boolean(trimmedEmail),
        attachDiagnostics,
        recentEventCount: recentEvents.length,
        ...compactWidgetState(enrichedContext)
      }
    });
    await flushPdpUsageLogs();

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          category,
          title,
          description: trimmedDescription,
          reporterEmail: trimmedEmail,
          context: enrichedContext,
          recentEvents,
          sessionId,
          website: honeypot
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        id?: string;
        message?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "신고를 접수하지 못했습니다.");
      }

      try {
        window.localStorage.setItem(REPORTER_EMAIL_STORAGE_KEY, trimmedEmail);
      } catch {
        // Email persistence is optional.
      }

      setStatus({
        kind: "success",
        message: "접수되었습니다. 처리 결과는 입력한 이메일로 안내드릴게요.",
        id: payload.id
      });
      setTitle("");
      setDescription("");
      logPdpUsage({
        event: "bug_report.submit_success",
        source: context.surface === "editor" ? "editor" : "setup",
        metadata: {
          reportId: payload.id
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "신고를 접수하지 못했습니다.";
      setStatus({ kind: "error", message });
      logPdpUsage({
        event: "bug_report.submit_error",
        source: context.surface === "editor" ? "editor" : "setup",
        level: "error",
        error: error instanceof Error ? error : String(error)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.bugReportDock}>
      {isOpen ? (
        <section aria-label="문의하기" className={styles.bugReportPanel} role="dialog">
          <header className={styles.bugReportHeader}>
            <div className={styles.bugReportTitleGroup}>
              <span className={styles.bugReportIcon}>
                <MessageCircle size={17} />
              </span>
              <div>
                <h2>문의하기</h2>
                <p>막힌 지점을 남겨주세요.</p>
              </div>
            </div>
            <button aria-label="문의 패널 닫기" className={styles.bugReportIconButton} onClick={closePanel} type="button">
              <X size={17} />
            </button>
          </header>

          <form className={styles.bugReportForm} onSubmit={handleSubmit}>
            <input
              aria-hidden="true"
              autoComplete="off"
              className={styles.bugReportHoneypot}
              onChange={(event) => setHoneypot(event.target.value)}
              tabIndex={-1}
              type="text"
              value={honeypot}
            />

            <div className={styles.bugReportCategoryGrid} role="group" aria-label="신고 유형">
              {PDP_BUG_REPORT_CATEGORIES.map((item) => (
                <button
                  aria-pressed={category === item.value}
                  className={category === item.value ? styles.bugReportCategoryActive : styles.bugReportCategory}
                  key={item.value}
                  onClick={() => setCategory(item.value)}
                  type="button"
                >
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>

            <label className={styles.bugReportField}>
              <span>제목</span>
              <input
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="예: 다운로드 버튼이 반응하지 않음"
                type="text"
                value={title}
              />
            </label>

            <label className={styles.bugReportField}>
              <span>내용</span>
              <textarea
                maxLength={2400}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="어떤 화면에서, 무엇을 눌렀을 때, 어떤 결과가 나왔는지 적어주세요."
                required
                rows={5}
                value={description}
              />
            </label>

            <label className={styles.bugReportField}>
              <span>답변 받을 이메일</span>
              <input
                autoComplete="email"
                maxLength={180}
                onChange={(event) => setReporterEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={reporterEmail}
              />
            </label>

            <label className={styles.bugReportCheck}>
              <input
                checked={attachDiagnostics}
                onChange={(event) => setAttachDiagnostics(event.target.checked)}
                type="checkbox"
              />
              <span>
                <ShieldCheck size={15} />
                현재 화면 맥락 함께 보내기
              </span>
            </label>

            {status.kind !== "idle" ? (
              <div className={status.kind === "success" ? styles.bugReportStatusSuccess : styles.bugReportStatusError}>
                {status.kind === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>
                  {status.message}
                  {status.id ? <strong> #{status.id}</strong> : null}
                </span>
              </div>
            ) : null}

            <button className={styles.bugReportSubmit} disabled={isSubmitting} type="submit">
              {isSubmitting ? <Loader2 className={styles.spinIcon} size={16} /> : <Send size={16} />}
              신고 보내기
            </button>
          </form>
        </section>
      ) : null}

      <button
        aria-expanded={isOpen}
        aria-label={isOpen ? "문의하기 닫기" : "문의하기 열기"}
        className={styles.bugReportFab}
        onClick={isOpen ? closePanel : openPanel}
        title={isOpen ? "문의하기 닫기" : "문의하기"}
        type="button"
      >
        {isOpen ? <X size={18} /> : null}
        <span>{isOpen ? "닫기" : "문의하기"}</span>
      </button>
    </div>
  );
}

function buildCurrentRoute() {
  try {
    const url = new URL(window.location.href);
    ["token", "apiKey", "openaiKey", "geminiKey"].forEach((key) => url.searchParams.delete(key));
    const query = url.searchParams.toString();
    return `${url.pathname}${query ? `?${query}` : ""}`;
  } catch {
    return window.location.pathname;
  }
}

function compactWidgetState(context: PdpBugReportContext) {
  return {
    surface: context.surface,
    appState: context.appState,
    setupStep: context.setupStep,
    outputMode: context.outputMode,
    sectionName: context.sectionName,
    sectionIndex: context.sectionIndex,
    sectionCount: context.sectionCount,
    hasError: Boolean(context.errorMessage)
  };
}
