// Test-only fixtures: normal business regressions use real revocable sessions.
// Security tests use raw requests instead and assert missing-context rejection.
import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { AuthSession } from "../src/models.js";
import { demoDelivery } from "../src/identity-services.js";
import { setSession } from "../src/auth.js";
export const fixtureContext = (u) => "fixture-context-" + String(u._id);
export function memoryCookie(u, rows) {
  const token = jwt.sign(
    {
      sub: String(u._id),
      ver: u.sessionVersion ?? 0,
      sid: randomBytes(32).toString("hex"),
    },
    process.env.JWT_SECRET,
    { expiresIn: "8h", algorithm: "HS256" },
  );
  rows.push({
    _id: String(new mongoose.Types.ObjectId()),
    mode: demoDelivery() ? "demo" : "live",
    tokenHash: createHash("sha256").update(token).digest("hex"),
    context: fixtureContext(u),
    user: u._id,
    role: u.role,
    sessionVersion: u.sessionVersion ?? 0,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 8 * 3600000),
    idleExpiresAt: new Date(Date.now() + 15 * 60000),
    reauthenticatedAt: new Date(),
    reauthRevision: u.loginRevision ?? 0,
    revokedAt: null,
  });
  return "gharseva_session=" + token;
}
export async function fixtureCookie(u) {
  let cookie;
  await setSession(
    {
      set() {},
      cookie(n, v) {
        cookie = n + "=" + v;
      },
    },
    u,
    { reauthenticated: true },
  );
  return cookie;
}
export async function sessionFetch(url, options = {}) {
  const headers = new Headers(options.headers),
    token = (headers.get("cookie") || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("gharseva_session="))
      ?.slice(17);
  if (token && !headers.has("X-GharSeva-Context")) {
    const s = await AuthSession.findOne({
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    if (s) headers.set("X-GharSeva-Context", s.context);
  }
  return fetch(url, { ...options, headers });
}
