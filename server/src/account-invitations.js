import { requireCity } from "./cities.js";
import { registrationSession } from "./registration.js";
import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import { AccountInvitation, User } from "./models.js";
import { auth, role } from "./auth.js";
import { fail, text } from "./domain.js";
import {
  normaliseContact,
  contactKey,
  identityOptions,
} from "./identity-services.js";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const tokenHash = (value) => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    fail(
      404,
      "This invitation is unavailable. Ask the administrator for a new link.",
    );
  return digest(value);
};
const masked = (a) =>
  a.channel === "email"
    ? `${a.contact.slice(0, 1)}…@${a.contact.split("@")[1]}`
    : `••••••${a.contact.slice(-4)}`;
const status = (a) =>
  a.state === "PENDING" && a.expiresAt <= new Date() ? "EXPIRED" : a.state;
const view = (a) => {
  const x = a.toObject ? a.toObject() : { ...a };
  delete x.contactKey;
  delete x.tokenHash;
  delete x.reservedUser;
  return { ...x, status: status(a) };
};
const nextDates = () => ({
  expiresAt: new Date(Date.now() + 48 * 3600000),
  purgeAt: new Date(Date.now() + 90 * 86400000),
});
const id = (value) => {
  if (!mongoose.isValidObjectId(value)) fail(404, "Invitation not found.");
  return value;
};
const rev = (value) => {
  if (!Number.isInteger(value) || value < 1)
    fail(400, "Refresh the invitation before changing it.");
  return value;
};
// A crashed claim can be reopened only after ten minutes AND after proving no account was created.
async function settleClaims(filter = {}) {
  const rows = await AccountInvitation.find({
    ...filter,
    state: "ACCEPTING",
    claimedAt: { $lt: new Date(Date.now() - 10 * 60000) },
  }).limit(100);
  for (const row of rows) {
    const user = await User.findById(row.reservedUser).select("_id");
    await AccountInvitation.updateOne(
      { _id: row._id, state: "ACCEPTING", revision: row.revision },
      user
        ? {
            $set: { state: "ACCEPTED", user: user._id, acceptedAt: new Date() },
            $unset: { reservedUser: "", claimedAt: "" },
            $inc: { revision: 1 },
            $push: { history: { action: "ACCEPTANCE_RECOVERED" } },
          }
        : {
            $set: { state: "PENDING" },
            $unset: { reservedUser: "", claimedAt: "" },
            $inc: { revision: 1 },
            $push: { history: { action: "UNFINISHED_CLAIM_RELEASED" } },
          },
    );
  }
}
export async function claimAccountInvitation(body, identity, userId) {
  if (!body.invitationToken) return null;
  const hash = tokenHash(body.invitationToken);
  await settleClaims({ tokenHash: hash });
  const a = await AccountInvitation.findOne({
    tokenHash: hash,
    state: "PENDING",
    expiresAt: { $gt: new Date() },
  });
  if (!a)
    fail(
      409,
      "This invitation expired, was revoked or has already been used. Ask the administrator for a current invitation.",
    );
  if (
    !identity ||
    identity.channel !== a.channel ||
    identity.contact !== a.contact
  )
    fail(
      403,
      "Verify the exact email or mobile number this invitation was created for.",
    );
  if (body.role !== a.role)
    fail(403, "This invitation cannot be used for a different account role.");
  if (normaliseContact(a.channel, body[a.channel]) !== a.contact)
    fail(403, "Keep the invitation contact unchanged.");
  const claimed = await AccountInvitation.findOneAndUpdate(
    {
      _id: a._id,
      state: "PENDING",
      revision: a.revision,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: { state: "ACCEPTING", reservedUser: userId, claimedAt: new Date() },
      $inc: { revision: 1 },
    },
    { returnDocument: "after" },
  );
  if (!claimed)
    fail(
      409,
      "Another request is accepting this invitation. Wait and try signing in before retrying.",
    );
  return claimed;
}
export async function releaseAccountInvitation(a, userId) {
  if (!a) return;
  await AccountInvitation.updateOne(
    { _id: a._id, state: "ACCEPTING", reservedUser: userId },
    {
      $set: { state: "PENDING" },
      $unset: { reservedUser: "", claimedAt: "" },
      $inc: { revision: 1 },
    },
  );
}
export async function finishAccountInvitation(a, userId) {
  if (!a) return;
  const done = await AccountInvitation.updateOne(
    { _id: a._id, state: "ACCEPTING", reservedUser: userId },
    {
      $set: {
        state: "ACCEPTED",
        user: userId,
        acceptedAt: new Date(),
        purgeAt: new Date(Date.now() + 90 * 86400000),
      },
      $unset: { reservedUser: "", claimedAt: "" },
      $inc: { revision: 1 },
      $push: { history: { action: "ACCEPTED", actor: userId } },
    },
  );
  if (!done.modifiedCount)
    fail(409, "The invitation changed before acceptance could finish.");
}
export function mountAccountInvitations(app, { settings }) {
  const writes = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    message: { message: "Too many invitation changes. Try again shortly." },
  });
  const previews = rateLimit({
    windowMs: 15 * 60000,
    limit: 40,
    message: { message: "Too many invitation checks. Try again shortly." },
  });
  app.post("/api/invitations/preview", previews, async (req, res) => {
    const a = await AccountInvitation.findOne({
      tokenHash: tokenHash(req.body.token),
      state: "PENDING",
      expiresAt: { $gt: new Date() },
    });
    if (!a)
      fail(
        404,
        "This invitation is unavailable. It may have expired, been replaced, revoked or accepted. Ask the administrator for a new link.",
      );
    res.json({
      role: a.role,
      name: a.name || "",
      city: a.city || "",
      channel: a.channel,
      maskedContact: masked(a),
      expiresAt: a.expiresAt,
      verificationReady: !!identityOptions()[a.channel],
      providerRegistration:
        a.role !== "provider" || (await settings()).providerRegistration,
    });
  });
  app.post("/api/invitations/proof", previews, async (req, res) => {
    const a = await AccountInvitation.findOne({
      tokenHash: tokenHash(req.body.token),
      state: "PENDING",
      expiresAt: { $gt: new Date() },
    });
    if (!a)
      fail(404, "This invitation is unavailable. Ask for a current link.");
    const proof = await registrationSession(req, true);
    if (proof.channel !== a.channel || proof.contact !== a.contact)
      fail(
        403,
        "Verify the exact contact this invitation was created for. Change the contact proof to continue.",
      );
    if (await User.exists({ [a.channel]: a.contact }))
      fail(409, "An account already uses this contact. Sign in to it instead.");
    res.json({
      channel: proof.channel,
      contact: proof.contact,
      mode: proof.mode,
      name: a.name || proof.name || "",
      provider: proof.externalProvider || null,
      expiresAt: proof.expiresAt,
    });
  });
  app.get("/api/admin/invitations", auth, role("admin"), async (req, res) => {
    await settleClaims();
    const filter = {};
    const s = req.query.state;
    if (s === "EXPIRED") {
      filter.state = "PENDING";
      filter.expiresAt = { $lte: new Date() };
    } else if (s) {
      if (!["PENDING", "ACCEPTING", "ACCEPTED", "REVOKED"].includes(s))
        fail(400, "Choose a valid invitation status.");
      filter.state = s;
      if (s === "PENDING") filter.expiresAt = { $gt: new Date() };
    }
    if (req.query.q) {
      const q = String(req.query.q)
        .slice(0, 80)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: new RegExp(q, "i") },
        { contact: new RegExp(q, "i") },
      ];
    }
    const page = Math.max(
      1,
      Math.min(10000, Math.floor(Number(req.query.page) || 1)),
    );
    const [items, total] = await Promise.all([
      AccountInvitation.find(filter)
        .select("-claimedAt")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .lean(),
      AccountInvitation.countDocuments(filter),
    ]);
    res.json({
      items: items.map(view),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / 20)),
    });
  });
  app.post(
    "/api/admin/invitations",
    auth,
    role("admin"),
    writes,
    async (req, res) => {
      if (!["customer", "provider"].includes(req.body.role))
        fail(400, "Invitations can create customer or provider accounts only.");
      if (req.body.password !== undefined || req.body.approval !== undefined)
        fail(
          400,
          "Recipients choose their own password. Provider approval is a separate review.",
        );
      const channel = req.body.channel,
        contact = normaliseContact(channel, req.body.contact),
        name = req.body.name
          ? text(req.body.name, "Recipient name", 3, 80)
          : "",
        city = req.body.city ? requireCity(req.body.city) : "";
      if (
        req.body.role === "provider" &&
        !(await settings()).providerRegistration
      )
        fail(
          409,
          "Provider registration is paused. Enable it before creating a provider invitation.",
        );
      if (await User.exists({ [channel]: contact }))
        fail(
          409,
          "An account already uses that contact. Manage the existing account instead of creating another.",
        );
      const key = contactKey(channel, contact);
      await settleClaims({ contactKey: key });
      const prior = await AccountInvitation.findOne({ contactKey: key });
      if (prior && !["EXPIRED", "REVOKED"].includes(status(prior)))
        fail(
          409,
          "An invitation already exists for this contact. Open it to replace the link or revoke it.",
        );
      const token = randomBytes(32).toString("hex"),
        data = {
          role: req.body.role,
          channel,
          contact,
          name,
          city,
          tokenHash: digest(token),
          ...nextDates(),
          state: "PENDING",
        };
      let saved;
      if (prior)
        saved = await AccountInvitation.findOneAndUpdate(
          { _id: prior._id, revision: prior.revision, state: prior.state },
          {
            $set: data,
            $unset: {
              user: "",
              acceptedAt: "",
              reservedUser: "",
              claimedAt: "",
            },
            $inc: { revision: 1 },
            $push: {
              history: { action: "CREATED_AGAIN", actor: req.user._id },
            },
          },
          { returnDocument: "after" },
        );
      else
        saved = await AccountInvitation.create({
          ...data,
          contactKey: key,
          createdBy: req.user._id,
          history: [{ action: "CREATED", actor: req.user._id }],
        });
      if (!saved)
        fail(
          409,
          "Another administrator changed this invitation. Refresh before trying again.",
        );
      res.status(201).json({
        invitation: view(saved),
        token,
        delivery: "MANUAL_LINK",
        message:
          "Invitation created. No message was sent. Share the link privately with the intended recipient.",
      });
    },
  );
  app.patch(
    "/api/admin/invitations/:id",
    auth,
    role("admin"),
    writes,
    async (req, res) => {
      if (!["REVOKE", "REPLACE_LINK"].includes(req.body.action))
        fail(400, "Choose revoke or replace link.");
      const old = await AccountInvitation.findOne({
        _id: id(req.params.id),
        revision: rev(req.body.revision),
      });
      if (!old)
        fail(409, "This invitation changed. Refresh before trying again.");
      if (["ACCEPTED", "ACCEPTING"].includes(old.state))
        fail(
          409,
          "An accepted or currently accepting invitation cannot be changed. Manage the account after acceptance.",
        );
      if (req.body.action === "REPLACE_LINK" && old.state === "REVOKED")
        fail(409, "Create a new invitation for this revoked contact.");
      if (
        req.body.action === "REPLACE_LINK" &&
        (await User.exists({ [old.channel]: old.contact }))
      )
        fail(409, "An account already uses that contact.");
      const token =
        req.body.action === "REPLACE_LINK"
          ? randomBytes(32).toString("hex")
          : null;
      const saved = await AccountInvitation.findOneAndUpdate(
        { _id: old._id, revision: old.revision, state: old.state },
        {
          $set: token
            ? { tokenHash: digest(token), state: "PENDING", ...nextDates() }
            : { state: "REVOKED" },
          $inc: { revision: 1 },
          $push: { history: { action: req.body.action, actor: req.user._id } },
        },
        { returnDocument: "after" },
      );
      if (!saved)
        fail(
          409,
          "Another administrator changed this invitation. Refresh before trying again.",
        );
      res.json({
        invitation: view(saved),
        ...(token ? { token } : {}),
        delivery: "MANUAL_LINK",
      });
    },
  );
}
