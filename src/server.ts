import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { EventStore } from "./store.js";
import { validateEvent } from "./validate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const store = new EventStore();

// Demo seed so the page has something to show. Invalid rows are skipped one by
// one; the real POST /events path still rejects the whole batch atomically.
if (process.env.SEED !== "false") {
  const seedPath = path.join(here, "..", "data", "sample-events.json");
  if (fs.existsSync(seedPath)) {
    const rows = JSON.parse(fs.readFileSync(seedPath, "utf8")) as unknown[];
    let inserted = 0;
    let skipped = 0;
    rows.forEach((row, index) => {
      const parsed = validateEvent(row, index);
      if (!parsed.ok) {
        skipped += 1;
        console.warn(`Seed skipped: ${parsed.error}`);
        return;
      }
      if (store.insert(parsed.event).status === "inserted") inserted += 1;
      else skipped += 1;
    });
    console.log(`Seeded ${inserted} events (${skipped} skipped)`);
  }
}

const port = Number(process.env.PORT ?? 3000);
createApp(store).listen(port, () => {
  console.log(`Redacted activity feed on http://localhost:${port}`);
});
