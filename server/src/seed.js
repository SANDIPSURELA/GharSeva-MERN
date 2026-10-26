import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { User, Category, Booking, Review, Settings, File } from "./models.js";
import { demoProviders, demoPeople } from "../../seed-data/demo-accounts.js";
import { demoWorkImages } from "../../seed-data/demo-work-images.js";
import originalServices from "../../seed-data/services.js";
import { password } from "./domain.js";
import { demoDelivery } from "./identity-services.js";
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
export async function seed() {
  const existing = await User.countDocuments();
  if (existing) {
    console.log(
      "Seed skipped: accounts already exist. No existing data was deleted.",
    );
    return;
  }
  const passwords = {
    customer: process.env.SEED_CUSTOMER_PASSWORD,
    provider: process.env.SEED_PROVIDER_PASSWORD,
    admin: process.env.SEED_ADMIN_PASSWORD,
  };
  for (const [role, p] of Object.entries(passwords)) {
    if (!p)
      throw new Error(
        `Set SEED_${role.toUpperCase()}_PASSWORD before seeding.`,
      );
    password(p);
  }
  const hashes = Object.fromEntries(
    await Promise.all(
      Object.entries(passwords).map(async ([role, p]) => [
        role,
        await bcrypt.hash(p, 12),
      ]),
    ),
  );
  const images = {
    plumbing: "plumbing",
    electrical: "electrical",
    cleaning: "cleaning",
    cooking: "cooking",
    carpentry: "carpentry",
    masonry: "masonry",
    painting: "painting",
    labour: "masonry",
    appliance: "electrical",
    gardening: "gardening",
  };
  for (const s of originalServices)
    await Category.updateOne(
      { slug: s.id },
      {
        $setOnInsert: {
          slug: s.id,
          name: s.name,
          description: s.description,
          price: s.startingPrice,
          image: `/images/${images[s.id]}.jpg`,
          enabled: true,
        },
      },
      { upsert: true },
    );
  const personFields = (role) => {
    const { id, ...fields } = demoPeople.find((p) => p.role === role);
    return { ...fields, demoAccountId: id };
  };
  const customer = await User.create({
    ...personFields("customer"),
    passwordHash: hashes.customer,
    ...(demoDelivery()
      ? {
          verification: {
            email: { at: new Date(), mode: "demo" },
            mobile: { at: new Date(), mode: "demo" },
          },
        }
      : {}),
  });
  await User.create({
    ...personFields("admin"),
    passwordHash: hashes.admin,
  });
  const providers = [];
  const supportingDocument = readFileSync(
    new URL("../fixtures/demo-document.pdf", import.meta.url),
  );
  for (const p of demoProviders) {
    const u = await User.create({
      name: p.name,
      email: p.email,
      mobile: p.mobile,
      passwordHash: hashes.provider,
      role: "provider",
      ...(demoDelivery()
        ? {
            verification: {
              email: { at: new Date(), mode: "demo" },
              mobile: { at: new Date(), mode: "demo" },
            },
          }
        : {}),
      city: p.city,
      profile: {
        category: p.serviceId,
        city: p.city,
        area: p.location,
        bio:
          p.bio + " Sample professional profile for the college demonstration.",
        experience: p.experience,
        price: p.price,
        status: "APPROVED",
        photo: "",
        demoProviderId: p.id,
        portfolio: demoWorkImages[p.id] ? [demoWorkImages[p.id].src] : [],
        skills: p.skills,
        available: true,
        days: [0, 1, 2, 3, 4, 5, 6],
        slots: ["09:00", "11:00", "14:00", "16:00"],
      },
    });
    const file = await File.create({
      owner: u._id,
      kind: "document",
      name: "DEMO-DOCUMENT.pdf",
      mime: "application/pdf",
      data: supportingDocument,
    });
    u.profile.documents = [file._id];
    await u.save();
    providers.push(u);
  }
  // One completed sample booking demonstrates reviews. No fake future bookings.
  const past = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const b = await Booking.create({
    customer: customer._id,
    provider: providers[0]._id,
    category: "plumbing",
    service: "Plumbing",
    date: past,
    time: "09:00",
    address: "Sample home address, Ahmedabad",
    notes: "Seeded demonstration record",
    price: providers[0].profile.price,
    status: "COMPLETED",
    active: false,
    timeline: [
      "PENDING",
      "ACCEPTED",
      "ON_THE_WAY",
      "IN_PROGRESS",
      "COMPLETED",
    ].map((status) => ({ status })),
  });
  await Review.create({
    booking: b._id,
    customer: customer._id,
    provider: providers[0]._id,
    rating: 5,
    feedback: "Sample review: punctual service and clear communication.",
  });
  await Settings.updateOne(
    { key: "main" },
    { $setOnInsert: { key: "main" } },
    { upsert: true },
  );
  console.log(
    "Fictional demo data created. Passwords use your SEED_* settings. List every account with npm.cmd run demo:accounts.",
  );
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (!process.env.MONGODB_URI)
      throw new Error("Configure MONGODB_URI in server/.env first.");
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    await seed();
    await mongoose.disconnect();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
