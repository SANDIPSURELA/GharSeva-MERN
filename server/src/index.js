import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { validateEnvironment } from "./deployment.js";
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
const report = validateEnvironment();
for (const warning of report.warnings) console.warn(warning);
const { createApp } = await import("./app.js");
await mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
await import("./models.js");
// Build declared indexes without dropping or rewriting existing indexes/data.
await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
const app = createApp();
const server = app.listen(process.env.PORT || 5000, "0.0.0.0", () =>
  console.log(`GharSeva listening on port ${process.env.PORT || 5000}`),
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    app.locals.draining = true;
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 25000);
    deadline.unref();
    server.close(async () => {
      try {
        await mongoose.disconnect();
        clearTimeout(deadline);
        process.exit(0);
      } catch {
        process.exit(1);
      }
    });
  });
