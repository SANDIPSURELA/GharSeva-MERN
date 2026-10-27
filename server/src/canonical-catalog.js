import services from "../../seed-data/services.js";
// One source for initialization; existing records are never overwritten.
export const canonicalCatalog = services.map((service) => ({
  slug: service.id,
  name: service.name,
  description: service.description,
  price: service.startingPrice,
  enabled: true,
  image:
    "/images/" +
    ({ appliance: "electrical", labour: "masonry" }[service.id] || service.id) +
    ".jpg",
}));
