import { canonicalCatalog } from "./canonical-catalog.js";
import bcrypt from "bcryptjs";
import { User, Category, Settings } from "./models.js";
import { text, email, mobile, password } from "./domain.js";

// Operator-only function. No HTTP route invokes it and existing accounts are never promoted.
export async function bootstrapProduction(input) {
  const account = {
    name: text(input.name, "Admin name", 3, 80),
    email: email(input.email),
    mobile: mobile(input.mobile),
    city: text(input.city || "Ahmedabad", "City", 2, 70),
  };
  password(input.password);
  if (input.password.length < 12)
    throw new Error("Use an admin password of at least 12 characters.");
  await Promise.all([User.init(), Category.init(), Settings.init()]);
  if (await User.exists({ role: "admin" }))
    throw new Error(
      "An admin already exists. Bootstrap refused; use the existing admin account.",
    );
  if (
    await User.exists({
      $or: [{ email: account.email }, { mobile: account.mobile }],
    })
  )
    throw new Error(
      "This email or mobile already belongs to an account. No role was changed.",
    );
  // Do not claim contact verification merely because an operator created this account.
  const admin = await User.create({
    ...account,
    role: "admin",
    passwordHash: await bcrypt.hash(input.password, 12),
  });
  for (const category of canonicalCatalog)
    await Category.updateOne(
      { slug: category.slug },
      { $setOnInsert: category },
      { upsert: true },
    );
  await Settings.updateOne(
    { key: "main" },
    { $setOnInsert: { key: "main" } },
    { upsert: true },
  );
  return { adminId: String(admin._id) };
}
