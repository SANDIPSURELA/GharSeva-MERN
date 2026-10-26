import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { User, AuthSession } from "./models.js";
import { fail } from "./domain.js";
import { demoDelivery } from "./identity-services.js";
export const cookieName = "gharseva_session";
const digest = (v) => createHash("sha256").update(v).digest("hex");
export const sessionCookie = (req) =>
  (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
const number = (name, fallback, min, max) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
export const sessionPolicy = () => ({
  absoluteMs: number("SESSION_ABSOLUTE_HOURS", 8, 1, 24) * 3600000,
  idleMs: number("ADMIN_IDLE_MINUTES", 15, 1, 240) * 60000,
  recentMs: number("ADMIN_REAUTH_MINUTES", 5, 1, 15) * 60000,
});
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
});
export function safeUser(user) {
  const v = user.toObject ? user.toObject() : { ...user };
  delete v.passwordHash;
  delete v.sessionVersion;
  delete v.loginRevision;
  return v;
}
export function sessionView(s) {
  return {
    context: s.context,
    role: s.role,
    warningSeconds: Math.min(90, sessionPolicy().idleMs / 4000),
    expiresAt: s.expiresAt,
    idleExpiresAt: s.idleExpiresAt,
    reauthExpiresAt: s.reauthenticatedAt
      ? new Date(
          new Date(s.reauthenticatedAt).getTime() + sessionPolicy().recentMs,
        )
      : null,
  };
}
export function sessionHeaders(res, s) {
  res.set?.("Cache-Control", "no-store, private");
  res.set?.("X-GharSeva-Context", s.context);
  res.set?.("X-GharSeva-Session", JSON.stringify(sessionView(s)));
}
export async function revokeSession(req) {
  const token = sessionCookie(req);
  if (token)
    await AuthSession.updateOne(
      { tokenHash: digest(token), revokedAt: null },
      { $set: { revokedAt: new Date(Date.now()) } },
    );
}
export async function setSession(
  res,
  user,
  { req, reauthenticated = false } = {},
) {
  const now = Date.now(),
    policy = sessionPolicy(),
    sid = randomBytes(32).toString("hex"),
    expiresAt = new Date(now + policy.absoluteMs);
  const token = jwt.sign(
    { sub: String(user._id), ver: user.sessionVersion ?? 0, sid },
    process.env.JWT_SECRET,
    { expiresIn: Math.floor(policy.absoluteMs / 1000), algorithm: "HS256" },
  );
  const s = await AuthSession.create({
    tokenHash: digest(token),
    mode: demoDelivery() ? "demo" : "live",
    context: randomBytes(24).toString("hex"),
    user: user._id,
    role: user.role,
    sessionVersion: user.sessionVersion ?? 0,
    issuedAt: new Date(now),
    revokedAt: null,
    expiresAt,
    lastActiveAt: new Date(now),
    ...(user.role === "admin"
      ? {
          idleExpiresAt: new Date(
            Math.min(expiresAt.getTime(), now + policy.idleMs),
          ),
          ...(reauthenticated
            ? {
                reauthenticatedAt: new Date(now),
                reauthRevision: user.loginRevision ?? 0,
              }
            : {}),
        }
      : {}),
  });
  if (req) await revokeSession(req);
  sessionHeaders(res, s);
  res.cookie(cookieName, token, {
    ...cookieOptions(),
    maxAge: policy.absoluteMs,
  });
  return s;
}
export function clearSession(res) {
  res.clearCookie(cookieName, cookieOptions());
}
export function contextMatches(req, s) {
  return req.headers["x-gharseva-context"] === s.context;
}
const denied = (status, message, code) => {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  throw e;
};
export async function auth(req, res, next) {
  try {
    const token = sessionCookie(req);
    if (!token) fail(401, "Please log in to continue.");
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ["HS256"],
        clockTimestamp: Math.floor(Date.now() / 1000),
      });
    } catch {
      fail(401, "Your session expired. Please sign in again.");
    }
    if (!/^[a-f0-9]{64}$/.test(decoded.sid || ""))
      denied(
        401,
        "This older session requires a one-time sign-in again.",
        "LEGACY_SESSION",
      );
    const s = await AuthSession.findOne({ tokenHash: digest(token) }),
      now = Date.now();
    if (
      !s ||
      s.revokedAt ||
      !["demo", "live"].includes(s.mode) ||
      (s.mode === "demo" && !demoDelivery()) ||
      !Number.isFinite(new Date(s.expiresAt).getTime()) ||
      new Date(s.expiresAt).getTime() <= now ||
      (s.role === "admin" &&
        (!s.idleExpiresAt ||
          !Number.isFinite(new Date(s.idleExpiresAt).getTime()) ||
          new Date(s.idleExpiresAt).getTime() <= now))
    ) {
      if (s && !s.revokedAt) await revokeSession(req);
      denied(
        401,
        "Your session expired or was signed out. Please sign in again.",
        "SESSION_EXPIRED",
      );
    }
    const user = await User.findById(decoded.sub).select("+loginRevision");
    if (
      !user ||
      user.status !== "ACTIVE" ||
      String(s.user) !== String(user._id) ||
      s.role !== user.role ||
      s.sessionVersion !== (user.sessionVersion ?? 0) ||
      decoded.ver !== (user.sessionVersion ?? 0)
    ) {
      await revokeSession(req);
      fail(401, "Your account access changed. Please sign in again.");
    }
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method || "GET");
    if (
      (unsafe || req.headers["x-gharseva-context"]) &&
      !contextMatches(req, s)
    )
      denied(
        409,
        "The browser account/session changed. Reload before continuing.",
        "SESSION_CONTEXT_CHANGED",
      );
    req.user = user;
    req.authSession = s;
    sessionHeaders(res, s);
    next();
  } catch (e) {
    next(e);
  }
}
// Public discovery may reuse a verified browser session without requiring login.
export const optionalAuth = (req, res, next) =>
  sessionCookie(req) ? auth(req, res, next) : next();
export function requireRecentAdmin(req) {
  if (req.user.role !== "admin") return;
  const at = req.authSession?.reauthenticatedAt;
  if (
    !at ||
    !Number.isFinite(new Date(at).getTime()) ||
    new Date(at).getTime() > Date.now() ||
    req.authSession.reauthRevision !== (req.user.loginRevision ?? 0) ||
    Date.now() - new Date(at).getTime() >= sessionPolicy().recentMs
  )
    denied(
      403,
      "Confirm your administrator password and email code to continue.",
      "REAUTH_REQUIRED",
    );
}
export const role =
  (...roles) =>
  (req, res, next) => {
    try {
      if (!roles.includes(req.user.role))
        fail(403, "You do not have permission for this action.");
      if (
        req.user.role === "admin" &&
        !["GET", "HEAD", "OPTIONS"].includes(req.method || "GET")
      )
        requireRecentAdmin(req);
      next();
    } catch (e) {
      next(e);
    }
  };
export function mountSessionRoutes(app) {
  app.post("/api/auth/logout", async (req, res) => {
    let verified = false;
    try {
      jwt.verify(sessionCookie(req), process.env.JWT_SECRET, {
        algorithms: ["HS256"],
        clockTimestamp: Math.floor(Date.now() / 1000),
      });
      verified = true;
    } catch {}
    const token = sessionCookie(req),
      s = token && (await AuthSession.findOne({ tokenHash: digest(token) }));
    if (
      verified &&
      s &&
      !s.revokedAt &&
      new Date(s.expiresAt).getTime() > Date.now() &&
      !contextMatches(req, s)
    )
      denied(
        409,
        "The browser session changed. Recheck it before signing out.",
        "SESSION_CONTEXT_CHANGED",
      );
    await revokeSession(req);
    clearSession(res);
    res.json({ ok: true });
  });
  app.get("/api/auth/session", auth, (req, res) =>
    res.json(sessionView(req.authSession)),
  );
  app.post("/api/auth/session/activity", auth, async (req, res) => {
    if (req.user.role !== "admin") fail(403, "Administrator activity only.");
    const now = Date.now();
    const s = await AuthSession.findOneAndUpdate(
      {
        _id: req.authSession._id,
        revokedAt: null,
        expiresAt: { $gt: new Date(now) },
        idleExpiresAt: { $gt: new Date(now) },
      },
      {
        $max: {
          lastActiveAt: new Date(now),
          idleExpiresAt: new Date(
            Math.min(
              new Date(req.authSession.expiresAt).getTime(),
              now + sessionPolicy().idleMs,
            ),
          ),
        },
      },
      { returnDocument: "after" },
    );
    if (!s) fail(401, "The session expired. Please sign in again.");
    sessionHeaders(res, s);
    res.json(sessionView(s));
  });
}
