import { getHiggsfieldParameterValue, getHiggsfieldReferenceMedia, isHiggsfieldReferenceModel, type AspectRatio, type HiggsfieldCostOptions, type HiggsfieldCostQuote, type HiggsfieldModel, type PdpErrorCode } from "../shared";
const MCP_URL = "https://mcp.higgsfield.ai/mcp";
export class HiggsfieldError extends Error {
  constructor(message: string, readonly code: PdpErrorCode = "HIGGSFIELD_REQUEST_FAILED", readonly status = 502) { super(message); }
}
function parseRpc(raw: string) {
  if (raw.trim().startsWith("{")) return JSON.parse(raw);
  for (const event of raw.split(/\r?\n\r?\n/)) {
    const lines = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
    if (lines.length) { const value = JSON.parse(lines.join("\n")); if ("result" in value || "error" in value) return value; }
  }
  throw new HiggsfieldError("Higgsfield MCP 응답을 읽지 못했습니다.");
}
export class HiggsfieldMcp {
  private sessionId?: string;
  private initialized = false;
  constructor(private readonly token: string) {
    if (!token) throw new HiggsfieldError("설정에서 Higgsfield 계정을 연결해 주세요.", "HIGGSFIELD_AUTH_REQUIRED", 401);
  }
  private async rpc(method: string, params: unknown, notification = false) {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "User-Agent": "pdp-maker/3.0" };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    if (this.initialized) headers["MCP-Protocol-Version"] = "2025-03-26";
    let response: Response;
    try { response = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", ...(!notification ? { id: 1 } : {}), method, params }), cache: "no-store", signal: AbortSignal.timeout(45000) }); }
    catch { throw new HiggsfieldError("Higgsfield 서버 응답이 지연되었습니다. 잠시 후 다시 시도해 주세요."); }
    if (!response.ok) throw new HiggsfieldError(response.status === 401 ? "Higgsfield 연결이 만료되었습니다. 설정에서 다시 연결해 주세요." : `Higgsfield 요청에 실패했습니다 (${response.status}).`, response.status === 401 ? "HIGGSFIELD_AUTH_REQUIRED" : "HIGGSFIELD_REQUEST_FAILED", response.status);
    this.sessionId = response.headers.get("mcp-session-id") ?? this.sessionId;
    if (notification) { await response.text(); return {}; }
    const payload = parseRpc(await response.text());
    if (payload.error) throw new HiggsfieldError("Higgsfield MCP 요청 규격을 처리하지 못했습니다.");
    return payload.result;
  }
  async initialize() {
    if (this.initialized) return;
    await this.rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "hanirum-pdp-maker", version: "3.0" } });
    this.initialized = true;
    await this.rpc("notifications/initialized", {}, true);
  }
  async call(name: string, args: unknown): Promise<any> {
    await this.initialize();
    const result = await this.rpc("tools/call", { name, arguments: args });
    let data = result.structuredContent;
    if (!data) {
      const text = result.content?.find((item: { type: string }) => item.type === "text")?.text;
      if (text) { try { data = JSON.parse(text); } catch { /* Unstructured text is not a machine contract. */ } }
    }
    if (result.isError || data?.error) {
      const credit = data?.monetization_intent || /credit|balance|subscription/i.test(String(data?.error ?? ""));
      throw new HiggsfieldError(credit ? "Higgsfield 크레딧 또는 구독 상태를 확인해 주세요." : "Higgsfield에서 요청을 처리하지 못했습니다. 연결과 선택한 모델 옵션을 확인해 주세요.", credit ? "HIGGSFIELD_CREDITS_REQUIRED" : "HIGGSFIELD_REQUEST_FAILED", credit ? 402 : 502);
    }
    if (!data) throw new HiggsfieldError("Higgsfield에서 필요한 결과 데이터를 받지 못했습니다.");
    return data;
  }
  async models(): Promise<HiggsfieldModel[]> {
    const models: HiggsfieldModel[] = [];
    let after: string | undefined;
    const cursors = new Set<string>();
    for (let page = 0; page < 10; page++) {
      const data = await this.call("models_explore", { action: "list", type: "image", limit: 100, ...(after ? { after } : {}) });
      models.push(...(data.items ?? []));
      if (!data.has_more) break;
      after = data.next_page_token;
      if (!after || cursors.has(after)) throw new HiggsfieldError("Higgsfield 모델 목록을 끝까지 읽지 못했습니다.");
      cursors.add(after);
    }
    return models.filter(isHiggsfieldReferenceModel).filter((model, index, list) => list.findIndex((item) => item.id === model.id) === index);
  }
  async model(id: string): Promise<HiggsfieldModel> {
    const model = await this.call("models_explore", { action: "get", model_id: id });
    if (!isHiggsfieldReferenceModel(model)) throw new HiggsfieldError("레퍼런스 이미지를 사용하는 이미지 생성 모델만 선택할 수 있습니다.", "INVALID_REQUEST", 400);
    return model;
  }
  private async imageParams(input: HiggsfieldCostOptions & { prompt: string }) {
    const model = await this.model(input.model);
    if (!model.aspect_ratios?.includes(input.aspectRatio)) throw new HiggsfieldError("선택한 Higgsfield 모델이 이 이미지 비율을 지원하지 않습니다. 다른 모델이나 비율을 선택해 주세요.", "INVALID_REQUEST", 400);
    const params: Record<string, unknown> = { model: model.id, prompt: input.prompt, count: 1, aspect_ratio: input.aspectRatio, use_unlim: false };
    for (const [name, requested] of [["quality", input.quality], ["resolution", input.resolution], ["variant", input.variant]]) {
      const parameter = model.parameters?.find((item) => item.name === name);
      if (requested && parameter?.options?.length && !parameter.options.map(String).includes(requested)) throw new HiggsfieldError("선택한 모델의 품질 옵션이 변경되었습니다. 설정에서 모델을 다시 선택해 주세요.", "INVALID_REQUEST", 400);
      const value = getHiggsfieldParameterValue(model, name!, requested ?? "");
      if (value !== undefined) params[name!] = value;
    }
    return { model, params };
  }
  async estimateCost(input: HiggsfieldCostOptions): Promise<HiggsfieldCostQuote> {
    const { params } = await this.imageParams({ ...input, prompt: "Product image" });
    // Official MCP contract: get_cost=true returns a quote without submitting
    // any job. Do not upload references, retry as generation, or accept caller flags.
    const data = await this.call("generate_image", { params: { ...params, get_cost: true } });
    const cost = data.cost;
    if (data.results?.length || !cost || typeof cost.credits !== "number" || !Number.isFinite(cost.credits) || cost.credits < 0 || typeof cost.credits_exact !== "number" || !Number.isFinite(cost.credits_exact) || cost.credits_exact < 0) throw new HiggsfieldError("Higgsfield 공식 비용 견적을 읽지 못했습니다. 잠시 후 비용을 다시 조회해 주세요.");
    // A server adjustment makes the quote unsuitable for the user's selection.
    if (Object.entries(data.adjustments ?? {}).some(([name, value]) => name in params && (value as { used: unknown }).used !== params[name])) throw new HiggsfieldError("Higgsfield에서 선택 옵션을 변경했습니다. 모델 옵션을 다시 선택한 뒤 비용을 확인해 주세요.");
    return {
      creditsPerImage: cost.credits, exactCreditsPerImage: cost.credits_exact,
      options: { model: String(params.model), aspectRatio: String(params.aspect_ratio), ...(params.quality !== undefined ? { quality: String(params.quality) } : {}), ...(params.resolution !== undefined ? { resolution: String(params.resolution) } : {}), ...(params.variant !== undefined ? { variant: String(params.variant) } : {}) },
      quotedAt: new Date().toISOString()
    };
  }
  async upload(base64: string, mimeType: string, name: string) {
    const data = await this.call("media_upload", { filename: name, content_type: mimeType });
    const upload = data.uploads?.[0];
    if (!upload?.upload_url || !upload.media_id || upload.method !== "PUT") throw new HiggsfieldError("제품 이미지 업로드를 준비하지 못했습니다.");
    const bytes = Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64");
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new HiggsfieldError("제품 이미지 용량은 25MB 이하여야 합니다.", "INVALID_IMAGE_PAYLOAD", 400);
    // URLs are provided by the authenticated provider. Restrict hosts and redirects.
    const url = trustedMediaUrl(upload.upload_url);
    const response = await fetch(url, { method: "PUT", headers: { "Content-Type": upload.content_type ?? mimeType }, body: new Uint8Array(bytes), redirect: "error", signal: AbortSignal.timeout(45000) });
    if (response.status !== 200) throw new HiggsfieldError("제품 이미지 업로드에 실패했습니다.");
    const confirmation = await this.call("media_confirm", { type: "image", media_id: upload.media_id });
    const confirmed = confirmation.results?.find((result: { media_id: string; status: string }) => result.media_id === upload.media_id && !["failed", "error"].includes(result.status));
    if (!confirmed) throw new HiggsfieldError("제품 이미지 업로드를 확인하지 못했습니다.");
    return upload.media_id as string;
  }
  async generate(input: { model: string; quality?: string; resolution?: string; variant?: string; aspectRatio: AspectRatio; prompt: string; references: Array<{ base64: string; mimeType: string }> }) {
    const { model, params } = await this.imageParams(input);
    const media = getHiggsfieldReferenceMedia(model, input.references.length)!;
    if (media.max !== undefined && input.references.length > media.max) throw new HiggsfieldError(`이 모델은 레퍼런스 이미지 ${media.max}장까지 지원합니다. 현재 ${input.references.length}장(제품·인물·수정 기준)을 사용하므로 다른 모델을 선택하거나 인물/수정 기준을 줄여 주세요.`, "INVALID_REQUEST", 400);
    const role = media.roles.includes("image_references") ? "image_references" : "image";
    params.medias = await Promise.all(input.references.map(async (reference, index) => ({ value: await this.upload(reference.base64, reference.mimeType, `pdp-reference-${index}.${reference.mimeType === "image/png" ? "png" : reference.mimeType === "image/webp" ? "webp" : "jpg"}`), role })));
    const submitted = await this.call("generate_image", { params });
    const result = submitted.results?.[0];
    const jobId = result?.job_id ?? result?.id;
    if (!jobId) throw new HiggsfieldError("Higgsfield 생성 작업 번호를 받지 못했습니다.");
    const deadline = Date.now() + 210000;
    while (Date.now() < deadline) {
      const status = await this.call("job_status", { jobId, sync: true });
      const generation = status.generation;
      if (generation?.status === "completed") {
        if (!generation.results?.rawUrl) throw new HiggsfieldError("완료된 Higgsfield 이미지 주소가 없습니다.");
        const response = await fetch(trustedMediaUrl(generation.results.rawUrl), { redirect: "error", signal: AbortSignal.timeout(25000) });
        const mimeType = response.headers.get("content-type")?.split(";")[0];
        if (!response.ok || !mimeType?.startsWith("image/")) throw new HiggsfieldError("생성된 Higgsfield 이미지를 가져오지 못했습니다.");
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new HiggsfieldError("생성 이미지가 비어 있거나 용량이 너무 큽니다.");
        return { imageBase64: bytes.toString("base64"), mimeType };
      }
      if (["failed", "canceled", "nsfw", "ip_detected"].includes(generation?.status)) throw new HiggsfieldError("Higgsfield 이미지 생성이 완료되지 않았습니다. 계정의 생성 내역에서 상태를 확인해 주세요.");
      const delay = Math.max(1, Math.min(10, Number(status.poll_after_seconds ?? 3)));
      await new Promise((resolve) => setTimeout(resolve, delay * 1000));
    }
    throw new HiggsfieldError("Higgsfield 생성이 아직 진행 중입니다. Higgsfield 생성 내역을 확인한 뒤 다시 시도해 주세요.", "HIGGSFIELD_GENERATION_PENDING", 504);
  }
}
export function trustedMediaUrl(value: string) {
  const url = new URL(value);
  const hosts = ["higgsfield.ai", "higgsfieldusercontent.com", "amazonaws.com", "cloudfront.net", "r2.cloudflarestorage.com", "r2.dev"];
  if (url.protocol !== "https:" || url.username || url.password || !hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new HiggsfieldError("Higgsfield 이미지 저장소 주소를 확인하지 못했습니다.");
  return url.toString();
}
