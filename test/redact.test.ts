import { describe, expect, it } from "vitest";
import { PII, redact, redactWithCount } from "../src/redact.js";

describe("redact", () => {
  it("redacts email addresses inside prose", () => {
    expect(redact("Email", "ping priya.sharma@acme-example.com today")).toBe(
      `ping ${PII} today`,
    );
  });

  it("redacts Indian and US phone numbers", () => {
    expect(redact("Message", "call me on +91 98450 12345 about the renewal")).toBe(
      `call me on ${PII} about the renewal`,
    );
    expect(redact("Message", "dial (415) 555-2671 tomorrow")).toBe(
      `dial ${PII} tomorrow`,
    );
    expect(redact("Message", "reach me at +1 415 555 2671")).toBe(`reach me at ${PII}`);
  });

  it("redacts Luhn-valid card numbers and keeps the surrounding sentence", () => {
    expect(redact("Card", "Customer paid with 4111 1111 1111 1111 yesterday")).toBe(
      `Customer paid with ${PII} yesterday`,
    );
    expect(redact("Card", "card 4111-1111-1111-1111 declined")).toBe(
      `card ${PII} declined`,
    );
  });

  it("keeps 16-digit order numbers that fail the Luhn check", () => {
    expect(redact("Order", "Order 5432 1098 7654 3210 shipped")).toBe(
      "Order 5432 1098 7654 3210 shipped",
    );
  });

  it("keeps invoice and reference ids", () => {
    expect(redact("Reference", "Invoice INV-2026-000417 approved")).toBe(
      "Invoice INV-2026-000417 approved",
    );
    expect(redact("Reference", "PO 2026-000417 raised")).toBe("PO 2026-000417 raised");
  });

  it("redacts API keys and JWTs", () => {
    expect(redact("Command", "export API_KEY=rk_demo_8f3a9c2e7b6d5a4f3e2d1c0b9a8f7e6d")).toBe(
      `export API_KEY=${PII}`,
    );
    expect(
      redact(
        "Header",
        "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1XzA1In0.c2lnbmF0dXJlLWRlbW8",
      ),
    ).toBe(`Authorization: Bearer ${PII}`);
  });

  it("redacts the whole value when the label names a sensitive field", () => {
    expect(redact("Full name", "Priya Sharma")).toBe(PII);
    expect(redact("Date of birth", "14/03/1991")).toBe(PII);
    expect(redact("Account number", "0012 3456 7890")).toBe(PII);
    expect(redact("CVV", "123")).toBe(PII);
  });

  it("matches sensitive labels regardless of case and spacing", () => {
    expect(redact("  DATE OF BIRTH ", "14/03/1991")).toBe(PII);
    expect(redact("full_name", "Priya Sharma")).toBe(PII);
    expect(redact("Account No.", "001234567890")).toBe(PII);
  });

  it("leaves non-sensitive business values untouched", () => {
    expect(redact("Order", "Order 5432 1098 7654 3210 shipped")).not.toContain(PII);
    expect(redact("Cell", "Q3 totals")).toBe("Q3 totals");
    expect(redact("Amount", "INR 1,24,500")).toBe("INR 1,24,500");
  });

  it("counts every value it replaces", () => {
    const result = redactWithCount(
      "Message",
      "email a@b.com, call +91 98450 12345, card 4111 1111 1111 1111",
    );
    expect(result.count).toBe(3);
    expect(result.text).toBe(`email ${PII}, call ${PII}, card ${PII}`);
  });

  it("returns the text unchanged when there is nothing to redact", () => {
    const result = redactWithCount("Message", "deploy finished at 09:03");
    expect(result).toEqual({ text: "deploy finished at 09:03", count: 0 });
  });
});
