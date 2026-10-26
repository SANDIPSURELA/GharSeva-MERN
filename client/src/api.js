import { SessionClient } from "../../shared/session-client.js";
export const authEvents = new EventTarget();
export const sessionClient = new SessionClient(
  (...args) => fetch(...args),
  (type, detail) => authEvents.dispatchEvent(new CustomEvent(type, { detail })),
);
export const api = (path, options) => sessionClient.request(path, options);
export const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
export const label = (s) =>
  String(s || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (x) => x.toUpperCase());
export const indiaToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const prettyDate = (d) =>
  new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
export const indiaDateAfter = (days) => {
  const noon = new Date(`${indiaToday()}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(noon.getTime() + days * 86400000));
};
