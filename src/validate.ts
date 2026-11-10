import type { RawEvent } from "./types.js";

const STRING_FIELDS = ["id", "org_id", "user_id", "app", "ts", "label", "text"] as const;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type ValidationResult =
  | { ok: true; event: RawEvent }
  | { ok: false; error: string };

export function validateEvent(input: unknown, index: number): ValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: `events[${index}]: must be an object` };
  }

  const value = input as Record<string, unknown>;
  const problems: string[] = [];

  for (const field of STRING_FIELDS) {
    if (typeof value[field] !== "string") {
      problems.push(`${field} must be a string`);
    } else if (field !== "text" && value[field].trim() === "") {
      problems.push(`${field} must not be empty`);
    }
  }

  if (typeof value.ts === "string" && (!ISO_RE.test(value.ts) || Number.isNaN(Date.parse(value.ts)))) {
    problems.push("ts must be an ISO 8601 timestamp");
  }

  if (problems.length > 0) {
    return { ok: false, error: `events[${index}]: ${problems.join("; ")}` };
  }

  return {
    ok: true,
    event: {
      id: value.id as string,
      org_id: value.org_id as string,
      user_id: value.user_id as string,
      app: value.app as string,
      // Normalise so newest-first ordering is safe across timezone offsets.
      ts: new Date(value.ts as string).toISOString(),
      label: value.label as string,
      text: value.text as string,
    },
  };
}

export function validateBatch(body: unknown): { ok: true; events: RawEvent[] } | { ok: false; error: string } {
  const list = Array.isArray(body)
    ? body
    : typeof body === "object" && body !== null && Array.isArray((body as { events?: unknown }).events)
      ? (body as { events: unknown[] }).events
      : null;

  if (!list) {
    return { ok: false, error: "body must be an array of events or { events: [...] }" };
  }
  if (list.length === 0) {
    return { ok: false, error: "events must not be empty" };
  }

  const events: RawEvent[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const result = validateEvent(list[i], i);
    if (!result.ok) return result;
    events.push(result.event);
  }
  return { ok: true, events };
}
