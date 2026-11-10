# Redacted activity feed

A small TypeScript/Node service that ingests activity events, removes personal
data **before** storage, and serves a per-organisation feed with a minimal UI.

## Run it

```bash
npm install
npm start          # http://localhost:3000, seeds data/sample-events.json
npm test           # redaction + API tests
npm run typecheck
```

`SEED=false npm start` starts with an empty store. The page defaults to
`org_acme`; change the organisation field to `org_globex` to see the other
tenant's events.

## API

`POST /events` — header `X-Org-Id` required. Body is an array or
`{ "events": [...] }`.

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -H "X-Org-Id: org_acme" \
  -d '{"events":[{"id":"evt_100","org_id":"org_acme","user_id":"u_1","app":"Slack","ts":"2026-11-02T09:00:00Z","label":"Email","text":"a@b.com"}]}'
```

Returns `201 { received, accepted, duplicates, redactions }`. Malformed events
return `400` with the failing index and field; an event whose `org_id` differs
from `X-Org-Id` returns `403`; a missing header returns `401`.

`GET /events?limit=20&cursor=...&app=Slack` — header `X-Org-Id` required.
Returns `{ events, nextCursor }`, newest first, redacted only.

## Key decisions

**Redaction runs on write, not on read.** `EventStore.insert` calls
`redactWithCount` and stores only the redacted text. There is no unredacted
copy in memory or on disk to leak through a later query or log.

**Redaction is a pure function with ordered rules.** `redact(label, text)` lives
in `src/redact.ts` and has no I/O. Order is deliberate: emails and tokens first,
then cards, then phones. Cards are candidates of 13–19 digits and are only
replaced when they pass Luhn, so `4111 1111 1111 1111` is removed while
`5432 1098 7654 3210` (order number) and `INV-2026-000417` survive. Phone
matching requires a `+`, at least two separators, or an Indian 10-digit mobile
pattern, which keeps short numeric references from being swallowed.

**Sensitive labels replace the whole value.** A label like `Full name`,
`Date of birth`, or `Account number` means the text *is* the field, so there is
no safe substring — the value becomes `⟦PII⟧` regardless of what it looks like.
Label matching ignores case, spaces, and punctuation (`full_name`, `Account No.`).

**The org comes from the header, never the body.** `X-Org-Id` is treated as the
authenticated identity. `POST` rejects events whose body `org_id` disagrees with
it, and `GET` filters on it, so one organisation cannot read or write another's
events.

**In-memory storage.** The brief allows it and it keeps the service dependency-
free and the tests deterministic. Redaction happens before the `Map` write, so
the privacy property holds regardless of the storage engine. The trade-off is
that data is lost on restart and the store is per-process.

**Keyset pagination.** The cursor encodes `{ ts, id }`, so pages stay stable
while new events are written; offset pagination would duplicate or skip rows.
`ts` is normalised to UTC ISO on ingest so string ordering is chronological.

**Duplicates are ignored by event id**, within a batch and across batches. The
response reports how many were skipped. The first version wins.

## What I cut

- No authentication or API-key issuing — the header is trusted, as instructed.
- No persistent database, migrations, or retention policy.
- No UI pagination controls; the page asks for the newest 100 events.
- No rate limiting, structured logging, or metrics.
- No exhaustive international phone coverage; the common Indian, US, and
  E.164-with-`+` forms are covered.

## With more time

- SQLite (or Postgres) with the redaction boundary enforced in one repository
  method, plus a migration and an integration test against the real database.
- A property-based test that generates random PII and asserts no raw value can
  reach the store, rather than only example-based tests.
- Redaction rules as data (country phone plans, token prefixes) with a
  version stamp on each stored event, so a rule change can be audited.
- A dead-letter path for malformed rows in a batch instead of rejecting the
  whole batch, with per-row errors in the response.
- Auth middleware that derives the org from a signed key, replacing the
  trusted header.
