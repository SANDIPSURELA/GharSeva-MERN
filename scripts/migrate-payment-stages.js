import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { migratePaymentIndexes } from "../server/src/payment-indexes.js";
import { paymentMigrationOptions } from "../server/src/payment-migration-target.js";

dotenv.config({
  path: fileURLToPath(new URL("../server/.env", import.meta.url)),
  quiet: true,
});
try {
  const options = paymentMigrationOptions(
    process.argv.slice(2),
    process.env.MONGODB_URI,
  );
  await mongoose.connect(process.env.MONGODB_URI, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10000,
  });
  if (mongoose.connection.name !== options.database)
    throw Error(
      "Connected database differs from the reviewed target. No changes made.",
    );
  const report = await migratePaymentIndexes(
    mongoose.connection.collection("payments"),
    options,
  );
  console.log(
    JSON.stringify({ ...report, database: mongoose.connection.name }, null, 2),
  );
} catch (e) {
  // Do not print driver errors containing a URI/credentials or private record values.
  console.error(
    e.name?.includes("Mongo") || e.name === "MongooseServerSelectionError"
      ? "Database connection failed. Check server-only configuration/network access. No successful migration is claimed."
      : e.message,
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
