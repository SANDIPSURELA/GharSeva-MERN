// This is a clerical comparison aid. It never changes an applicant's eligibility.
export const nameTokens = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/['-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
const sameTokens = (left, right) =>
  left.length === right.length &&
  [...left].sort().join(" ") === [...right].sort().join(" ");
export function compareIdentityNames(declared, extracted, confidence = 100) {
  const wanted = nameTokens(declared),
    found = nameTokens(extracted);
  const remainder = [...found],
    matched = [],
    missing = [];
  for (const token of wanted) {
    const i = remainder.indexOf(token);
    if (i < 0) missing.push(token);
    else {
      matched.push(token);
      remainder.splice(i, 1);
    }
  }
  let status, reasons;
  if (!found.length) {
    status = "UNREADABLE";
    reasons = [
      "The primary name could not be read reliably. Ask for a clearer front image or review it manually.",
    ];
  } else if (
    wanted.length < 2 ||
    found.some((t) => t.length === 1) ||
    wanted.some((t) => t.length === 1)
  ) {
    status = "REVIEW";
    reasons = [
      "Initials or a single-part name need a person to review the original evidence.",
    ];
  } else if (!missing.length) {
    status = "CONSISTENT";
    reasons = [
      sameTokens(wanted, found)
        ? "The same name components appear; order, case and punctuation are ignored."
        : "All entered name components appear. Additional document name components need administrator confirmation.",
    ];
  } else {
    status = matched.length ? "REVIEW" : "DISCREPANCY";
    reasons = [
      "Some entered name components are not present exactly. Check spelling, initials, transliteration and OCR errors before making a decision.",
    ];
  }
  if (found.length && confidence < 70) {
    status = "REVIEW";
    reasons.unshift("OCR readability is low. The extracted name may be wrong.");
  }
  return { status, reasons, matched, missing, extra: remainder };
}
const cleanName = (s) =>
  String(s || "")
    .replace(/\s+/g, " ")
    .trim();
const plausible = (s) =>
  /^[\p{L} .'-]{3,100}$/u.test(s) &&
  s.split(/\s+/).length <= 7 &&
  !/\b(government|india|unique|authority|identification|aadhaar|aadhar|male|female|gender|address|birth|dob|year|resident|father|mother|husband|wife|signature|enrol|issue|valid|sample|specimen|fictional|classroom|document|identity|card|front|back|name|verification|test)\b/i.test(
    s,
  );
export function extractPrimaryName(ocrText, declared) {
  const lines = String(ocrText || "")
    .split(/\r?\n/)
    .map(cleanName)
    .filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const explicit = lines[i].match(/^(?:full\s*)?name\s*[:\-]\s*(.*)$/i);
    if (explicit) {
      const candidate = cleanName(explicit[1] || lines[i + 1]);
      if (plausible(candidate)) return candidate;
    }
  }
  const candidates = lines.filter(
    (line) => !/\b[csdw]\s*[/:]/i.test(line) && plausible(line),
  );
  // Only a single convincing line is selected. Never select a relative's name from the back image.
  const consistent = candidates.filter(
    (s) => compareIdentityNames(declared, s).status === "CONSISTENT",
  );
  if (consistent.length === 1) return consistent[0];
  return candidates.length === 1 ? candidates[0] : "";
}
export const containsFullIdentityNumber = (value) =>
  /(?<!\d)\d{4}[ \t-]?\d{4}[ \t-]?\d{4}(?!\d)/.test(String(value));
