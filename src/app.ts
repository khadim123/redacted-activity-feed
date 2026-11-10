import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { ErrorRequestHandler, Request, Response } from "express";
import { EventStore } from "./store.js";
import { validateBatch } from "./validate.js";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

function orgFrom(req: Request, res: Response): string | null {
  const orgId = req.header("x-org-id");
  if (!orgId) {
    res.status(401).json({ error: "X-Org-Id header is required" });
    return null;
  }
  return orgId;
}

export function createApp(store: EventStore): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(PUBLIC_DIR));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/events", (req, res) => {
    const orgId = orgFrom(req, res);
    if (!orgId) return;

    const parsed = validateBatch(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    // The header is the authenticated identity; a body org_id may never override it.
    const foreign = parsed.events.find((event) => event.org_id !== orgId);
    if (foreign) {
      res.status(403).json({
        error: `Event ${foreign.id} belongs to a different organisation than X-Org-Id`,
      });
      return;
    }

    let accepted = 0;
    let duplicates = 0;
    let redactions = 0;
    for (const event of parsed.events) {
      const result = store.insert(event);
      if (result.status === "inserted") {
        accepted += 1;
        redactions += result.redactions;
      } else {
        duplicates += 1;
      }
    }

    res.status(201).json({
      received: parsed.events.length,
      accepted,
      duplicates,
      redactions,
    });
  });

  app.get("/events", (req, res) => {
    const orgId = orgFrom(req, res);
    if (!orgId) return;

    const requestedLimit = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
      : 20;
    const appFilter = typeof req.query.app === "string" ? req.query.app : undefined;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

    try {
      res.json(store.list({ orgId, app: appFilter, limit, cursor }));
    } catch {
      res.status(400).json({ error: "Invalid cursor" });
    }
  });

  // Keep error responses JSON-shaped: a client parsing `error` should never
  // receive Express's HTML error page for a bad body.
  const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    if ((err as { type?: string }).type === "entity.too.large") {
      res.status(413).json({ error: "Request body too large" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}
