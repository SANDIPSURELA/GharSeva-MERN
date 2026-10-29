import { ahmedabadProviders } from "../../seed-data/demo-accounts.js";
import {
  gmailDemoAliases,
  yopmailDemoAddresses,
} from "../../shared/demo-email-aliases.js";
import { demoImageFor } from "../../seed-data/demo-work-images.js";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { password } from "./domain.js";

export const demoDefinitions = ahmedabadProviders;
export const stableId = (database, id) =>
  createHash("sha256")
    .update("gharseva-pending-demo-v1:" + database + ":" + id)
    .digest("hex")
    .slice(0, 24);

export async function planDemoProviders({
  database,
  baseEmail,
  emailMode = "gmail",
  yopmailPrefix,
  categories,
  findMatches,
}) {
  const addresses =
    emailMode === "gmail"
      ? gmailDemoAliases(baseEmail)
      : emailMode === "yopmail"
        ? yopmailDemoAddresses(
            yopmailPrefix,
            demoDefinitions.map((p) => p.id),
          )
        : (() => {
            throw Error("Choose gmail or yopmail.");
          })();
  const rows = [];
  for (let i = 0; i < demoDefinitions.length; i++) {
    const p = demoDefinitions[i],
      id = stableId(database, p.id),
      address = addresses[i];
    const matches = await findMatches({
      id,
      email: address,
      mobile: p.mobile,
      marker: p.id,
    });
    const cat = categories.find((c) => c.slug === p.serviceId);
    let action = "insert";
    if (matches.length) {
      const known =
        matches.length === 1 &&
        String(matches[0]._id) === id &&
        matches[0].demoAccountId === "owner-demo:" + p.id &&
        matches[0].email === address &&
        matches[0].role === "provider";
      action = known ? "skip" : "conflict";
    } else if (!cat || cat.enabled !== true) action = "category_unavailable";
    rows.push({
      number: i + 1,
      definition: p,
      id,
      email: address,
      action,
      categoryAvailable: !!cat && cat.enabled === true,
    });
  }
  return rows;
}
export function pendingMatchesPlan(pending, database, rows, mode) {
  return (
    pending?.database === database &&
    (!pending.emailMode || pending.emailMode === mode) &&
    rows.some(
      (row) =>
        row.id === pending.id &&
        row.email === pending.email &&
        row.definition.id === pending.marker,
    )
  );
}
export function newUniquePassword() {
  return password("Gs9!" + randomBytes(24).toString("base64url"));
}
export async function makePendingProvider(row, pass) {
  const p = row.definition;
  return {
    _id: row.id,
    demoAccountId: "owner-demo:" + p.id,
    name: "DEMO / Fictional professional: " + p.name,
    email: row.email,
    mobile: p.mobile,
    passwordHash: await bcrypt.hash(password(pass), 12),
    role: "provider",
    status: "ACTIVE",
    city: "Ahmedabad",
    profile: {
      demoProviderId: p.id,
      category: p.serviceId,
      categories: [p.serviceId],
      city: "Ahmedabad",
      area: p.location,
      bio: "DEMO / Fictional professional. Example profile for demonstration only.",
      experience: 0,
      price: p.price,
      status: "PENDING",
      identityRequired: true,
      available: true,
      documents: [],
      skills: [],
      days: [0, 1, 2, 3, 4, 5, 6],
      slots: ["09:00", "11:00", "14:00", "16:00"],
      portfolio: demoImageFor(p.id) ? [demoImageFor(p.id).src] : [],
      photo: "",
    },
  };
}
export function summary(rows) {
  return Object.fromEntries(
    ["insert", "skip", "conflict", "category_unavailable"].map((action) => [
      action,
      rows.filter((row) => row.action === action).length,
    ]),
  );
}
