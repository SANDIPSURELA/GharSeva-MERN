import { validateSchedule } from "./domain.js";
import { indiaDate } from "./assistant-conversation.js";
export function matchProviders(
  people,
  category,
  prefs,
  bookings,
  { bookingEnabled = true, now = new Date() } = {},
) {
  if (!bookingEnabled) return [];
  const date = prefs.date || indiaDate(1, now);
  const ranked = people
    .filter(
      (p) =>
        (p.categories || [p.category]).includes(category.slug) &&
        p.available &&
        (!prefs.city || p.city.toLowerCase() === prefs.city.toLowerCase()) &&
        (!prefs.area ||
          (p.area || "").toLowerCase() === prefs.area.toLowerCase()) &&
        (!prefs.budget || p.price <= prefs.budget),
    )
    .map((p) => {
      const slots = (p.slots || []).filter((time) => {
        try {
          validateSchedule(date, time, p, now);
          return !bookings.some(
            (b) =>
              String(b.provider) === String(p._id) &&
              b.date === date &&
              b.time === time &&
              b.active !== false,
          );
        } catch {
          return false;
        }
      });
      return {
        ...p,
        availability: { date, slots },
        reasons: [
          "Offers " + category.name,
          "Serves " + [p.area, p.city].filter(Boolean).join(", "),
          ...(prefs.budget ? ["Starting estimate within your budget"] : []),
          "Available " +
            date +
            " at " +
            slots.join(", ") +
            " IST (rechecked before booking)",
        ],
      };
    })
    .filter(
      (p) =>
        p.availability.slots.length &&
        (!prefs.time || p.availability.slots.includes(prefs.time)),
    )
    .sort((a, b) =>
      prefs.sort === "price"
        ? a.price - b.price ||
          b.rating - a.rating ||
          a.name.localeCompare(b.name)
        : b.rating - a.rating ||
          b.reviews - a.reviews ||
          a.price - b.price ||
          a.name.localeCompare(b.name),
    );
  // A still-eligible explicit choice is not lost when ratings reorder the list.
  const chosen = ranked.find((p) => String(p._id) === prefs.providerId);
  return (
    chosen ? [chosen, ...ranked.filter((p) => p !== chosen)] : ranked
  ).slice(0, 3);
}
