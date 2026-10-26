import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { expandDemo } from "../server/src/demo-expansion.js";
dotenv.config({
  path: fileURLToPath(new URL("../server/.env", import.meta.url)),
  quiet: true,
});
const args = process.argv.slice(2);
if (
  args.some((a) => !["--apply", "--dry-run"].includes(a)) ||
  (args.includes("--apply") && args.includes("--dry-run"))
)
  throw Error("Use --dry-run (default) or --apply.");
if (process.env.NODE_ENV === "production")
  throw Error("Demo expansion is forbidden in production.");
if (!process.env.MONGODB_URI)
  throw Error("Configure the existing MONGODB_URI in server/.env.");
try {
  await mongoose.connect(process.env.MONGODB_URI, {
    autoIndex: false,
    serverSelectionTimeoutMS: 10000,
  });
  console.log(
    "Database:",
    mongoose.connection.name,
    args.includes("--apply") ? "APPLY" : "DRY RUN (no writes)",
  );
  console.table(await expandDemo({ apply: args.includes("--apply") }));
  console.log(
    "Existing accounts: no fields changed. Credentials, cities, photos, applications, reviews and bookings preserved. ADD ACCOUNT uses SEED_*_PASSWORD only for new accounts.",
  );
} finally {
  await mongoose.disconnect();
}
