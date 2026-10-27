import { User, Category, File } from "../server/src/models.js";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { expandDemo } from "../server/src/demo-expansion.js";
import { demoExpansionTarget } from "../server/src/demo-target.js";
import { newDemoPasswords, writeLocalDemoGuide } from "./local-demo-guide.js";
dotenv.config({
  path: fileURLToPath(new URL("../server/.env", import.meta.url)),
  quiet: true,
});
try {
  const target = demoExpansionTarget(
    process.argv.slice(2),
    process.env.MONGODB_URI,
  );
  await mongoose.connect(process.env.MONGODB_URI, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 5000,
  });
  if (mongoose.connection.name !== target.database)
    throw Error("Connected database differs from confirmed demo target.");
  if (target.apply)
    await Promise.all([
      User.createIndexes(),
      Category.createIndexes(),
      File.createIndexes(),
    ]);
  const passwords = target.apply ? newDemoPasswords() : {};
  const report = await expandDemo({
    apply: target.apply,
    passwords,
    testOnlyContacts: true,
  });
  console.log(
    "Database:",
    target.database,
    target.apply ? "APPLY isolated demo" : "DRY RUN (no writes)",
  );
  console.table(report);
  if (target.apply) {
    const guide = await writeLocalDemoGuide(report, passwords, {
      database: target.database,
      testOnlyContacts: true,
    });
    if (guide)
      console.log(
        "New account credentials saved only in ignored local guide:",
        guide,
      );
  }
  console.log(
    "Existing accounts, passwords, approvals, profiles, bookings and disabled categories were preserved.",
  );
} catch (e) {
  console.error(
    e.name?.includes("Mongo") || e.name?.includes("Mongoose")
      ? "Demo database operation failed. No saved/hosted fallback is used."
      : e.message,
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
