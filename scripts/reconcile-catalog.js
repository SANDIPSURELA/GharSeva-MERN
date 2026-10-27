import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { paymentMigrationOptions as targetOptions } from "../server/src/payment-migration-target.js";
import {
  reconcileCatalog,
  catalogDiagnostics,
} from "../server/src/catalog-reconciliation.js";
dotenv.config({
  path: fileURLToPath(new URL("../server/.env", import.meta.url)),
  quiet: true,
});
try {
  const target = targetOptions(process.argv.slice(2), process.env.MONGODB_URI);
  await mongoose.connect(process.env.MONGODB_URI, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10000,
  });
  if (mongoose.connection.name !== target.database)
    throw Error(
      "Connected database differs from reviewed target. No changes made.",
    );
  const db = mongoose.connection.db;
  console.log(
    JSON.stringify(
      {
        diagnosis: await catalogDiagnostics(db),
        reconciliation: await reconcileCatalog(
          db.collection("categories"),
          target,
        ),
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(
    e.name?.includes("Mongo") || e.name?.includes("Mongoose")
      ? "Database operation failed. Check private configuration/access. No successful reconciliation is claimed."
      : e.message,
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
