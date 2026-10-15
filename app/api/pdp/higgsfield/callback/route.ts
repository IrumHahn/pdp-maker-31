import { clearPendingCookie, oauthRequest, readPending, sessionCookie, toSession, validState } from "../../../../../lib/pdp-server/higgsfield-auth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url), pending = readPending(request);
  let message = "Higgsfield 연결이 완료되었습니다. 이 창을 닫고 마법사로 돌아가세요.", ok = false;
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": clearPendingCookie(request), "Referrer-Policy": "no-referrer" });
  try {
    if (!pending || pending.expiresAt < Date.now() || !validState(url.searchParams.get("state") ?? "", pending.state)) throw new Error("연결 요청이 만료되었거나 일치하지 않습니다. 설정에서 다시 연결해 주세요.");
    if (url.searchParams.has("error")) throw new Error("Higgsfield 로그인이 취소되었습니다. 설정에서 다시 연결할 수 있습니다.");
    const code = url.searchParams.get("code");
    if (!code) throw new Error("로그인 승인 코드를 받지 못했습니다.");
    const data = await oauthRequest("/oauth/token", { grant_type: "authorization_code", code, client_id: pending.clientId, redirect_uri: pending.redirectUri, code_verifier: pending.verifier });
    headers.append("Set-Cookie", sessionCookie(request, toSession(data, pending.clientId))); ok = true;
  } catch (error) { message = error instanceof Error ? error.message : "Higgsfield 연결에 실패했습니다."; }
  const safeMessage = message.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
  return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Higgsfield 연결</title><body style="font-family:system-ui;padding:32px"><h1>Higgsfield 연결</h1><p>${safeMessage}</p><a href="/pdp-maker">마법사로 돌아가기</a>${ok ? `<script>if(window.opener){window.opener.postMessage({type:'pdp-higgsfield-connected'},${JSON.stringify(pending ? new URL(pending.redirectUri).origin : url.origin)});}try{new BroadcastChannel('pdp-higgsfield').postMessage('connected');}catch(e){}window.close();</script>` : ""}</body></html>`, { status: ok ? 200 : 400, headers });
}
