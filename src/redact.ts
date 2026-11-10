export const PII = "⟦PII⟧";

/**
 * Labels that describe a single sensitive field. When the label itself names
 * the field, the whole value is personal data — there is no safe substring.
 */
const SENSITIVE_LABELS = new Set([
  "name",
  "fullname",
  "firstname",
  "lastname",
  "dateofbirth",
  "dob",
  "accountnumber",
  "accountno",
  "accno",
  "acctno",
  "cardnumber",
  "cvv",
  "cvc",
  "ssn",
  "socialsecuritynumber",
  "passportnumber",
  "nationalid",
  "aadhaar",
  "aadhaarnumber",
  "pannumber",
  "iban",
  "routingnumber",
  "taxid",
]);

export function isSensitiveLabel(label: string): boolean {
  const key = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SENSITIVE_LABELS.has(key);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const API_KEY_RE = /\b(?:rk|sk|pk|ak|ghp|gho|ghs|xox[abp])[_-][A-Za-z0-9_-]{10,}\b/g;
const AWS_KEY_RE = /\bAKIA[0-9A-Z]{16}\b/g;

// 13–19 digits, optionally grouped with single spaces or dashes.
const CARD_CANDIDATE_RE = /\b\d(?:[ -]?\d){12,18}\b/g;
const PHONE_CANDIDATE_RE = /(?<![\w])(\(?\+?\d[\d ().-]{7,}\d)(?![\w])/g;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export interface RedactionResult {
  text: string;
  count: number;
}

/**
 * Redact one event value and report how many values were replaced.
 * Pure: no I/O, no global state, same input -> same output.
 */
export function redactWithCount(label: string, text: string): RedactionResult {
  if (isSensitiveLabel(label)) {
    return { text: PII, count: 1 };
  }
  if (!text) {
    return { text, count: 0 };
  }

  let out = text;
  let count = 0;

  const replaceAll = (re: RegExp) => {
    out = out.replace(re, () => {
      count += 1;
      return PII;
    });
  };

  // Order matters: emails and tokens before phones, cards before phones.
  replaceAll(EMAIL_RE);
  replaceAll(JWT_RE);
  replaceAll(API_KEY_RE);
  replaceAll(AWS_KEY_RE);

  out = out.replace(CARD_CANDIDATE_RE, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) {
      return match;
    }
    count += 1;
    return PII;
  });

  out = out.replace(PHONE_CANDIDATE_RE, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) return match;
    const hasPlus = match.trimStart().startsWith("+");
    const separators = (match.match(/[ ()-]/g) ?? []).length;
    const indianMobile = /^[6-9]\d{9}$/.test(digits);
    if (!hasPlus && separators < 2 && !indianMobile) return match;
    count += 1;
    return PII;
  });

  return { text: out, count };
}

/** The public contract from the brief: label + text in, redacted text out. */
export function redact(label: string, text: string): string {
  return redactWithCount(label, text).text;
}
