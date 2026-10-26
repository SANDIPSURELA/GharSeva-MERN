import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { User, PendingLogin, ContactThrottle, AuthSession } from "./models.js";
import {
  setSession,
  safeUser,
  auth,
  sessionHeaders,
  sessionPolicy,
} from "./auth.js";
import { fail, text } from "./domain.js";
import { checkStoredLoginRole } from "./login-policy.js";
import {
  codeDigest,
  deliverCode,
  demoDelivery,
  identityOptions,
} from "./identity-services.js";

const cookieName = "gharseva_pending_login";
const cookieFor = (purpose) =>
  purpose === "admin_reauth" ? "gharseva_pending_reauth" : cookieName;
const cookieOptions = (purpose = "login") => ({
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: purpose === "admin_reauth" ? "/api/auth/reauth" : "/api/auth/login",
});
const hash = (value) => createHash("sha256").update(value).digest("hex");
const accountProof = (user) =>
  createHmac("sha256", process.env.JWT_SECRET)
    .update(
      JSON.stringify([
        String(user._id),
        user.passwordHash,
        user.email,
        user.mobile,
        user.sessionVersion ?? 0,
        user.loginRevision ?? 0,
      ]),
    )
    .digest("hex");
const tokenFrom = (req, purpose = "login") =>
  (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieFor(purpose) + "="))
    ?.slice(cookieFor(purpose).length + 1);
const tokenFilter = (req, purpose = "login") => {
  const token = tokenFrom(req, purpose);
  return token && /^[a-f0-9]{64}$/.test(token)
    ? { tokenHash: hash(token) }
    : null;
};
export async function cancelPendingLogin(req, res, purpose = "login") {
  const filter = tokenFilter(req, purpose);
  if (filter)
    await PendingLogin.updateOne(filter, {
      $set: { used: true, ready: false },
    });
  if (tokenFrom(req, purpose))
    res.clearCookie(cookieFor(purpose), cookieOptions(purpose));
}
async function current(req, purpose = "login") {
  const filter = tokenFilter(req, purpose);
  const challenge =
    filter &&
    (await PendingLogin.findOne({
      ...filter,
      purpose,
      portal: { $in: ["customer", "provider", "admin"] },
      used: false,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 5 },
    }).select("+email +accountProof +digest +codeHistory"));
  if (!challenge || (challenge.mode === "demo" && !demoDelivery()))
    fail(
      401,
      "Your sign-in request expired or is unavailable. Go back and enter your password again.",
    );
  const user = await User.findById(challenge.user).select(
    "+passwordHash +loginRevision",
  );
  if (
    (purpose === "admin_reauth" &&
      (!req.authSession ||
        String(challenge.boundSession) !== String(req.authSession._id) ||
        String(challenge.user) !== String(req.user._id) ||
        req.user.role !== "admin")) ||
    !user ||
    user.status !== "ACTIVE" ||
    user.role !== challenge.portal ||
    user.email !== challenge.email ||
    (user.sessionVersion ?? 0) !== challenge.sessionVersion ||
    accountProof(user) !== challenge.accountProof
  ) {
    await PendingLogin.updateOne(
      { _id: challenge._id },
      { $set: { used: true, ready: false } },
    );
    fail(
      401,
      "Your account changed. Go back and sign in again, or contact support.",
    );
  }
  return { challenge, user };
}
async function reserveSend(user, purpose = "login") {
  const id =
    (purpose === "admin_reauth" ? "admin-reauth:" : "password-login:") +
    hash(String(user._id));
  const now = new Date();
  try {
    await ContactThrottle.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          nextAllowedAt: new Date(0),
          windowStart: now,
          count: 0,
          expiresAt: new Date(Date.now() + 86400000),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  await ContactThrottle.updateOne(
    { _id: id, windowStart: { $lte: new Date(Date.now() - 15 * 60000) } },
    { $set: { windowStart: now, count: 0 } },
  );
  const allowed = await ContactThrottle.findOneAndUpdate(
    {
      _id: id,
      nextAllowedAt: { $lte: now },
      count: { $lt: 5 },
    },
    {
      $set: {
        nextAllowedAt: new Date(Date.now() + 60000),
        expiresAt: new Date(Date.now() + 86400000),
      },
      $inc: { count: 1 },
    },
  );
  if (!allowed)
    fail(
      429,
      "Wait 60 seconds before requesting another code. Up to five emails per account are allowed in 15 minutes.",
    );
}
const view = (challenge, value) => ({
  pending: true,
  destination:
    challenge.email.slice(0, 1) + "***@" + challenge.email.split("@")[1],
  expiresAt: challenge.codeExpiresAt,
  passwordProofExpiresAt: challenge.expiresAt,
  retryAfter: Math.max(
    0,
    Math.ceil((challenge.nextSendAt - Date.now()) / 1000),
  ),
  mode: challenge.mode,
  ...(challenge.mode === "demo" && demoDelivery()
    ? {
        demoCode: value,
        message: "CLASSROOM DEMO: no email sent. Use the displayed code.",
      }
    : { message: "Check your registered email for your sign-in code." }),
});
export function mountPasswordLogin(
  app,
  { loginLimit, sendLoginCode = deliverCode, purpose = "login" } = {},
) {
  const reauth = purpose === "admin_reauth",
    prefix = reauth ? "/api/auth/reauth" : "/api/auth/login";
  const guards = reauth
    ? [
        auth,
        (req, res, next) =>
          req.user.role === "admin"
            ? next()
            : next(
                Object.assign(
                  new Error("Administrator reauthentication only."),
                  { status: 403 },
                ),
              ),
      ]
    : [];
  const verifyLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 60,
    message: { message: "Too many sign-in attempts. Please try again later." },
  });
  app.post(prefix, ...guards, loginLimit, async (req, res) => {
    await cancelPendingLogin(req, res, purpose);
    const identifier = text(
      reauth ? req.user.email : req.body.identifier,
      "Email or mobile",
      3,
      120,
    );
    const lookup = identifier.includes("@")
      ? { email: identifier.toLowerCase() }
      : { mobile: identifier.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "") };
    const user = await User.findOne(
      reauth ? { _id: req.user._id } : lookup,
    ).select("+passwordHash +loginRevision");
    if (
      typeof req.body.password !== "string" ||
      req.body.password.length > 72 ||
      !user ||
      !(await bcrypt.compare(req.body.password, user.passwordHash))
    )
      fail(401, "Email/mobile or password is incorrect.");
    if (user.status !== "ACTIVE")
      fail(
        403,
        "Your account is suspended. Contact the project administrator.",
      );
    checkStoredLoginRole(user);
    if (!identityOptions().email)
      fail(503, "Email delivery is not configured. Contact support.");
    await reserveSend(user, purpose);
    const token = randomBytes(32).toString("hex");
    const value = String(randomInt(100000, 1000000));
    const challenge = new PendingLogin({
      tokenHash: hash(token),
      purpose,
      ...(reauth ? { boundSession: req.authSession._id } : {}),
      user: user._id,
      // Stored role snapshot; browser portal/role fields are ignored.
      portal: user.role,
      email: user.email,
      accountProof: accountProof(user),
      sessionVersion: user.sessionVersion ?? 0,
      mode: demoDelivery() ? "demo" : "live",
      nextSendAt: new Date(Date.now() + 60000),
      codeExpiresAt: new Date(Date.now() + 5 * 60000),
      expiresAt: new Date(Date.now() + 10 * 60000),
    });
    challenge.digest = codeDigest(challenge._id + ":0", value);
    challenge.codeHistory = [codeDigest(challenge._id, value)];
    await challenge.save();
    try {
      await sendLoginCode("email", challenge.email, value, purpose);
      await PendingLogin.updateOne(
        { _id: challenge._id, used: false },
        { $set: { ready: true } },
      );
    } catch {
      await PendingLogin.deleteOne({ _id: challenge._id });
      fail(
        503,
        "Email delivery failed. No sign-in was completed. Try again later.",
      );
    }
    res.cookie(cookieFor(purpose), token, {
      ...cookieOptions(purpose),
      maxAge: 10 * 60000,
    });
    res.status(202).json(view(challenge, value));
  });
  app.delete(prefix + "/pending", ...guards, async (req, res) => {
    await cancelPendingLogin(req, res);
    res.json({ ok: true });
  });
  app.post(prefix + "/resend", ...guards, verifyLimit, async (req, res) => {
    const { challenge, user } = await current(req, purpose);
    if (challenge.nextSendAt > new Date())
      fail(429, "Wait 60 seconds before resending.");
    await reserveSend(user);
    let value;
    do {
      value = String(randomInt(100000, 1000000));
    } while (challenge.codeHistory.includes(codeDigest(challenge._id, value)));
    const generation = challenge.generation + 1;
    const digest = codeDigest(challenge._id + ":" + generation, value);
    const updated = await PendingLogin.findOneAndUpdate(
      {
        _id: challenge._id,
        used: false,
        generation: challenge.generation,
        attempts: { $lt: 5 },
        expiresAt: { $gt: new Date() },
        nextSendAt: { $lte: new Date() },
      },
      {
        $set: {
          ready: false,
          digest,
          generation,
          nextSendAt: new Date(Date.now() + 60000),
          codeExpiresAt: new Date(
            Math.min(Date.now() + 5 * 60000, challenge.expiresAt.getTime()),
          ),
        },
        $push: { codeHistory: codeDigest(challenge._id, value) },
      },
      { returnDocument: "after" },
    ).select("+email");
    if (!updated) fail(409, "This sign-in request changed. Try again.");
    try {
      await sendLoginCode("email", updated.email, value, purpose);
    } catch {
      // The old code stays invalid. Failed-attempt count and password deadline stay unchanged.
      fail(
        503,
        "Email delivery failed. Wait before resending, or go back and sign in again.",
      );
    }
    const activated = await PendingLogin.updateOne(
      {
        _id: updated._id,
        generation,
        used: false,
        expiresAt: { $gt: new Date() },
      },
      { $set: { ready: true } },
    );
    if (!activated.modifiedCount)
      fail(409, "This sign-in request expired or was cancelled.");
    res.json(view(updated, value));
  });
  app.post(prefix + "/verify", ...guards, verifyLimit, async (req, res) => {
    const { challenge } = await current(req, purpose);
    if (!challenge.ready)
      fail(
        400,
        "Email delivery has not completed. Resend the code or go back.",
      );
    if (challenge.codeExpiresAt <= new Date())
      fail(400, "Your code expired. Resend it or go back.");
    const reserved = await PendingLogin.updateOne(
      {
        _id: challenge._id,
        used: false,
        ready: true,
        generation: challenge.generation,
        attempts: { $lt: 5 },
        codeExpiresAt: { $gt: new Date() },
        expiresAt: { $gt: new Date() },
      },
      { $inc: { attempts: 1 } },
    );
    if (!reserved.modifiedCount)
      fail(409, "This sign-in request changed or reached its attempt limit.");
    const code = typeof req.body.code === "string" ? req.body.code : "";
    const candidate = codeDigest(
      challenge._id + ":" + challenge.generation,
      code,
    );
    if (
      !/^\d{6}$/.test(code) ||
      !timingSafeEqual(Buffer.from(candidate), Buffer.from(challenge.digest))
    )
      fail(
        400,
        "The code is incorrect. Check it and try again. After five attempts, enter your password again.",
      );
    const consumed = await PendingLogin.updateOne(
      {
        _id: challenge._id,
        used: false,
        ready: true,
        generation: challenge.generation,
        digest: challenge.digest,
        codeExpiresAt: { $gt: new Date() },
        expiresAt: { $gt: new Date() },
      },
      { $set: { used: true, ready: false } },
    );
    if (!consumed.modifiedCount)
      fail(409, "This code was already used or replaced.");
    // Re-read after atomic consumption, including changes during code verification.
    const user = await User.findById(challenge.user).select(
      "+passwordHash +loginRevision",
    );
    if (
      !user ||
      user.status !== "ACTIVE" ||
      user.role !== challenge.portal ||
      user.email !== challenge.email ||
      (user.sessionVersion ?? 0) !== challenge.sessionVersion ||
      accountProof(user) !== challenge.accountProof
    )
      fail(401, "Your account changed. Go back and sign in again.");
    res.clearCookie(cookieFor(purpose), cookieOptions(purpose));
    if (reauth) {
      const now = Date.now(),
        fresh = await AuthSession.findOneAndUpdate(
          {
            _id: req.authSession._id,
            user: user._id,
            role: "admin",
            sessionVersion: user.sessionVersion ?? 0,
            revokedAt: null,
            expiresAt: { $gt: new Date(now) },
            idleExpiresAt: { $gt: new Date(now) },
          },
          {
            $set: {
              reauthenticatedAt: new Date(now),
              reauthRevision: user.loginRevision ?? 0,
            },
          },
          { returnDocument: "after" },
        );
      if (!fresh || String(challenge.boundSession) !== String(fresh._id))
        fail(401, "This session changed. Sign in again.");
      sessionHeaders(res, fresh);
      return res.json({
        ok: true,
        expiresAt: new Date(now + sessionPolicy().recentMs),
      });
    }
    await setSession(res, user, { req, reauthenticated: true });
    res.json(safeUser(user));
  });
}
