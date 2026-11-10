import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { PII } from "../src/redact.js";
import { EventStore } from "../src/store.js";
import type { RawEvent } from "../src/types.js";

const base: RawEvent = {
  id: "evt_1",
  org_id: "org_acme",
  user_id: "u_1",
  app: "Slack",
  ts: "2026-11-02T09:00:00Z",
  label: "Message",
  text: "hello",
};

function event(overrides: Partial<RawEvent> = {}): RawEvent {
  return { ...base, ...overrides };
}

let app = createApp(new EventStore());

beforeEach(() => {
  app = createApp(new EventStore());
});

describe("POST /events", () => {
  it("accepts a batch, redacts it, and stores no raw personal data", async () => {
    const response = await request(app)
      .post("/events")
      .set("X-Org-Id", "org_acme")
      .send({ events: [event({ label: "Email", text: "priya@acme-example.com" })] });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ received: 1, accepted: 1, duplicates: 0, redactions: 1 });

    const list = await request(app).get("/events").set("X-Org-Id", "org_acme");
    expect(list.body.events).toHaveLength(1);
    expect(list.body.events[0].text).toBe(PII);
    expect(JSON.stringify(list.body)).not.toContain("priya@acme-example.com");
  });

  it("ignores a duplicate event id instead of storing it twice", async () => {
    const payload = { events: [event()] };

    await request(app).post("/events").set("X-Org-Id", "org_acme").send(payload).expect(201);
    const second = await request(app)
      .post("/events")
      .set("X-Org-Id", "org_acme")
      .send(payload)
      .expect(201);

    expect(second.body).toMatchObject({ accepted: 0, duplicates: 1 });
    const list = await request(app).get("/events").set("X-Org-Id", "org_acme");
    expect(list.body.events).toHaveLength(1);
  });

  it("rejects malformed events with the index and the broken field", async () => {
    const malformed: Record<string, unknown> = { ...event({ id: "evt_2" }), ts: "not-a-date" };
    delete malformed.org_id;
    const response = await request(app)
      .post("/events")
      .set("X-Org-Id", "org_acme")
      .send({ events: [event(), malformed] });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("events[1]");
    expect(response.body.error).toContain("org_id");
    expect(response.body.error).toContain("ts");
  });

  it("rejects an event whose org_id does not match the authenticated header", async () => {
    const response = await request(app)
      .post("/events")
      .set("X-Org-Id", "org_acme")
      .send({ events: [event({ org_id: "org_globex" })] });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("different organisation");
  });

  it("requires the X-Org-Id header", async () => {
    await request(app).post("/events").send({ events: [event()] }).expect(401);
  });
});

describe("GET /events", () => {
  async function seed() {
    await request(app)
      .post("/events")
      .set("X-Org-Id", "org_acme")
      .send({
        events: [
          event({ id: "evt_a", ts: "2026-11-02T09:00:00Z" }),
          event({ id: "evt_b", ts: "2026-11-02T09:05:00Z" }),
          event({ id: "evt_c", ts: "2026-11-02T09:10:00Z" }),
        ],
      })
      .expect(201);
    await request(app)
      .post("/events")
      .set("X-Org-Id", "org_globex")
      .send({ events: [event({ id: "evt_x", org_id: "org_globex", ts: "2026-11-02T10:00:00Z" })] })
      .expect(201);
  }

  it("never returns another organisation's events", async () => {
    await seed();

    const acme = await request(app).get("/events").set("X-Org-Id", "org_acme").expect(200);
    expect(acme.body.events.map((e: RawEvent) => e.id)).toEqual(["evt_c", "evt_b", "evt_a"]);

    const globex = await request(app).get("/events").set("X-Org-Id", "org_globex").expect(200);
    expect(globex.body.events.map((e: RawEvent) => e.id)).toEqual(["evt_x"]);
  });

  it("paginates newest first with a cursor and returns no duplicates", async () => {
    await seed();

    const first = await request(app)
      .get("/events?limit=2")
      .set("X-Org-Id", "org_acme")
      .expect(200);
    expect(first.body.events.map((e: RawEvent) => e.id)).toEqual(["evt_c", "evt_b"]);
    expect(first.body.nextCursor).toBeTypeOf("string");

    const second = await request(app)
      .get(`/events?limit=2&cursor=${first.body.nextCursor}`)
      .set("X-Org-Id", "org_acme")
      .expect(200);
    expect(second.body.events.map((e: RawEvent) => e.id)).toEqual(["evt_a"]);
    expect(second.body.nextCursor).toBeNull();
  });

  it("filters by app", async () => {
    await request(app)
      .post("/events")
      .set("X-Org-Id", "org_acme")
      .send({
        events: [
          event({ id: "evt_a", app: "Slack" }),
          event({ id: "evt_b", app: "Terminal" }),
        ],
      })
      .expect(201);

    const response = await request(app)
      .get("/events?app=Terminal")
      .set("X-Org-Id", "org_acme")
      .expect(200);
    expect(response.body.events.map((e: RawEvent) => e.id)).toEqual(["evt_b"]);
  });

  it("rejects an invalid cursor with a clear error", async () => {
    const response = await request(app)
      .get("/events?cursor=not-a-cursor")
      .set("X-Org-Id", "org_acme")
      .expect(400);
    expect(response.body.error).toBe("Invalid cursor");
  });

  it("requires the X-Org-Id header", async () => {
    await request(app).get("/events").expect(401);
  });
});
