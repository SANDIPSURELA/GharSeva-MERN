import { inspectCatalog } from "./catalog-reconciliation.js";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { User, Category, File } from "./models.js";
import { demoImageFor } from "../../seed-data/demo-work-images.js";
import { canonicalCatalog } from "./canonical-catalog.js";
import { demoDefinitions } from "../../scripts/local-demo-guide.js";
import { password } from "./domain.js";
import { demoDelivery } from "./identity-services.js";

export async function expandDemo({
  apply = false,
  passwords = {},
  testOnlyContacts = false,
} = {}) {
  const definitions = demoDefinitions({ testOnlyContacts });
  if (apply && !demoDelivery())
    throw Error(
      "Demo expansion apply requires explicit non-production classroom mode.",
    );
  if (process.env.NODE_ENV === "production")
    throw Error("Demo expansion is forbidden in production.");
  const catalog = inspectCatalog(await Category.find({}).lean());
  if (apply && catalog.conflicts.length)
    throw Error(
      "Catalog conflicts require review before demo apply. No changes made.",
    );
  // Validate every required creation password before the first write.
  if (apply)
    for (const role of ["customer", "provider", "admin"]) {
      for (const p of definitions.filter((p) => p.role === role))
        if (
          !(await User.exists({
            $or: [
              { email: p.email },
              { mobile: p.mobile },
              role === "provider"
                ? { "profile.demoProviderId": p.id }
                : { demoAccountId: p.id },
            ],
          }))
        ) {
          const value =
            passwords[role] ||
            process.env["SEED_" + role.toUpperCase() + "_PASSWORD"];
          if (!value)
            throw Error(
              "Set SEED_" +
                role.toUpperCase() +
                "_PASSWORD for new accounts. No demo changes applied.",
            );
          password(value);
          break;
        }
    }
  const report = [];
  for (const service of canonicalCatalog) {
    if (await Category.exists({ slug: service.slug })) continue;
    report.push({ action: "ADD CATEGORY", id: service.slug });
    if (apply)
      await Category.updateOne(
        { slug: service.slug },
        {
          $setOnInsert: service,
        },
        { upsert: true },
      );
  }
  const hashes = {};
  for (const p of definitions) {
    const matches = await User.find({
      $or: [
        { email: p.email },
        { mobile: p.mobile },
        p.role === "provider"
          ? { "profile.demoProviderId": p.id }
          : { demoAccountId: p.id },
      ],
    }).select("name email mobile role demoAccountId profile");
    if (matches.length) {
      const u = matches[0];
      const known =
        matches.length === 1 &&
        u.name === p.name &&
        u.email === p.email &&
        u.mobile === p.mobile &&
        u.role === p.role &&
        (p.role !== "provider" ||
          (u.profile?.category === p.serviceId &&
            (u.profile.demoProviderId === p.id ||
              u.profile.bio ===
                p.bio +
                  " Sample professional profile for the college demonstration.")));
      report.push({
        action: known ? "KEEP (no fields changed)" : "CONFLICT (preserved)",
        id: p.id,
        email: p.email,
      });
      continue;
    }
    const entry = {
      action: "ADD ACCOUNT",
      id: p.id,
      email: p.email,
      city: p.city,
      category: p.serviceId || p.role,
    };
    report.push(entry);
    if (!apply) continue;
    if (!hashes[p.role]) {
      const value =
        passwords[p.role] ||
        process.env["SEED_" + p.role.toUpperCase() + "_PASSWORD"];
      if (!value)
        throw Error(
          "Set SEED_" +
            p.role.toUpperCase() +
            "_PASSWORD for new accounts. Existing passwords are never reset.",
        );
      hashes[p.role] = await bcrypt.hash(password(value), 12);
    }
    const u = new User({
      name: p.name,
      email: p.email,
      mobile: p.mobile,
      role: p.role,
      city: p.city,
      passwordHash: hashes[p.role],
      ...(p.role !== "provider" ? { demoAccountId: p.id } : {}),
      ...(demoDelivery()
        ? {
            verification: {
              email: { at: new Date(), mode: "demo" },
              mobile: { at: new Date(), mode: "demo" },
            },
          }
        : {}),
      ...(p.role === "provider"
        ? {
            profile: {
              demoProviderId: p.id,
              category: p.serviceId,
              categories: [p.serviceId],
              city: p.city,
              area: p.location,
              bio:
                p.bio +
                " Sample professional profile for the college demonstration.",
              experience: p.experience,
              price: p.price,
              status: "APPROVED",
              available: true,
              skills: p.skills,
              days: [0, 1, 2, 3, 4, 5, 6],
              slots: ["09:00", "11:00", "14:00", "16:00"],
              portfolio: demoImageFor(p.id) ? [demoImageFor(p.id).src] : [],
              photo: "",
            },
          }
        : {}),
    });
    // Only new fictional accounts receive a clearly fictional private supporting PDF.
    if (p.role === "provider") {
      const file = new File({
        owner: u._id,
        kind: "document",
        name: "DEMO-DOCUMENT.pdf",
        mime: "application/pdf",
        data: readFileSync(
          new URL("../fixtures/demo-document.pdf", import.meta.url),
        ),
      });
      u.profile.documents = [file._id];
      try {
        await u.save();
        await file.save();
        entry.created = true;
      } catch (e) {
        if (e.code !== 11000) throw e;
        report.push({ action: "CONCURRENT ACCOUNT PRESERVED", id: p.id });
      }
    } else {
      try {
        await u.save();
        entry.created = true;
      } catch (e) {
        if (e.code !== 11000) throw e;
        report.push({ action: "CONCURRENT ACCOUNT PRESERVED", id: p.id });
      }
    }
  }
  return report;
}
