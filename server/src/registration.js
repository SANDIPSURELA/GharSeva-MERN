import { requireCity } from "./cities.js";
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import mongoose from "mongoose";
import { identityApprovalGuard } from "./provider-identity.js";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import {
  ContactChallenge,
  ContactThrottle,
  RegistrationSession,
  ExternalIdentity,
  ProviderApplication,
  User,
  File,
} from "./models.js";
import { auth, role, safeUser, setSession } from "./auth.js";
import { fail, text } from "./domain.js";
import {
  checkLoginPortal,
  checkStoredLoginRole,
  validateLoginPortal,
  hasContactProof,
} from "./login-policy.js";
import {
  mountPasswordRecovery,
  issuePasswordRecovery,
} from "./password-recovery.js";
import {
  demoDelivery,
  validateIdentityEnvironment,
  identityOptions,
  normaliseContact,
  contactKey,
  codeDigest,
  deliverCode,
  checkSms,
  verifyExternal,
} from "./identity-services.js";
const sessionCookie = "gharseva_registration";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/api",
  maxAge: 30 * 60000,
});
const getCookie = (req) =>
  (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${sessionCookie}=`))
    ?.slice(sessionCookie.length + 1);
export async function registrationSession(req, required = false) {
  const token = getCookie(req);
  const session =
    token && /^[a-f0-9]{64}$/.test(token)
      ? await RegistrationSession.findOne({
          tokenHash: hash(token),
          expiresAt: { $gt: new Date() },
        }).select("+externalUid")
      : null;
  if ((!session || (session.mode === "demo" && !demoDelivery())) && required)
    fail(401, "Verify your contact to start or resume registration.");
  return session?.mode === "demo" && !demoDelivery() ? null : session;
}
async function issueSession(res, identity) {
  const token = randomBytes(32).toString("hex");
  const record = await RegistrationSession.create({
    ...identity,
    tokenHash: hash(token),
    expiresAt: new Date(Date.now() + 30 * 60000),
  });
  res.cookie(sessionCookie, token, cookieOptions());
  return sessionView(record);
}
const sessionView = (s) =>
  s
    ? {
        channel: s.channel,
        contact: s.contact,
        mode: s.mode,
        name: s.name || "",
        provider: s.externalProvider || null,
        expiresAt: s.expiresAt,
      }
    : null;
export async function verifyRegistrationEntry(req, body) {
  const required =
    Boolean(body.invitationToken) ||
    body.verifiedRegistration === true ||
    process.env.REQUIRE_VERIFIED_REGISTRATION === "true" ||
    process.env.NODE_ENV === "production";
  const session = await registrationSession(req, required);
  if (session) {
    if (
      session.externalProvider === "apple.com" &&
      /@(?:privaterelay\.appleid\.com|private\.icloud\.com)$/.test(
        session.contact,
      ) &&
      body.appleRelayConsent !== true
    )
      fail(
        400,
        "Please consent before associating your Apple private relay identity with your GharSeva contact details.",
      );
    if (
      normaliseContact(session.channel, body[session.channel]) !==
      session.contact
    )
      fail(
        400,
        "The registration contact must match the contact you verified.",
      );
    if (
      session.externalUid &&
      (await ExternalIdentity.exists({ uid: session.externalUid }))
    )
      fail(
        409,
        "This external identity already has an account. Sign in instead.",
      );
  }
  return session;
}
const snapshot = (body, session) => {
  const data = {};
  for (const [key, max] of Object.entries({
    name: 80,
    email: 120,
    mobile: 20,
    city: 70,
    area: 100,
    bio: 500,
  })) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "string" || body[key].length > max)
        fail(400, `Enter valid ${key} details.`);
      data[key] =
        key === "city" && body[key].trim()
          ? requireCity(body[key])
          : body[key].trim();
    }
  }
  if (body.categories !== undefined) {
    if (
      !Array.isArray(body.categories) ||
      body.categories.length > 8 ||
      body.categories.some(
        (x) => typeof x !== "string" || !/^[a-z0-9-]{1,70}$/.test(x),
      )
    )
      fail(400, "Choose up to eight service categories.");
    data.categories = [...new Set(body.categories)];
  }
  for (const [key, max] of Object.entries({ experience: 50, price: 50000 })) {
    if (body[key] !== undefined && body[key] !== "") {
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < 0 || value > max)
        fail(400, `Enter valid ${key}.`);
      data[key] = value;
    }
  }
  if (session) data[session.channel] = session.contact;
  return data;
};
export async function finishRegistration(req, res, user, body, session) {
  if (session?.externalUid)
    await ExternalIdentity.create({
      uid: session.externalUid,
      provider: session.externalProvider,
      user: user._id,
    });
  if (user.role === "provider") {
    const channel = session?.channel || "email";
    const contact = session?.contact || user.email;
    const key = contactKey(channel, contact);
    const existing = await ProviderApplication.findOne({ contactKey: key });
    if (existing && existing.state !== "DRAFT")
      fail(
        409,
        "This contact already has a submitted application. Sign in to manage it.",
      );
    const data = {
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      city: user.city,
      categories: user.profile.categories?.length
        ? [...user.profile.categories]
        : [user.profile.category],
      area: user.profile.area,
      bio: user.profile.bio,
      experience: user.profile.experience,
      price: user.profile.price,
    };
    const update = {
      $set: {
        channel,
        contact,
        mode: session?.mode || "unverified",
        user: user._id,
        data,
        state: "SUBMITTED",
        step: 4,
        submittedAt: new Date(),
        lastActivityAt: new Date(),
        followUpConsent: body.followUpConsent === true,
      },
      $unset: { expiresAt: "" },
      $inc: { revision: 1 },
      $push: {
        history: {
          action: "SUBMITTED",
          note: "Applicant submitted a professional application.",
          actor: user._id,
        },
      },
    };
    const submitted = await ProviderApplication.findOneAndUpdate(
      existing
        ? { _id: existing._id, state: "DRAFT", revision: existing.revision }
        : { contactKey: key },
      update,
      { upsert: !existing, runValidators: true, returnDocument: "after" },
    );
    if (!submitted)
      fail(409, "The saved draft changed. Refresh before submitting again.");
  }
  if (session) {
    await RegistrationSession.deleteOne({ _id: session._id });
    res.clearCookie(sessionCookie, cookieOptions());
  }
}
export async function undoRegistration(userId) {
  await ExternalIdentity.deleteMany({ user: userId });
  await User.deleteOne({ _id: userId });
}
const masked = (s) =>
  s.channel === "email"
    ? `${s.contact.slice(0, 1)}…@${s.contact.split("@")[1]}`
    : `••••••${s.contact.slice(-4)}`;
const publicDraft = (a, session) =>
  a
    ? {
        _id: a._id,
        data: a.data,
        revision: a.revision,
        step: a.step,
        saveConsent: a.saveConsent,
        followUpConsent: a.followUpConsent,
        state: a.state,
        lastActivityAt: a.lastActivityAt,
        expiresAt: a.expiresAt,
        history: a.history.map((h) => ({
          action: h.action,
          note: h.note,
          at: h.at,
        })),
        identity: sessionView(session),
      }
    : null;
export function applicationChecks(a, user) {
  const d = a.data || {};
  const checks = [];
  if (!d.name || d.name.trim().length < 3)
    checks.push("Full name is incomplete.");
  if (!d.categories?.length) checks.push("No service category selected.");
  if (!d.city || !d.area) checks.push("Service location is incomplete.");
  if (!d.bio || d.bio.length < 30)
    checks.push("Work description needs more detail.");
  if (!user?.profile?.documents?.length)
    checks.push("Supporting document needs to be uploaded.");
  if (a.mode !== "live")
    checks.push(
      a.mode === "demo"
        ? "Contact proof is a classroom demonstration, not live verification."
        : "Contact was not verified through the new flow.",
    );
  checks.push(
    "Document authenticity and name matching require administrator review.",
  );
  return checks;
}

export function mountRegistration(
  app,
  { settings, verifyIdentity = verifyExternal },
) {
  validateIdentityEnvironment();
  mountPasswordRecovery(app);
  const sendLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    message: { message: "Too many code requests. Try again in 15 minutes." },
  });
  const checkLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 40,
    message: { message: "Too many verification attempts. Try again later." },
  });
  const saveLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 120,
    message: { message: "Too many draft changes. Please wait a little." },
  });
  app.get("/api/auth/options", (req, res) => res.json(identityOptions()));
  app.get("/api/auth/registration-session", async (req, res) =>
    res.json(sessionView(await registrationSession(req))),
  );
  app.delete("/api/auth/registration-session", async (req, res) => {
    const session = await registrationSession(req);
    if (session) await RegistrationSession.deleteOne({ _id: session._id });
    res.clearCookie(sessionCookie, cookieOptions());
    res.json({ ok: true });
  });
  app.post("/api/auth/code/request", sendLimit, async (req, res) => {
    const { channel, purpose } = req.body;
    if (!["register", "verify", "recover"].includes(purpose))
      fail(400, "Choose a valid verification purpose.");
    if (purpose === "recover" && req.body.portal !== undefined)
      validateLoginPortal(req.body.portal, true);
    const contact = normaliseContact(channel, req.body.contact);
    const options = identityOptions();
    if (!options[channel])
      fail(
        503,
        `${channel === "email" ? "Email" : "SMS"} verification is not available yet. Contact support.`,
      );
    let owner;
    if (purpose === "verify") {
      await new Promise((resolve, reject) =>
        auth(req, res, (e) => (e ? reject(e) : resolve())),
      );
      if (req.user.role === "admin" || req.user[channel] !== contact)
        fail(403, "Verify a contact already listed in your own account.");
      owner = req.user._id;
    }
    let eligibleUser;
    if (purpose === "recover") {
      const candidate = await User.findOne({
        [channel]: contact,
        status: "ACTIVE",
        role: req.body.portal || { $in: ["customer", "provider"] },
      });
      if (candidate && hasContactProof(candidate, channel, demoDelivery()))
        eligibleUser = candidate;
    }
    const throttleId = contactKey(channel, contact);
    await ContactThrottle.updateOne(
      { _id: throttleId },
      {
        $setOnInsert: {
          nextAllowedAt: new Date(0),
          windowStart: new Date(),
          count: 0,
          expiresAt: new Date(Date.now() + 86400000),
        },
      },
      { upsert: true },
    );
    await ContactThrottle.updateOne(
      {
        _id: throttleId,
        windowStart: { $lt: new Date(Date.now() - 15 * 60000) },
      },
      { $set: { windowStart: new Date(), count: 0 } },
    );
    const allowed = await ContactThrottle.findOneAndUpdate(
      {
        _id: throttleId,
        nextAllowedAt: { $lte: new Date() },
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
        "Wait before requesting another code. A maximum of five requests per contact is allowed every 15 minutes.",
      );
    const challenge = new ContactChallenge({
      channel,
      contact,
      purpose,
      owner: eligibleUser?._id || owner,
      portal: purpose === "recover" ? req.body.portal : undefined,
      sessionVersion:
        eligibleUser?.sessionVersion ?? (eligibleUser ? 0 : undefined),
      deliveryEligible: purpose !== "recover" || Boolean(eligibleUser),
      mode: options.demo ? "demo" : "live",
      expiresAt: new Date(Date.now() + 5 * 60000),
    });
    const value = String(randomInt(100000, 1000000));
    challenge.digest = codeDigest(challenge._id, value);
    // Reserve the cooldown before contacting an external delivery service.
    await challenge.save();
    await ContactChallenge.updateMany(
      { _id: { $ne: challenge._id }, contact, channel },
      { $set: { used: true } },
    );
    try {
      if (challenge.deliveryEligible)
        await deliverCode(channel, contact, value, purpose);
      const activated = await ContactChallenge.updateOne(
        { _id: challenge._id, used: false, expiresAt: { $gt: new Date() } },
        { $set: { ready: true } },
      );
      if (!activated.modifiedCount)
        fail(
          409,
          "This code request expired or was replaced. Request a new code.",
        );
    } catch (error) {
      await ContactChallenge.deleteOne({ _id: challenge._id });
      throw error;
    }
    res.status(201).json({
      challengeId: challenge._id,
      expiresAt: challenge.expiresAt,
      retryAfter: 60,
      mode: challenge.mode,
      ...(options.demo
        ? {
            demoCode: value,
            message:
              "CLASSROOM DEMO: no email or SMS was sent. Use this test code.",
          }
        : {
            message:
              "If this contact can be used, a code has been sent. It expires in 5 minutes.",
          }),
    });
  });
  app.post("/api/auth/code/check", checkLimit, async (req, res) => {
    const { challengeId, code } = req.body;
    if (
      !mongoose.isValidObjectId(challengeId) ||
      !/^\d{6}$/.test(String(code || ""))
    )
      fail(400, "Enter the six-digit code.");
    const challenge = await ContactChallenge.findOneAndUpdate(
      {
        _id: challengeId,
        purpose: { $ne: "login" },
        ready: true,
        used: false,
        attempts: { $lt: 5 },
        expiresAt: { $gt: new Date() },
      },
      { $inc: { attempts: 1 } },
      { returnDocument: "after" },
    ).select("+digest +deliveryEligible");
    if (!challenge || (challenge.mode === "demo" && !demoDelivery()))
      fail(400, "Code expired or unavailable. Request a new code.");
    let correct;
    if (challenge.channel === "mobile" && challenge.mode === "live")
      correct = await checkSms(challenge.contact, String(code));
    else {
      const candidate = codeDigest(challenge._id, String(code));
      correct = timingSafeEqual(
        Buffer.from(candidate),
        Buffer.from(challenge.digest),
      );
    }
    if (!correct) fail(400, "The code is incorrect. Check it and try again.");
    if (challenge.purpose === "recover") {
      if (req.body.portal !== undefined && req.body.portal !== challenge.portal)
        fail(400, "Use the sign-in page where this code was requested.");
    }
    if (challenge.purpose === "verify") {
      await new Promise((resolve, reject) =>
        auth(req, res, (e) => (e ? reject(e) : resolve())),
      );
      if (
        String(challenge.owner) !== String(req.user._id) ||
        req.user[challenge.channel] !== challenge.contact
      )
        fail(403, "This verification belongs to a different account.");
    }
    const consumed = await ContactChallenge.updateOne(
      {
        _id: challenge._id,
        used: false,
        ready: true,
        expiresAt: { $gt: new Date() },
      },
      { $set: { used: true, ready: false } },
    );
    if (!consumed.modifiedCount)
      fail(409, "This code was already used. Request a new one.");
    if (challenge.purpose === "register")
      return res.json({
        identity: await issueSession(res, {
          channel: challenge.channel,
          contact: challenge.contact,
          mode: challenge.mode,
        }),
      });
    if (challenge.purpose === "verify") {
      const user = await User.findByIdAndUpdate(
        req.user._id,
        {
          $set: {
            [`verification.${challenge.channel}`]: {
              at: new Date(),
              mode: challenge.mode,
            },
          },
        },
        { returnDocument: "after" },
      );
      return res.json({ user: safeUser(user) });
    }
    const user = await User.findOne({
      _id: challenge.owner,
      [challenge.channel]: challenge.contact,
      role: { $in: ["customer", "provider"] },
      status: "ACTIVE",
    });
    if (
      !user ||
      !challenge.deliveryEligible ||
      !hasContactProof(user, challenge.channel, demoDelivery()) ||
      (user.sessionVersion ?? 0) !== challenge.sessionVersion
    )
      fail(
        401,
        "This contact cannot be used for recovery. Verify it in Account settings, or contact support.",
      );
    if (challenge.portal === undefined) checkStoredLoginRole(user, true);
    else checkLoginPortal(user, challenge.portal, true);
    if (challenge.purpose === "recover")
      return res.json({
        recovery: await issuePasswordRecovery(res, user, challenge),
      });
    fail(400, "Use password followed by email verification to sign in.");
  });
  app.post("/api/auth/external", checkLimit, async (req, res) => {
    // External identity mapping, not a login-page selection, determines the local role.
    const identity = await verifyIdentity(req.body.idToken);
    if (!["register", "login", "link"].includes(req.body.action))
      fail(400, "Choose a valid sign-in action.");
    const linked = await ExternalIdentity.findOne({ uid: identity.uid });
    if (linked && linked.provider !== identity.provider)
      fail(403, "Use the external provider originally linked to this account.");
    if (req.body.action === "link") {
      await new Promise((resolve, reject) =>
        auth(req, res, (e) => (e ? reject(e) : resolve())),
      );
      const user = await User.findById(req.user._id).select("+passwordHash");
      if (user.role === "admin")
        fail(403, "Administrator sign-in methods are managed separately.");
      if (
        typeof req.body.currentPassword !== "string" ||
        !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))
      )
        fail(401, "Confirm your current GharSeva password before linking.");
      if (
        identity.provider === "apple.com" &&
        /@(?:privaterelay\.appleid\.com|private\.icloud\.com)$/.test(
          identity.contact,
        ) &&
        req.body.appleRelayConsent !== true
      )
        fail(
          400,
          "Consent is required before linking your Apple private relay identity.",
        );
      checkStoredLoginRole(user, true);
      if (linked && String(linked.user) !== String(user._id))
        fail(409, "This identity is already linked to a different account.");
      if (!linked)
        await ExternalIdentity.create({
          uid: identity.uid,
          provider: identity.provider,
          user: user._id,
        });
      if (
        identity.provider === "apple.com" &&
        /@(?:privaterelay\.appleid\.com|private\.icloud\.com)$/.test(
          identity.contact,
        )
      )
        await User.updateOne(
          { _id: user._id },
          { $set: { appleRelayConsentAt: new Date() } },
        );
      return res.json({ ok: true });
    }
    if (linked) {
      const user = await User.findOne({
        _id: linked.user,
        status: "ACTIVE",
        role: { $in: ["customer", "provider"] },
      });
      if (!user) fail(403, "This account is unavailable.");
      checkStoredLoginRole(user, true);
      await setSession(res, user, { req });
      return res.json({ user: safeUser(user) });
    }
    if (await User.exists({ email: identity.contact }))
      fail(
        409,
        "An account already uses this email. Sign in with its password, then link this sign-in method in Account settings.",
      );
    res.json({
      onboarding: true,
      identity: await issueSession(res, {
        channel: "email",
        contact: identity.contact,
        name: identity.name,
        mode: "live",
        externalUid: identity.uid,
        externalProvider: identity.provider,
      }),
    });
  });
  app.get("/api/registration/application", async (req, res) => {
    const session = await registrationSession(req, true);
    const a = await ProviderApplication.findOne({
      contactKey: contactKey(session.channel, session.contact),
      expiresAt: { $gt: new Date() },
      state: "DRAFT",
    });
    res.json(publicDraft(a, session));
  });
  app.put("/api/registration/application", saveLimit, async (req, res) => {
    if (!(await settings()).providerRegistration)
      fail(409, "Professional applications are temporarily paused.");
    const session = await registrationSession(req, true);
    if (req.body.saveConsent !== true)
      fail(
        400,
        "Choose to save your progress before saving an incomplete application.",
      );
    if (
      !Number.isInteger(req.body.step) ||
      req.body.step < 1 ||
      req.body.step > 4
    )
      fail(400, "Choose a valid application step.");
    const key = contactKey(session.channel, session.contact);
    await ProviderApplication.deleteOne({
      contactKey: key,
      state: "DRAFT",
      expiresAt: { $lte: new Date() },
    });
    const existing = await ProviderApplication.findOne({ contactKey: key });
    if (existing && existing.state !== "DRAFT")
      fail(
        409,
        "This application was already submitted. Sign in to manage it.",
      );
    if (existing && req.body.revision !== existing.revision)
      fail(
        409,
        "This application changed in another tab. Reload it before saving again.",
      );
    const update = {
      $set: {
        data: snapshot(req.body.data || {}, session),
        channel: session.channel,
        contact: session.contact,
        mode: session.mode,
        state: "DRAFT",
        step: req.body.step,
        saveConsent: true,
        followUpConsent: req.body.followUpConsent === true,
        lastActivityAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
      $inc: { revision: 1 },
    };
    if (!existing) update.$set.consentAt = new Date();
    const a = await ProviderApplication.findOneAndUpdate(
      existing
        ? { _id: existing._id, revision: existing.revision, state: "DRAFT" }
        : { contactKey: key },
      update,
      { upsert: !existing, returnDocument: "after", runValidators: true },
    );
    if (!a) fail(409, "The application changed. Reload before saving.");
    res.json(publicDraft(a, session));
  });
  app.delete("/api/registration/application", async (req, res) => {
    const s = await registrationSession(req, true);
    await ProviderApplication.deleteOne({
      contactKey: contactKey(s.channel, s.contact),
      state: "DRAFT",
    });
    res.json({ ok: true });
  });
  app.get("/api/admin/applications", auth, role("admin"), async (req, res) => {
    const filter = {};
    const states = [
      "DRAFT",
      "SUBMITTED",
      "NEEDS_CORRECTION",
      "APPROVED",
      "REJECTED",
      "WITHDRAWN",
    ];
    if (req.query.state === "INACTIVE") {
      filter.state = "DRAFT";
      filter.lastActivityAt = { $lt: new Date(Date.now() - 86400000) };
    } else if (req.query.state) {
      if (!states.includes(req.query.state))
        fail(400, "Choose a valid application filter.");
      filter.state = req.query.state;
    }
    if (req.query.q) {
      const q = String(req.query.q)
        .slice(0, 80)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter["data.name"] = new RegExp(q, "i");
    }
    const page = Math.min(
      10000,
      Math.max(1, Math.floor(Number(req.query.page) || 1)),
    );
    filter.$or = [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } },
    ];
    const [rows, total, existingIds] = await Promise.all([
      ProviderApplication.find(filter)
        .select("+contact")
        .populate("user", "name email mobile profile status")
        .sort({ lastActivityAt: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .lean(),
      ProviderApplication.countDocuments(filter),
      ProviderApplication.distinct("user"),
    ]);
    const items = rows.map((a) => {
      const incomplete = a.state === "DRAFT";
      const data = { ...a.data };
      if (incomplete) {
        delete data.email;
        delete data.mobile;
      }
      return {
        ...a,
        contact: incomplete && !a.followUpConsent ? masked(a) : a.contact,
        data,
        incomplete,
        inactive:
          incomplete &&
          Date.now() - new Date(a.lastActivityAt).getTime() > 86400000,
        checks: applicationChecks(a, a.user),
      };
    });
    const earlierRequests = await User.find({
      role: "provider",
      "profile.status": "PENDING",
      _id: { $nin: existingIds },
    })
      .select("name profile.category createdAt")
      .limit(100)
      .lean();
    res.json({
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / 20)),
      earlierRequests,
    });
  });
  app.patch(
    "/api/admin/applications/:id",
    auth,
    role("admin"),
    async (req, res) => {
      if (!mongoose.isValidObjectId(req.params.id))
        fail(404, "Application not found.");
      if (!Number.isInteger(req.body.revision) || req.body.revision < 0)
        fail(400, "Refresh the application before recording a decision.");
      const note = text(req.body.note, "Review note", 10, 500);
      const a = await ProviderApplication.findOneAndUpdate(
        {
          _id: req.params.id,
          revision: req.body.revision,
          $or: [
            { reviewLockUntil: { $exists: false } },
            { reviewLockUntil: { $lte: new Date() } },
          ],
        },
        { $set: { reviewLockUntil: new Date(Date.now() + 30000) } },
        { returnDocument: "after" },
      );
      if (!a)
        fail(
          409,
          "This application changed or is being reviewed. Refresh before recording a decision.",
        );
      let releaseIdentity = async () => {};
      try {
        if (a.expiresAt && a.expiresAt <= new Date())
          fail(404, "Application not found.");
        const action = req.body.action;
        if (action === "FOLLOW_UP") {
          if (!a.followUpConsent)
            fail(403, "This applicant has not permitted staff follow-up.");
        } else {
          if (
            !["APPROVED", "REJECTED", "NEEDS_CORRECTION"].includes(action) ||
            a.state === "DRAFT" ||
            !a.user
          )
            fail(400, "Only submitted applications can be reviewed.");
          const user = await User.findById(a.user);
          if (!user || user.role !== "provider")
            fail(404, "Professional account not found.");
          let document;
          if (action === "APPROVED") {
            document = await File.findOne({
              _id: { $in: user.profile.documents },
              owner: user._id,
              kind: "document",
            }).select("_id");
            if (!document)
              fail(400, "Review a supporting document before approval.");
            releaseIdentity = await identityApprovalGuard(user);
          }
          const changed = await User.findOneAndUpdate(
            {
              _id: user._id,
              name: user.name,
              ...(document ? { "profile.documents": document._id } : {}),
            },
            {
              $set: {
                "profile.status":
                  action === "APPROVED"
                    ? "APPROVED"
                    : action === "REJECTED"
                      ? "REJECTED"
                      : "PENDING",
              },
            },
          );
          if (!changed)
            fail(
              409,
              "The documents changed during review. Refresh and review again.",
            );
        }
        const updated = await ProviderApplication.findOneAndUpdate(
          { _id: a._id, revision: a.revision },
          {
            ...(action === "FOLLOW_UP" ? {} : { $set: { state: action } }),
            $inc: { revision: 1 },
            $push: { history: { action, note, actor: req.user._id } },
          },
          { returnDocument: "after" },
        );
        if (!updated)
          fail(
            409,
            "Another reviewer changed this application. Refresh to see its current state.",
          );
      } finally {
        await releaseIdentity();
        await ProviderApplication.updateOne(
          { _id: a._id },
          { $unset: { reviewLockUntil: "" } },
        );
      }
      res.json({ ok: true });
    },
  );
  app.get(
    "/api/provider/application",
    auth,
    role("provider"),
    async (req, res) => {
      const a = await ProviderApplication.findOne({ user: req.user._id });
      res.json(
        a
          ? {
              state: a.state,
              history: a.history.map((h) => ({
                action: h.action,
                note: h.note,
                at: h.at,
              })),
            }
          : null,
      );
    },
  );
}
