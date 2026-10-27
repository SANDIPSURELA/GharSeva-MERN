import { newDemoPasswords, writeLocalDemoGuide } from "./local-demo-guide.js";
import { createIsolatedMongo, connectIsolatedMongo } from "./isolated-mongo.js";
import { expandDemo } from "../server/src/demo-expansion.js";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/src/app.js";

if (process.env.NODE_ENV === "production")
  throw Error("Classroom launcher is forbidden in production.");
process.env.NODE_ENV = "development";
process.env.GHARSEVA_DEMO = "true";
process.env.PAYMENTS_MODE = "demo";
process.env.AUTH_DELIVERY_MODE = "test";
process.env.JWT_SECRET = randomBytes(48).toString("hex");
process.env.CLIENT_ORIGIN = "http://localhost:5173";
let db,
  server,
  child,
  stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  child?.kill("SIGTERM");
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await db?.stop();
};
process.on("SIGINT", () =>
  stop().catch(() => {
    process.exitCode = 1;
  }),
);
process.on("SIGTERM", () =>
  stop().catch(() => {
    process.exitCode = 1;
  }),
);
try {
  db = await createIsolatedMongo({ label: "demo" });
  await connectIsolatedMongo(db);
  // This connection came from our new memory server, never server/.env.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const passwords = newDemoPasswords();
  const report = await expandDemo({
    apply: true,
    passwords,
    testOnlyContacts: true,
  });
  const guide = await writeLocalDemoGuide(report, passwords, {
    database: mongoose.connection.name,
    testOnlyContacts: true,
  });
  console.log(
    "TEMPORARY CLASSROOM ONLY. Fictional profiles; displayed OTPs and simulated payments. No real email or money.",
  );
  console.log("Private local accounts guide:", guide);
  server = createApp().listen(5000, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/vite/bin/vite.js", import.meta.url),
      ),
      "--host",
      "127.0.0.1",
    ],
    {
      cwd: fileURLToPath(new URL("../client/", import.meta.url)),
      stdio: "inherit",
    },
  );
  child.on("exit", () => {
    if (!stopping)
      stop().catch(() => {
        process.exitCode = 1;
      });
  });
  child.on("error", () => {
    process.exitCode = 1;
    stop();
  });
  console.log(
    "Isolated demo: http://localhost:5173. Stop with Ctrl+C; temporary database is discarded.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
  await stop();
}
