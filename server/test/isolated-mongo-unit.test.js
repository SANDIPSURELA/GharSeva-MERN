import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { existsSync } from "node:fs";
import {
  createIsolatedMongo,
  connectIsolatedMongo,
  isolatedConnectOptions,
} from "../../scripts/isolated-mongo.js";
afterEach(() => mock.restoreAll());
test("isolated factory uses a fresh workspace path, loopback, platform-correct flags and stops its owned directory", async () => {
  let configuration,
    stopped = 0;
  mock.method(MongoMemoryServer, "create", async (input) => {
    configuration = input;
    return {
      stop: async () => {
        stopped++;
      },
      getUri: () => "mongodb://127.0.0.1:12345/gharseva_test_fixture",
    };
  });
  const db = await createIsolatedMongo();
  assert.match(configuration.instance.dbName, /^gharseva_test_[a-f0-9]+$/);
  assert.equal(configuration.instance.ip, "127.0.0.1");
  assert.ok(configuration.instance.dbPath.includes(".test-tmp"));
  assert.equal(
    configuration.instance.args.includes("--nounixsocket"),
    process.platform !== "win32",
  );
  assert.equal(
    configuration.instance.args.includes("--wiredTigerCacheSizeGB"),
    true,
  );
  assert.ok(existsSync(configuration.instance.dbPath));
  await db.stop();
  assert.equal(stopped, 1);
  assert.equal(existsSync(configuration.instance.dbPath), false);
  assert.equal(isolatedConnectOptions.serverSelectionTimeoutMS, 4000);
});
test("a loopback failure remains an error and disconnects without falling back to a configured saved URI", async () => {
  const saved = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb+srv://private-secret@host.example/saved";
  try {
    let attempts = [],
      disconnected = 0;
    mock.method(mongoose, "connect", async (...args) => {
      attempts.push(args);
      throw Error("connect EACCES 127.0.0.1");
    });
    mock.method(mongoose, "disconnect", async () => {
      disconnected++;
    });
    await assert.rejects(
      () =>
        connectIsolatedMongo({
          getUri: () => "mongodb://127.0.0.1:12345/gharseva_test_fixture",
        }),
      (e) =>
        e.message.includes("EACCES") && !e.message.includes("private-secret"),
    );
    assert.equal(attempts.length, 1);
    assert.equal(
      attempts[0][0],
      "mongodb://127.0.0.1:12345/gharseva_test_fixture",
    );
    assert.equal(disconnected, 1);
  } finally {
    if (saved === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = saved;
  }
});
