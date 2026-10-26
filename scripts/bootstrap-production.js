import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { bootstrapProduction } from "../server/src/bootstrap.js";
dotenv.config({
  path: fileURLToPath(new URL("../server/.env", import.meta.url)),
});
try {
  if (!process.env.MONGODB_URI)
    throw new Error("Configure MONGODB_URI before bootstrap.");
  if (process.env.BOOTSTRAP_CONFIRM !== "CREATE_FIRST_ADMIN")
    throw new Error(
      "Set BOOTSTRAP_CONFIRM=CREATE_FIRST_ADMIN for this operator-only action.",
    );
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  await bootstrapProduction({
    name: process.env.BOOTSTRAP_ADMIN_NAME,
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    mobile: process.env.BOOTSTRAP_ADMIN_MOBILE,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    city: process.env.BOOTSTRAP_ADMIN_CITY,
  });
  console.log(
    "Initial admin and missing service categories created. Existing accounts, categories and bookings were preserved. Remove BOOTSTRAP_* secrets now.",
  );
} catch (e) {
  // Database/driver errors can contain deployment details. Do not log full objects.
  console.error(
    e.name === "Error" && !e.code
      ? e.message
      : "Bootstrap failed. Check database access and account uniqueness; no existing account was promoted or deleted.",
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
