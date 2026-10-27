import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL("../.test-tmp/mongo/", import.meta.url));
export const isolatedConnectOptions = {
  serverSelectionTimeoutMS: 4000,
  connectTimeoutMS: 3000,
};
export async function createIsolatedMongo({ label = "test" } = {}) {
  if (!["test", "demo"].includes(label))
    throw Error("Use a test or demo database label.");
  await mkdir(root, { recursive: true });
  const dbPath = await mkdtemp(path.join(root, label + "-"));
  let db;
  try {
    db = await MongoMemoryServer.create({
      binary: { version: "7.0.24" },
      instance: {
        dbPath,
        dbName: "gharseva_" + label + "_" + randomUUID().replaceAll("-", ""),
        ip: "127.0.0.1",
        args: [
          ...(process.platform === "win32" ? [] : ["--nounixsocket"]),
          "--wiredTigerCacheSizeGB",
          "0.25",
          "--setParameter",
          "diagnosticDataCollectionEnabled=false",
        ],
      },
    });
  } catch (e) {
    // No saved URI fallback. The library stops any partially created process.
    throw new Error(
      "Isolated MongoDB startup failed. See the local MongoDB diagnostic; no saved database was used.",
      { cause: e },
    );
  }
  const stop = db.stop.bind(db);
  db.stop = async (...args) => {
    await stop(...args);
    // Only the exact directory created by mkdtemp, underneath the fixed workspace root.
    const relative = path.relative(root, dbPath);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative))
      await rm(dbPath, { recursive: true, force: true });
  };
  return db;
}
export async function connectIsolatedMongo(db) {
  try {
    await mongoose.connect(db.getUri(), isolatedConnectOptions);
  } catch (e) {
    await mongoose.disconnect();
    throw new Error(
      "Isolated MongoDB connection failed" +
        (e.message.includes("EACCES")
          ? " (connect EACCES: loopback denied by environment)"
          : "") +
        ". No saved database was used.",
      { cause: e },
    );
  }
}
