# AI usage

## Tools

- **OpenCode** (agentic coding CLI) running a hosted model, used as a pair
  programmer in the editor: scaffolding, writing code, running tests, and
  reviewing failures.
- No autocomplete-only tool was used for the redaction logic; the rules were
  discussed and then written into `src/redact.ts` where I could test them.

## Where I accepted AI output

- Project scaffolding: `package.json`, `tsconfig.json`, Express wiring, and the
  static page shell.
- The first draft of the Luhn implementation and the email/JWT regexes.
- The shape of the API tests (supertest) and the README outline.
- CSS for the page; it is deliberately plain and not the point of the task.

## Where I corrected or overrode it

- **Phone regex over-matching.** The first draft treated any 10–15 digit run as
  a phone number, which would have redacted order numbers. I changed it to
  require a leading `+`, at least two separators, or an Indian mobile pattern,
  and capped the digit count at 13.
- **Card boundaries.** The first card regex had no word boundaries and could
  match part of a longer numeric id. I constrained it to 13–19 digits with
  boundaries and kept the Luhn gate as the final decision, so order and invoice
  numbers survive.
- **Tenant check.** The first API draft trusted `org_id` from the request body.
  I overrode that: the header is the identity, and a body `org_id` that
  disagrees is a `403`.
- **Redaction timing.** I rejected a read-time redaction approach; redacting on
  insert is the only way to guarantee no raw value is stored.
- **Sensitive labels.** I narrowed the list to labels that name a field
  (`Full name`, `Date of birth`, `Account number`, `CVV`, …) rather than any
  label containing the word "card", so prose like "Customer paid with …" keeps
  its context and only the card number is replaced.

## Prior context

I did a practice run of a similar brief before this verified application. This
submission was rebuilt from scratch in a new repository during the recorded
session; the practice code was not copied in. I am disclosing it because the
brief asks what I used and because the comparison is part of the assessment.
