import originalProviders from "../seed-data/providers.js";
export const supportedCities = [
  ...new Set(originalProviders.map((p) => p.city)),
].sort();
export function canonicalCity(value) {
  if (typeof value !== "string") return "";
  let key = value.trim().replace(/\s+/g, " ").toLowerCase();
  if (key === "ahemdabad") key = "ahmedabad";
  return supportedCities.find((city) => city.toLowerCase() === key) || "";
}
export function citySelection(state, city) {
  return { ...state, city, area: "", providerId: "", time: "" };
}
