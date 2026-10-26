import bcrypt from "bcryptjs";
import { User, Category, Settings } from "./models.js";
import { text, email, mobile, password } from "./domain.js";
import services from "../../seed-data/services.js";

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
  const images = { labour: "masonry", appliance: "electrical" };
  for (const service of services)
    await Category.updateOne(
      { slug: service.id },
      {
        $setOnInsert: {
          slug: service.id,
          name: service.name,
          description: service.description,
          price: service.startingPrice,
          image: `/images/${images[service.id] || service.id}.jpg`,
          enabled: true,
        },
      },
      { upsert: true },
    );
  await Settings.updateOne(
    { key: "main" },
    { $setOnInsert: { key: "main" } },
    { upsert: true },
  );
  return { adminId: String(admin._id) };
}
