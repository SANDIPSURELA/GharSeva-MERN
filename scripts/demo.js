import { printDemoAccounts, temporaryPasswords } from "./demo-account-guide.js";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/src/app.js";
import { seed } from "../server/src/seed.js";
import { Booking } from "../server/src/models.js";
process.env.NODE_ENV = "development";
process.env.GHARSEVA_DEMO = "true";
process.env.PAYMENTS_MODE = "demo";
process.env.AUTH_DELIVERY_MODE = "test";
process.env.JWT_SECRET = randomBytes(48).toString("hex");
process.env.CLIENT_ORIGIN = "http://localhost:5173";
process.env.SEED_CUSTOMER_PASSWORD = temporaryPasswords.customer;
process.env.SEED_PROVIDER_PASSWORD = temporaryPasswords.provider;
process.env.SEED_ADMIN_PASSWORD = temporaryPasswords.admin;
const db = await MongoMemoryServer.create({
  binary: { version: "7.0.24" },
  instance: {
    args: [
      ...(process.platform === "win32" ? [] : ["--nounixsocket"]),
      "--setParameter",
      "diagnosticDataCollectionEnabled=false",
    ],
  },
});
await mongoose.connect(db.getUri());
await Booking.init();
await seed();
printDemoAccounts();
const server = createApp().listen(5000, () =>
  console.log(
    "TEMPORARY DEMO: http://localhost:5173 — records reset when stopped. Login OTPs appear only in explicit classroom mode.",
  ),
);
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
    "--host",
    "127.0.0.1",
  ],
  {
    cwd: fileURLToPath(new URL("../client/", import.meta.url)),
    stdio: "inherit",
  },
);
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  child.kill("SIGTERM");
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await db.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", () => {
  if (!stopping) stop();
});
