import { canonicalCity } from "../../shared/cities.js";
import { fail } from "./domain.js";
export function requireCity(value) {
  const city = canonicalCity(value);
  if (!city) fail(400, "Choose a supported service city.");
  return city;
}
export function cityFilter(value) {
  const city = requireCity(value);
  const names = city === "Ahmedabad" ? "(?:Ahmedabad|Ahemdabad)" : city;
  return {
    "profile.city": { $regex: "^\\s*" + names + "\\s*$", $options: "i" },
  };
}
export function bookingCity(user, input, provider) {
  const city = requireCity(input.city || user.city);
  if (canonicalCity(provider.profile.city) !== city)
    fail(
      409,
      "This professional does not serve the selected city. Change city or choose another professional.",
    );
  return city;
}
