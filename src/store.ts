import { redactWithCount } from "./redact.js";
import type { RawEvent, StoredEvent } from "./types.js";

export interface InsertResult {
  status: "inserted" | "duplicate";
  redactions: number;
}

export interface ListOptions {
  orgId: string;
  app?: string;
  limit: number;
  cursor?: string;
}

function encodeCursor(event: StoredEvent): string {
  return Buffer.from(JSON.stringify({ ts: event.ts, id: event.id }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { ts: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      ts?: unknown;
      id?: unknown;
    };
    if (typeof parsed.ts !== "string" || typeof parsed.id !== "string") return null;
    return { ts: parsed.ts, id: parsed.id };
  } catch {
    return null;
  }
}

/**
 * In-memory store. Redaction happens on insert, so the only copy this process
 * keeps is already redacted — there is no unredacted row to leak later.
 */
export class EventStore {
  private readonly events = new Map<string, StoredEvent>();

  private key(event: Pick<RawEvent, "org_id" | "id">): string {
    // Event ids are only unique within a tenant; keying globally would let one
    // org probe another's ids through the duplicate counter.
    return `${event.org_id}::${event.id}`;
  }

  get size(): number {
    return this.events.size;
  }

  insert(event: RawEvent): InsertResult {
    const key = this.key(event);
    if (this.events.has(key)) {
      return { status: "duplicate", redactions: 0 };
    }
    const { text, count } = redactWithCount(event.label, event.text);
    this.events.set(key, { ...event, text, redactions: count });
    return { status: "inserted", redactions: count };
  }

  list(options: ListOptions): { events: StoredEvent[]; nextCursor: string | null } {
    let rows = [...this.events.values()].filter((event) => event.org_id === options.orgId);
    if (options.app) {
      rows = rows.filter((event) => event.app === options.app);
    }

    rows.sort((a, b) => (a.ts === b.ts ? b.id.localeCompare(a.id) : b.ts.localeCompare(a.ts)));

    if (options.cursor) {
      const cursor = decodeCursor(options.cursor);
      if (!cursor) throw new Error("invalid cursor");
      rows = rows.filter(
        (event) => event.ts < cursor.ts || (event.ts === cursor.ts && event.id < cursor.id),
      );
    }

    const page = rows.slice(0, options.limit);
    const last = page.at(-1);
    return {
      events: page,
      nextCursor: rows.length > options.limit && last ? encodeCursor(last) : null,
    };
  }
}
