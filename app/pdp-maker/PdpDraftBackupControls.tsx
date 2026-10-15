"use client";
import { useRef, useState } from "react";
import styles from "./pdp-maker.module.css";

export function PdpDraftBackupControls({ onExport, onImport }: { onExport: () => Promise<{ text: string; fileName: string }>; onImport: (text: string) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 8 }}>
    <button className={styles.secondaryButton} type="button" disabled={busy} onClick={async () => {
      setBusy(true); setMessage("");
      try { const backup = await onExport(); const url = URL.createObjectURL(new Blob([backup.text], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = backup.fileName; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage("작업 백업을 다운로드했습니다. API 키는 포함하지 않습니다."); }
      catch (error) { setMessage(error instanceof Error ? error.message : "백업 실패"); }
      finally { setBusy(false); }
    }}>작업 백업</button>
    <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => input.current?.click()}>백업 가져오기</button>
    <input ref={input} aria-label="작업 백업 파일" type="file" accept=".json,application/json" hidden onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      setBusy(true); setMessage("");
      try { if (file.size > 100 * 1024 * 1024) throw new Error("백업 파일은 100MB 이하만 가져올 수 있습니다."); await onImport(await file.text()); setMessage("기존 작업을 덮어쓰지 않고 새 작업으로 가져왔습니다."); }
      catch (error) { setMessage(error instanceof Error ? error.message : "백업 가져오기 실패"); }
      finally { setBusy(false); }
    }} />
    {message ? <span role="status" style={{ flexBasis: "100%" }}>{message}</span> : null}
  </div>;
}
