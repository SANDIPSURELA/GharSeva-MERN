import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { User, PasswordRecovery, ContactChallenge } from "./models.js";
import { clearSession } from "./auth.js";
import { fail, password } from "./domain.js";
import { demoDelivery } from "./identity-services.js";
import { hasContactProof, versionFilter } from "./login-policy.js";
const name = "gharseva_recovery";
const options = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/api/auth/password",
});
const digest = (token) => createHash("sha256").update(token).digest("hex");
export async function issuePasswordRecovery(res, user, challenge) {
  const token = randomBytes(32).toString("hex");
  const proof = await PasswordRecovery.create({
    tokenHash: digest(token),
    user: user._id,
    channel: challenge.channel,
    contact: challenge.contact,
    mode: challenge.mode,
    sessionVersion: user.sessionVersion ?? 0,
    expiresAt: new Date(Date.now() + 10 * 60000),
  });
  res.cookie(name, token, { ...options(), maxAge: 10 * 60000 });
  return { expiresAt: proof.expiresAt, mode: proof.mode };
}
async function currentProof(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const proof = await PasswordRecovery.findOne({
    tokenHash: digest(token),
    expiresAt: { $gt: new Date() },
  }).select("+contact");
  if (!proof || (proof.mode === "demo" && !demoDelivery())) return null;
  const user = await User.findOne({
    _id: proof.user,
    status: "ACTIVE",
    role: { $in: ["customer", "provider"] },
    [proof.channel]: proof.contact,
    ...versionFilter(proof.sessionVersion),
  });
  if (!user || !hasContactProof(user, proof.channel, demoDelivery()))
    return null;
  return { proof, user };
}
export function mountPasswordRecovery(app) {
  const limit = rateLimit({
    windowMs: 15 * 60000,
    limit: 15,
    message: {
      message: "Too many password recovery attempts. Please try again later.",
    },
  });
  app.get("/api/auth/password/recovery", async (req, res) => {
    const record = await currentProof(req);
    res.json(
      record
        ? { expiresAt: record.proof.expiresAt, mode: record.proof.mode }
        : null,
    );
  });
  app.delete("/api/auth/password/recovery", async (req, res) => {
    const record = await currentProof(req);
    if (record) await PasswordRecovery.deleteOne({ _id: record.proof._id });
    res.clearCookie(name, options());
    res.json({ ok: true });
  });
  app.post("/api/auth/password/reset", limit, async (req, res) => {
    const record = await currentProof(req);
    if (!record)
      fail(401, "Your recovery session expired. Verify your contact again.");
    if (req.body.newPassword !== req.body.confirmPassword)
      fail(400, "Your passwords do not match. Please enter them again.");
    const passwordHash = await bcrypt.hash(password(req.body.newPassword), 12);
    const { proof } = record;
    const result = await User.updateOne(
      {
        _id: proof.user,
        status: "ACTIVE",
        role: { $in: ["customer", "provider"] },
        [proof.channel]: proof.contact,
        ...versionFilter(proof.sessionVersion),
      },
      { $set: { passwordHash }, $inc: { sessionVersion: 1 } },
    );
    if (!result.modifiedCount)
      fail(
        409,
        "This password was already changed. Start recovery again if needed.",
      );
    await Promise.all([
      PasswordRecovery.deleteMany({ user: proof.user }),
      ContactChallenge.updateMany(
        { owner: proof.user, purpose: { $in: ["login", "recover"] } },
        { $set: { used: true } },
      ),
    ]);
    res.clearCookie(name, options());
    clearSession(res);
    res.json({
      ok: true,
      message:
        "Password updated. Sign in with your new password. All previous GharSeva sessions have ended.",
    });
  });
}
