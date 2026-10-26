export function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
export function text(value, label, min = 1, max = 200) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    fail(400, `${label} must contain ${min}–${max} characters.`);
  return value.trim();
}
export function email(value) {
  const v = text(value, "Email", 5, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    fail(400, "Enter a valid email address.");
  return v;
}
export function mobile(value) {
  const v = String(value ?? "").replace(/\D/g, "");
  if (!/^[6-9]\d{9}$/.test(v))
    fail(400, "Enter a valid Indian 10-digit mobile number.");
  return v;
}
export function password(value) {
  if (
    typeof value !== "string" ||
    value.length > 72 ||
    Buffer.byteLength(value, "utf8") > 72 ||
    !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(value)
  )
    fail(
      400,
      "Use a password of 8–72 characters with uppercase, lowercase and a number.",
    );
  return value;
}
export function number(value, label, min, max) {
  if (value === "" || value == null) fail(400, `Enter ${label.toLowerCase()}.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max)
    fail(400, `${label} must be between ${min} and ${max}.`);
  return n;
}
export function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function validateSchedule(date, time, profile, now = new Date()) {
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    fail(400, "Choose a valid date and time.");
  const at = new Date(`${date}T${time}:00+05:30`);
  if (Number.isNaN(at.getTime()) || indiaDate(at) !== date || at <= now)
    fail(400, "Choose a future appointment.");
  if (at > new Date(now.getTime() + 90 * 86400000))
    fail(400, "Book within the next 90 days.");
  const weekday = new Date(`${date}T12:00:00+05:30`).getUTCDay();
  if (
    !profile.available ||
    !profile.days.includes(weekday) ||
    !profile.slots.includes(time)
  )
    fail(409, "This provider is unavailable at the selected time.");
  return true;
}
export const transitions = {
  PENDING: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["ON_THE_WAY"],
  ON_THE_WAY: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
};
