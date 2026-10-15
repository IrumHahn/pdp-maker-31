import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { sanitizePdpUsageLogEvent } from "../../../../lib/shared/pdp-usage-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_EVENTS_PER_REQUEST = 50;

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, message: "Invalid JSON payload." }, { status: 400 });
  }

  const requestUserAgent = request.headers.get("user-agent") ?? "";
  const rawEvents = extractRawEvents(payload).slice(0, MAX_EVENTS_PER_REQUEST);
  const receivedAt = new Date().toISOString();
  const events = rawEvents
    .map((event) => {
      const metadata = asRecord(event.metadata) ?? {};
      return sanitizePdpUsageLogEvent({
        ...event,
        metadata: {
          ...metadata,
          serverReceivedAt: receivedAt,
          userAgent: requestUserAgent
        }
      });
    })
    .filter((event) => event !== null);

  if (!events.length) {
    return Response.json({ ok: false, message: "No valid log events." }, { status: 400 });
  }

  const logDir = path.join(process.cwd(), "output", "user-logs");
  const fileName = `${receivedAt.slice(0, 10)}.jsonl`;
  await mkdir(logDir, { recursive: true });
  await appendFile(path.join(logDir, fileName), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");

  return Response.json({
    ok: true,
    count: events.length,
    path: `output/user-logs/${fileName}`
  });
}

function extractRawEvents(payload: unknown): Array<Record<string, unknown>> {
  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  if (Array.isArray(record.events)) {
    return record.events.flatMap((event) => {
      const eventRecord = asRecord(event);
      return eventRecord ? [eventRecord] : [];
    });
  }

  const eventRecord = asRecord(record.event);
  if (eventRecord) {
    return [eventRecord];
  }

  return [record];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}
