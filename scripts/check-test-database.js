import { createIsolatedMongo, connectIsolatedMongo } from "./isolated-mongo.js";
import mongoose from "mongoose";
let db;
try {
  db = await createIsolatedMongo();
  console.log("Isolated MongoDB process started in the workspace.");
  await connectIsolatedMongo(db);
  await mongoose.connection.db.command({ ping: 1 });
  console.log(
    "Isolated MongoDB connection/ping passed. No saved URI or database was used.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
  await db?.stop();
}
