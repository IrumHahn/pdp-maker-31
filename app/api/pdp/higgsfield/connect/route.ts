import { createHash, randomBytes } from "node:crypto";
import { assertSameOrigin, higgsfieldAppOrigin, HIGGSFIELD_AUTHORIZE_URL, oauthRequest, pendingCookie } from "../../../../../lib/pdp-server/higgsfield-auth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
    const redirectUri = new URL("/api/pdp/higgsfield/callback", higgsfieldAppOrigin(request)).toString();
    const registration = await oauthRequest("/oauth/register", {
      client_name: "PDP Maker 3.0", redirect_uris: [redirectUri], response_types: ["code"],
      grant_types: ["authorization_code", "refresh_token"], token_endpoint_auth_method: "none"
    }, true);
    if (!registration.client_id) throw new Error("Higgsfield 연결 클라이언트를 등록하지 못했습니다.");
    const state = randomBytes(24).toString("base64url"), verifier = randomBytes(32).toString("base64url");
    const query = new URLSearchParams({ response_type: "code", client_id: registration.client_id, redirect_uri: redirectUri, scope: "openid email offline_access", state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", resource: "https://mcp.higgsfield.ai/mcp" });
    return new Response(null, { status: 302, headers: { Location: `${HIGGSFIELD_AUTHORIZE_URL}?${query}`, "Cache-Control": "no-store",
      "Set-Cookie": pendingCookie(request, { state, verifier, clientId: registration.client_id, redirectUri, expiresAt: Date.now() + 600000 }) } });
  } catch (error) { return Response.json({ ok: false, message: error instanceof Error ? error.message : "Higgsfield 연결을 시작하지 못했습니다." }, { status: 502, headers: { "Cache-Control": "no-store" } }); }
}
