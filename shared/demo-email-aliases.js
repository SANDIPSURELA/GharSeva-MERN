import { email } from "../server/src/domain.js";

// Generate distinct addresses for an owner-controlled Gmail inbox. This does not
// prove delivery and does not verify a contact or create an account.
export function gmailDemoAliases(base, count = 20) {
  const normalized = email(base);
  if (
    !/^[a-z0-9](?:[a-z0-9.]{4,28}[a-z0-9])?@gmail\.com$/.test(normalized) ||
    normalized.includes("..") ||
    normalized.split("@")[0].includes("+")
  )
    throw new Error("Enter a plain Gmail base address without a plus tag.");
  if (!Number.isInteger(count) || count < 1 || count > 20)
    throw new Error("Choose between 1 and 20 aliases.");
  const local = normalized.split("@")[0];
  const result = Array.from({ length: count }, (_, index) =>
    email(
      local + "+gharseva" + String(index + 1).padStart(2, "0") + "@gmail.com",
    ),
  );
  if (new Set(result).size !== count) throw new Error("Alias collision.");
  return result;
}

export function yopmailDemoAddresses(prefix, providerIds) {
  if (typeof prefix !== "string" || !/^[a-z0-9]{4,24}$/.test(prefix))
    throw Error("Use a 4-24 character lowercase letter/digit project prefix.");
  if (
    !Array.isArray(providerIds) ||
    providerIds.length !== 20 ||
    new Set(providerIds).size !== 20 ||
    providerIds.some(
      (id) => typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id),
    )
  )
    throw Error("Invalid stable demo provider identifiers.");
  const addresses = providerIds.map((id) =>
    email(prefix + "-" + id + "@yopmail.com"),
  );
  if (new Set(addresses).size !== 20) throw Error("Demo address collision.");
  return addresses;
}
export function yopmailInboxLink(address) {
  if (
    typeof address !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)+@yopmail\.com$/.test(address)
  )
    throw Error("Invalid YOPmail demo address.");
  return "https://yopmail.com/?" + encodeURIComponent(address.split("@")[0]);
}
