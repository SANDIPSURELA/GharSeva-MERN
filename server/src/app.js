import { requireCity, cityFilter, bookingCity } from "./cities.js";
import { canonicalCity, supportedCities } from "../../shared/cities.js";
import { paymentPlanSnapshot } from "./billing-domain.js";
import {
  mountPaymentWebhook,
  mountPayments,
  requireDepositBeforeStart,
} from "./payments.js";
import { paymentOptions } from "./payment-gateway.js";
import {
  mountAccountInvitations,
  claimAccountInvitation,
  finishAccountInvitation,
  releaseAccountInvitation,
} from "./account-invitations.js";
import express from "express";
import { proxyHops } from "./deployment.js";
import {
  mountProviderIdentity,
  identityApprovalGuard,
} from "./provider-identity.js";
import { mountAssistant } from "./service-assistant.js";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import multer from "multer";
import mongoose from "mongoose";
import { randomInt, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import {
  User,
  Category,
  Booking,
  Review,
  Enquiry,
  File,
  Settings,
  ProviderApplication,
} from "./models.js";
import {
  fail,
  text,
  email,
  mobile,
  password,
  number,
  validateSchedule,
  transitions,
} from "./domain.js";
import {
  auth,
  optionalAuth,
  role,
  safeUser,
  setSession,
  clearSession,
  mountSessionRoutes,
} from "./auth.js";
import { mountPasswordLogin } from "./password-login.js";
import { publicWorkImageView, isWorkUpload } from "../../shared/work-images.js";
import {
  mountRegistration,
  verifyRegistrationEntry,
  finishRegistration,
  undoRegistration,
} from "./registration.js";
const id = (value) => {
  if (!mongoose.isValidObjectId(value)) fail(404, "Record not found.");
  return value;
};
const settings = () =>
  Settings.findOneAndUpdate(
    { key: "main" },
    { $setOnInsert: { key: "main" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
const code = () => String(randomInt(100000, 1000000));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
});
function uploadedMime(file, kind) {
  const b = file.buffer;
  let mime;
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    mime = "image/jpeg";
  else if (
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    mime = "image/png";
  else if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    mime = "image/webp";
  else if (b.toString("ascii", 0, 5) === "%PDF-") mime = "application/pdf";
  if (!mime || (kind !== "document" && mime === "application/pdf"))
    fail(400, "Use a valid JPG, PNG, WebP or PDF file.");
  if (kind !== "document" && b.length > 1024 * 1024)
    fail(400, "Images must be smaller than 1 MB.");
  return mime;
}
const hasSupportingDocument = (user) =>
  File.exists({
    _id: { $in: user.profile?.documents || [] },
    owner: user._id,
    kind: "document",
  });
const accountInput = (body) => ({
  name: text(body.name, "Name", 3, 80),
  email: email(body.email),
  mobile: mobile(body.mobile),
  city: requireCity(body.city),
});
async function profileInput(body) {
  const slugs =
    Array.isArray(body.categories) && !body.categories.length
      ? [body.category]
      : body.categories === undefined
        ? [body.category]
        : body.categories;
  if (
    !Array.isArray(slugs) ||
    !slugs.length ||
    slugs.length > 8 ||
    slugs.some((s) => typeof s !== "string")
  )
    fail(400, "Choose one to eight service categories.");
  const selected = [...new Set(slugs)];
  const categories = await Category.find({
    slug: { $in: selected },
    enabled: true,
  });
  if (categories.length !== selected.length)
    fail(400, "Choose available service categories.");
  return {
    category: selected[0],
    categories: selected,
    city: requireCity(body.city),
    area: text(body.area, "Service area", 3, 100),
    bio: text(body.bio, "Description", 30, 500),
    experience: number(body.experience, "Experience", 0, 50),
    price: number(body.price, "Starting price", 100, 50000),
    skills: Array.isArray(body.skills)
      ? body.skills.slice(0, 8).map((x) => text(x, "Skill", 2, 60))
      : ["General service"],
  };
}
export async function publicProviders(filter = {}) {
  const cats = await Category.find({ enabled: true }).lean();
  const users = await User.find({
    role: "provider",
    status: "ACTIVE",
    "profile.status": "APPROVED",
    $or: [
      { "profile.category": { $in: cats.map((x) => x.slug) } },
      { "profile.categories": { $in: cats.map((x) => x.slug) } },
    ],
    ...filter,
  }).lean();
  const ids = users.map((x) => x._id);
  const [ratings, jobs, portfolioFiles] = await Promise.all([
    Review.aggregate([
      { $match: { provider: { $in: ids }, hidden: false } },
      {
        $group: {
          _id: "$provider",
          rating: { $avg: "$rating" },
          reviews: { $sum: 1 },
        },
      },
    ]),
    Booking.aggregate([
      { $match: { provider: { $in: ids }, status: "COMPLETED" } },
      { $group: { _id: "$provider", completed: { $sum: 1 } } },
    ]),
    File.find({ owner: { $in: ids }, kind: "portfolio" })
      .select("_id owner kind")
      .lean(),
  ]);
  return users.map((u) => {
    const r = ratings.find((x) => String(x._id) === String(u._id));
    const j = jobs.find((x) => String(x._id) === String(u._id));
    const enabledCategories = [
      ...new Set([u.profile.category, ...(u.profile.categories || [])]),
    ].filter((slug) => cats.some((c) => c.slug === slug));
    return {
      _id: u._id,
      name: u.name,
      ...u.profile,
      city: canonicalCity(u.profile.city) || u.profile.city,
      ...publicWorkImageView(u, portfolioFiles),
      category: enabledCategories[0],
      categories: enabledCategories,
      categoryNames: enabledCategories.map(
        (slug) => cats.find((c) => c.slug === slug).name,
      ),
      documents: undefined,
      status: undefined,
      rating: r?.rating || 0,
      reviews: r?.reviews || 0,
      completed: j?.completed || 0,
      categoryName: cats.find((x) => x.slug === enabledCategories[0])?.name,
    };
  });
}
export async function bookingView(query, user) {
  const rows = await Booking.find(query)
    .select("+visitCode")
    .populate("customer", "name")
    .populate("provider", "name profile.photo")
    .sort({ createdAt: -1 })
    .lean();
  return rows.map((b) => {
    if (
      user.role !== "customer" ||
      String(b.customer?._id) !== String(user._id)
    )
      delete b.visitCode;
    delete b.otpAttempts;
    return b;
  });
}
export async function createCustomerBooking(user, input, extra = {}) {
  if (!(await settings()).bookingEnabled)
    fail(409, "Bookings are temporarily paused.");
  const provider = await User.findOne({
    _id: id(input.providerId),
    role: "provider",
    status: "ACTIVE",
    "profile.status": "APPROVED",
  });
  if (!provider) fail(404, "Provider not available.");
  const cat = await Category.findOne({
    slug: input.category || provider.profile.category,
    enabled: true,
  });
  if (!cat) fail(409, "This service category is unavailable.");
  if (
    ![
      provider.profile.category,
      ...(provider.profile.categories || []),
    ].includes(cat.slug)
  )
    fail(400, "This provider does not offer the selected service.");
  const city = bookingCity(user, input, provider);
  validateSchedule(input.date, input.time, provider.profile);
  if (!["STANDARD", "PRIORITY"].includes(input.urgency || "STANDARD"))
    fail(400, "Choose a valid priority.");
  if (
    extra.expectedPrice !== undefined &&
    extra.expectedPrice !== provider.profile.price
  )
    fail(
      409,
      "The starting estimate changed. Prepare and review a new booking before confirming.",
    );
  const b = await Booking.create({
    ...(extra.assistantDraft ? { assistantDraft: extra.assistantDraft } : {}),
    city,
    customer: user._id,
    paymentPlan: paymentPlanSnapshot(provider.profile.price),
    provider: provider._id,
    category: cat.slug,
    service: cat.name,
    date: input.date,
    time: input.time,
    address: text(input.address, "Address", 10, 500),
    notes: input.notes ? text(input.notes, "Notes", 1, 1000) : "",
    price: provider.profile.price,
    urgency: input.urgency || "STANDARD",
    visitCode: code(),
    timeline: [{ status: "PENDING" }],
  });
  return (await bookingView({ _id: b._id }, user))[0];
}
export function createApp({
  identityOcr,
  paymentGateway,
  identityServices = {},
} = {}) {
  const app = express();
  app.set("trust proxy", proxyHops());
  app.locals.draining = false;
  const origin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "https://apis.google.com",
            ...(paymentOptions().mode === "razorpay_test"
              ? ["https://checkout.razorpay.com"]
              : []),
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: [
            "'self'",
            "data:",
            ...(paymentOptions().mode === "razorpay_test"
              ? ["https://checkout.razorpay.com", "https://api.razorpay.com"]
              : []),
          ],
          connectSrc: [
            "'self'",
            "https://identitytoolkit.googleapis.com",
            "https://securetoken.googleapis.com",
            "https://www.googleapis.com",
            ...(paymentOptions().mode === "razorpay_test"
              ? ["https://api.razorpay.com"]
              : []),
          ],
          frameSrc: [
            "'self'",
            ...(paymentOptions().mode === "razorpay_test"
              ? ["https://api.razorpay.com", "https://checkout.razorpay.com"]
              : []),
            ...(process.env.FIREBASE_AUTH_DOMAIN &&
            /^[a-z0-9.-]+$/.test(process.env.FIREBASE_AUTH_DOMAIN)
              ? [`https://${process.env.FIREBASE_AUTH_DOMAIN}`]
              : []),
          ],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      strictTransportSecurity:
        process.env.NODE_ENV === "production" ? undefined : false,
      crossOriginResourcePolicy: { policy: "same-origin" },
    }),
  );
  app.use(cors({ origin, credentials: true }));
  // This exact webhook authenticates its raw body with the gateway signature.
  mountPaymentWebhook(app, { gateway: paymentGateway });
  app.use(express.json({ limit: "40kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("X-GharSeva") !== "1"
    )
      return next(
        Object.assign(new Error("Missing request verification header."), {
          status: 403,
        }),
      );
    if (req.get("Origin") && req.get("Origin") !== origin)
      return next(
        Object.assign(new Error("Origin not permitted."), { status: 403 }),
      );
    next();
  });
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many attempts. Try again in 15 minutes." },
  });
  const writeLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 80,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many requests. Try again shortly." },
  });
  mountRegistration(app, {
    settings,
    verifyIdentity: identityServices.verifyExternal,
  });
  mountPasswordLogin(app, {
    loginLimit,
    sendLoginCode: identityServices.deliverCode,
  });
  mountAccountInvitations(app, { settings });
  mountPayments(app, { gateway: paymentGateway });
  mountProviderIdentity(app, { ocr: identityOcr });
  mountAssistant(app, {
    settings,
    publicProviders,
    createCustomerBooking,
    bookingView,
  });
  app.get("/api/health/live", (req, res) => res.json({ ok: true }));
  app.get("/api/health", async (req, res) => {
    let ready = !app.locals.draining && mongoose.connection.readyState === 1;
    if (ready) {
      try {
        await mongoose.connection.db
          .admin()
          .command({ ping: 1 }, { timeoutMS: 1500 });
      } catch {
        ready = false;
      }
    }
    res.status(ready ? 200 : 503).json({
      ok: ready,
      database: ready ? "connected" : "unavailable",
    });
  });
  app.get("/api/config", async (req, res) => {
    const s = await settings();
    res.json({
      bookingEnabled: s.bookingEnabled,
      providerRegistration: s.providerRegistration,
    });
  });
  app.get("/api/categories", async (req, res) =>
    res.json(await Category.find({ enabled: true }).sort({ createdAt: 1 })),
  );
  app.get("/api/cities", (req, res) => res.json(supportedCities));
  app.get("/api/providers", optionalAuth, async (req, res) => {
    const city = req.query.city || req.user?.city;
    res.json(
      city
        ? await publicProviders({
            ...cityFilter(city),
            "profile.available": true,
          })
        : [],
    );
  });
  app.get("/api/providers/:id", async (req, res) => {
    const providers = await publicProviders({ _id: id(req.params.id) });
    if (!providers.length) fail(404, "This provider is not available.");
    const reviews = await Review.find({
      provider: providers[0]._id,
      hidden: false,
    })
      .populate("customer", "name")
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ ...providers[0], feedback: reviews });
  });
  app.get("/api/providers/:id/slots", async (req, res) => {
    const [p] = await publicProviders({ _id: id(req.params.id) });
    if (!p) fail(404, "Provider not found.");
    const date = String(req.query.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, "Choose a date.");
    const bookings = await Booking.find({ provider: p._id, date, active: true })
      .select("time")
      .lean();
    const slots = p.slots.filter((time) => {
      try {
        validateSchedule(date, time, p);
        return !bookings.some((b) => b.time === time);
      } catch {
        return false;
      }
    });
    res.json({ date, slots });
  });
  app.post(
    "/api/auth/register",
    loginLimit,
    upload.single("document"),
    async (req, res) => {
      let body = req.body;
      if (req.is("multipart/form-data")) {
        try {
          body = JSON.parse(req.body.data || "{}");
        } catch {
          fail(
            400,
            "The registration details could not be read. Please try again.",
          );
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          fail(400, "Enter valid registration details.");
      }
      const roleName = body.role;
      if (!["customer", "provider"].includes(roleName))
        fail(400, "Choose customer or provider.");
      if (roleName === "provider" && !(await settings()).providerRegistration)
        fail(409, "Provider registration is temporarily paused.");
      if (body.terms !== true) fail(400, "Please accept the terms.");
      if (roleName === "provider" && !req.file)
        fail(
          400,
          "Upload a supporting PDF or image so the administrator can review your provider profile.",
        );
      if (roleName === "customer" && req.file)
        fail(
          400,
          "Supporting documents are only needed for provider accounts.",
        );
      const mime = req.file ? uploadedMime(req.file, "document") : null;
      const data = accountInput(body);
      const identity = await verifyRegistrationEntry(req, body);
      const hash = await bcrypt.hash(password(body.password), 12);
      const profile =
        roleName === "provider" ? await profileInput(body) : undefined;
      if (profile)
        profile.identityRequired =
          Boolean(body.invitationToken) ||
          body.identityWorkflow === true ||
          process.env.REQUIRE_PROVIDER_IDENTITY === "true" ||
          process.env.NODE_ENV === "production";
      const userId = new mongoose.Types.ObjectId();
      let document;
      let user;
      const invitation = await claimAccountInvitation(body, identity, userId);
      try {
        if (req.file) {
          document = await File.create({
            owner: userId,
            kind: "document",
            name: req.file.originalname.slice(0, 100),
            mime,
            data: req.file.buffer,
          });
          profile.documents = [document._id];
        }
        user = await User.create({
          _id: userId,
          ...data,
          passwordHash: hash,
          role: roleName,
          termsAcceptedAt: new Date(),
          ...(identity?.externalProvider === "apple.com" &&
          /@(?:privaterelay\.appleid\.com|private\.icloud\.com)$/.test(
            identity.contact,
          )
            ? { appleRelayConsentAt: new Date() }
            : {}),
          ...(identity
            ? {
                verification: {
                  [identity.channel]: { at: new Date(), mode: identity.mode },
                },
              }
            : {}),
          profile,
        });
        await finishRegistration(req, res, user, body, identity);
        await finishAccountInvitation(invitation, user._id);
      } catch (e) {
        if (user) await undoRegistration(user._id);
        if (document) await File.deleteOne({ _id: document._id });
        await releaseAccountInvitation(invitation, userId);
        throw e;
      }
      await setSession(res, user, { req });
      res.status(201).json(safeUser(user));
    },
  );
  mountSessionRoutes(app);
  app.post(
    "/api/provider/review-request",
    auth,
    role("provider"),
    writeLimit,
    async (req, res) => {
      if (req.user.profile.status === "APPROVED")
        fail(409, "Your profile is already approved.");
      if (!(await hasSupportingDocument(req.user)))
        fail(
          400,
          "Upload a supporting document in Photos & documents before requesting review.",
        );
      req.user.profile.status = "PENDING";
      await req.user.save();
      await ProviderApplication.updateOne(
        { user: req.user._id },
        {
          $set: { state: "SUBMITTED", lastActivityAt: new Date() },
          $inc: { revision: 1 },
          $push: {
            history: {
              action: "RESUBMITTED",
              note: "Applicant updated their supporting information and requested another review.",
              actor: req.user._id,
            },
          },
        },
      );
      res.json(safeUser(req.user));
    },
  );
  mountPasswordLogin(app, {
    loginLimit,
    sendLoginCode: identityServices.deliverCode,
    purpose: "admin_reauth",
  });
  app.get("/api/auth/me", auth, (req, res) => res.json(safeUser(req.user)));
  app.patch(
    "/api/auth/me/city",
    auth,
    role("customer", "provider"),
    async (req, res) => {
      req.user.city = requireCity(req.body.city);
      if (req.user.role === "provider")
        req.user.set("profile.city", req.user.city);
      await req.user.save();
      if (req.user.role === "provider")
        await ProviderApplication.updateOne(
          { user: req.user._id },
          { $set: { "data.city": req.user.city }, $inc: { revision: 1 } },
        );
      res.json(safeUser(req.user));
    },
  );
  app.patch(
    "/api/auth/me",
    auth,
    role("customer", "provider", "admin"),
    async (req, res) => {
      const data = accountInput(req.body);
      const contactChanged =
        data.email !== req.user.email || data.mobile !== req.user.mobile;
      if (contactChanged) req.user.$inc("loginRevision", 1);
      if (data.email !== req.user.email)
        req.user.set("verification.email", undefined);
      if (data.mobile !== req.user.mobile)
        req.user.set("verification.mobile", undefined);
      Object.assign(req.user, data);
      if (Array.isArray(req.body.addresses)) {
        if (req.body.addresses.length > 10)
          fail(400, "Save up to 10 addresses.");
        req.user.addresses = req.body.addresses.map((a) => ({
          label: text(a.label, "Address label", 2, 30),
          address: text(a.address, "Address", 10, 500),
        }));
      }
      if (req.user.role === "provider" && req.body.profile) {
        const input = await profileInput(req.body.profile);
        Object.assign(req.user.profile, input);
        if (req.body.profile.available !== undefined)
          req.user.profile.available = Boolean(req.body.profile.available);
        if (req.body.profile.days) {
          const days = req.body.profile.days;
          if (
            !Array.isArray(days) ||
            days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
          )
            fail(400, "Choose valid working days.");
          req.user.profile.days = [...new Set(days)];
        }
        if (req.body.profile.slots) {
          const slots = req.body.profile.slots;
          if (
            !Array.isArray(slots) ||
            slots.length > 12 ||
            slots.some(
              (s) =>
                typeof s !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s),
            )
          )
            fail(400, "Choose valid time slots.");
          req.user.profile.slots = [...new Set(slots)].sort();
        }
      }
      if (req.user.role === "provider") {
        if (req.body.profile) req.user.city = req.user.profile.city;
        else req.user.profile.city = req.user.city;
      }
      await req.user.save();
      if (req.user.role === "provider")
        await ProviderApplication.updateOne(
          { user: req.user._id },
          {
            $set: {
              data: {
                name: req.user.name,
                email: req.user.email,
                mobile: req.user.mobile,
                city: req.user.city,
                categories: req.user.profile.categories?.length
                  ? req.user.profile.categories
                  : [req.user.profile.category],
                area: req.user.profile.area,
                bio: req.user.profile.bio,
                experience: req.user.profile.experience,
                price: req.user.profile.price,
              },
              lastActivityAt: new Date(),
            },
            $inc: { revision: 1 },
          },
        );

      res.json(safeUser(req.user));
    },
  );
  app.post(
    "/api/auth/change-password",
    auth,
    role("customer", "provider", "admin"),
    loginLimit,
    async (req, res) => {
      const user = await User.findById(req.user._id).select("+passwordHash");
      if (
        typeof req.body.currentPassword !== "string" ||
        !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))
      )
        fail(400, "Current password is incorrect.");
      const passwordHash = await bcrypt.hash(
        password(req.body.newPassword),
        12,
      );
      const changed = await User.updateOne(
        { _id: user._id, passwordHash: user.passwordHash },
        { $set: { passwordHash }, $inc: { sessionVersion: 1 } },
      );
      if (!changed.matchedCount)
        fail(
          409,
          "Your password changed during this request. Please sign in again.",
        );
      clearSession(res);
      res.json({ ok: true, message: "Password changed. Please log in again." });
    },
  );
  app.post("/api/favourites/:id", auth, role("customer"), async (req, res) => {
    const [p] = await publicProviders({ _id: id(req.params.id) });
    if (!p) fail(404, "Provider not found.");
    const has = req.user.favourites.some((x) => String(x) === req.params.id);
    await User.updateOne(
      { _id: req.user._id },
      has
        ? { $pull: { favourites: p._id } }
        : { $addToSet: { favourites: p._id } },
    );
    res.json(safeUser(await User.findById(req.user._id)));
  });
  app.post(
    "/api/files",
    auth,
    role("provider"),
    writeLimit,
    upload.single("file"),
    async (req, res) => {
      const kind = req.body.kind;
      if (!["photo", "portfolio", "document"].includes(kind) || !req.file)
        fail(400, "Choose an image or document.");
      const f = req.file;
      const b = f.buffer;
      const mime = uploadedMime(f, kind);
      if (kind === "document" && req.user.profile.documents.length >= 5)
        fail(400, "Upload up to five documents.");
      if (
        kind === "portfolio" &&
        req.user.profile.portfolio.filter(isWorkUpload).length >= 6
      )
        fail(400, "Upload up to six work photos.");
      const file = await File.create({
        owner: req.user._id,
        kind,
        name: f.originalname.slice(0, 100),
        mime,
        data: b,
      });
      const url = `/api/files/${file._id}`;
      if (kind === "photo") req.user.profile.photo = url;
      if (kind === "portfolio") req.user.profile.portfolio.unshift(url);
      if (kind === "document") req.user.profile.documents.push(file._id);
      try {
        await req.user.save();
      } catch (e) {
        await file.deleteOne();
        throw e;
      }
      res.status(201).json({
        file: { _id: file._id, url, name: file.name, kind },
        user: safeUser(req.user),
      });
    },
  );
  app.get("/api/files/:id", async (req, res, next) => {
    const file = await File.findById(id(req.params.id)).select("+data");
    if (!file) fail(404, "File not found.");
    if (file.kind === "identity")
      fail(404, "Use the private verification viewer.");
    if (file.kind === "document") {
      res.set("Cache-Control", "no-store, private");
      return auth(req, res, async (error) => {
        if (error) return next(error);
        try {
          if (
            req.user.role !== "admin" &&
            String(req.user._id) !== String(file.owner)
          )
            fail(403, "This document is private.");
          res.set(
            "Content-Disposition",
            `attachment; filename="document-${file._id}${{ "application/pdf": ".pdf", "image/png": ".png", "image/webp": ".webp", "image/jpeg": ".jpg" }[file.mime] || ""}"`,
          );
          res.type(file.mime).send(file.data);
        } catch (e) {
          next(e);
        }
      });
    }
    res.type(file.mime).send(file.data);
  });
  app.delete("/api/files/:id", auth, role("provider"), async (req, res) => {
    const file = await File.findOne({
      _id: id(req.params.id),
      owner: req.user._id,
    });
    if (!file) fail(404, "File not found.");
    if (file.kind === "identity")
      fail(403, "Manage verification evidence from the identity page.");
    if (file.kind === "document" && req.user.profile.status === "APPROVED") {
      const otherDocument = await File.exists({
        _id: { $in: req.user.profile.documents, $ne: file._id },
        owner: req.user._id,
        kind: "document",
      });
      if (!otherDocument)
        fail(
          409,
          "Upload a replacement document before removing the last document from an approved profile.",
        );
    }
    if (file.kind === "document") {
      const updated = await User.findOneAndUpdate(
        {
          _id: req.user._id,
          $or: [
            { "profile.status": { $ne: "APPROVED" } },
            { "profile.documents.1": { $exists: true } },
          ],
        },
        { $pull: { "profile.documents": file._id } },
        { returnDocument: "after" },
      );
      if (!updated)
        fail(
          409,
          "Upload a replacement document before removing the last document from an approved profile.",
        );
      await file.deleteOne();
      return res.json(safeUser(updated));
    }
    const url = `/api/files/${file._id}`;
    if (req.user.profile.photo === url) req.user.profile.photo = "";
    req.user.profile.portfolio = req.user.profile.portfolio.filter(
      (x) => x !== url,
    );
    await req.user.save();
    await file.deleteOne();
    res.json(safeUser(req.user));
  });
  app.get("/api/bookings", auth, async (req, res) => {
    let filter = {};
    if (req.user.role === "customer") filter = { customer: req.user._id };
    if (req.user.role === "provider") filter = { provider: req.user._id };
    res.json(await bookingView(filter, req.user));
  });
  app.post(
    "/api/bookings",
    auth,
    role("customer"),
    writeLimit,
    async (req, res) => {
      res.status(201).json(await createCustomerBooking(req.user, req.body));
    },
  );
  app.patch(
    "/api/bookings/:id/schedule",
    auth,
    role("customer"),
    writeLimit,
    async (req, res) => {
      const b = await Booking.findOne({
        _id: id(req.params.id),
        customer: req.user._id,
      });
      if (!b) fail(404, "Booking not found.");
      if (!["PENDING", "ACCEPTED"].includes(b.status))
        fail(409, "This booking can no longer be rescheduled.");
      const provider = await User.findById(b.provider);
      if (
        !provider ||
        provider.status !== "ACTIVE" ||
        provider.profile.status !== "APPROVED"
      )
        fail(409, "Provider is unavailable.");
      if (
        !(await settings()).bookingEnabled ||
        !(await Category.exists({ slug: b.category, enabled: true }))
      )
        fail(409, "Bookings for this service are paused.");
      validateSchedule(req.body.date, req.body.time, provider.profile);
      const updated = await Booking.findOneAndUpdate(
        { _id: b._id, status: b.status },
        {
          $set: {
            date: req.body.date,
            time: req.body.time,
            status: "PENDING",
            visitCode: code(),
            otpAttempts: 0,
          },
          $push: { timeline: { status: "PENDING", at: new Date() } },
        },
        { returnDocument: "after", runValidators: true },
      );
      if (!updated) fail(409, "Booking changed. Refresh and try again.");
      res.json((await bookingView({ _id: b._id }, req.user))[0]);
    },
  );
  app.patch("/api/bookings/:id/status", auth, writeLimit, async (req, res) => {
    const b = await Booking.findById(id(req.params.id)).select("+visitCode");
    if (!b) fail(404, "Booking not found.");
    const status = req.body.status;
    const owner = String(b.customer) === String(req.user._id);
    const provider = String(b.provider) === String(req.user._id);
    if (req.user.role === "customer") {
      if (!owner) fail(403, "This is not your booking.");
      if (status !== "CANCELLED" || !["PENDING", "ACCEPTED"].includes(b.status))
        fail(409, "Only pending or accepted bookings can be cancelled.");
    } else if (req.user.role === "provider") {
      if (!provider) fail(403, "This is not your booking.");
      if (req.user.profile.status !== "APPROVED")
        fail(403, "Your provider profile is awaiting approval.");
      if (!transitions[b.status]?.includes(status))
        fail(409, "This status transition is not allowed.");
      if (status === "IN_PROGRESS") {
        await requireDepositBeforeStart(b, { gateway: paymentGateway });
        if (b.otpAttempts >= 5)
          fail(
            429,
            "Code locked. Ask the customer to refresh their visit code.",
          );
        const input = String(req.body.code || "");
        const expected = b.visitCode || "";
        if (
          !/^\d{6}$/.test(input) ||
          input.length !== expected.length ||
          !timingSafeEqual(Buffer.from(input), Buffer.from(expected))
        ) {
          await Booking.updateOne(
            { _id: b._id, status: b.status },
            { $inc: { otpAttempts: 1 } },
          );
          fail(
            400,
            "Visit code is incorrect. Ask the customer for their six-digit code.",
          );
        }
      }
    } else
      fail(
        403,
        "Only the assigned customer or provider can change booking status.",
      );
    const updated = await Booking.findOneAndUpdate(
      {
        _id: b._id,
        status: b.status,
        ...(status === "IN_PROGRESS" && b.paymentPlan
          ? b.billing?.revision || 0
            ? { "billing.revision": b.billing.revision }
            : {
                $or: [
                  { "billing.revision": 0 },
                  { "billing.revision": { $exists: false } },
                ],
              }
          : {}),
      },
      {
        $set: {
          status,
          active: !["CANCELLED", "REJECTED", "COMPLETED"].includes(status),
          ...(status === "IN_PROGRESS"
            ? { visitCode: "", otpAttempts: 0 }
            : {}),
        },
        $push: { timeline: { status, at: new Date() } },
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) fail(409, "Booking changed. Refresh and try again.");
    res.json((await bookingView({ _id: b._id }, req.user))[0]);
  });
  app.post(
    "/api/bookings/:id/visit-code",
    auth,
    role("customer"),
    writeLimit,
    async (req, res) => {
      const b = await Booking.findOneAndUpdate(
        {
          _id: id(req.params.id),
          customer: req.user._id,
          status: { $in: ["PENDING", "ACCEPTED", "ON_THE_WAY"] },
        },
        { $set: { visitCode: code(), otpAttempts: 0 } },
        { returnDocument: "after" },
      );
      if (!b) fail(404, "Eligible booking not found.");
      res.json((await bookingView({ _id: b._id }, req.user))[0]);
    },
  );
  app.get("/api/reviews/mine", auth, (req, res, next) =>
    Review.find(
      req.user.role === "provider"
        ? { provider: req.user._id }
        : { customer: req.user._id },
    )
      .populate("customer", "name")
      .populate("provider", "name")
      .sort({ createdAt: -1 })
      .then((rows) => res.json(rows))
      .catch(next),
  );
  app.post(
    "/api/reviews",
    auth,
    role("customer"),
    writeLimit,
    async (req, res) => {
      const b = await Booking.findOne({
        _id: id(req.body.bookingId),
        customer: req.user._id,
        status: "COMPLETED",
      });
      if (!b) fail(400, "Review a completed booking from your own account.");
      const rating = number(req.body.rating, "Rating", 1, 5);
      if (!Number.isInteger(rating)) fail(400, "Use a whole-star rating.");
      res.status(201).json(
        await Review.create({
          booking: b._id,
          customer: req.user._id,
          provider: b.provider,
          rating,
          feedback: text(req.body.feedback, "Review", 10, 1000),
        }),
      );
    },
  );
  app.post("/api/enquiries", writeLimit, async (req, res) =>
    res.status(201).json(
      await Enquiry.create({
        name: text(req.body.name, "Name", 3, 80),
        email: email(req.body.email),
        mobile: mobile(req.body.mobile),
        subject: text(req.body.subject, "Subject", 3, 100),
        message: text(req.body.message, "Message", 20, 2000),
      }),
    ),
  );
  app.get("/api/admin/overview", auth, role("admin"), async (req, res) => {
    const [users, categories, bookings, reviews, enquiries, config] =
      await Promise.all([
        User.find().sort({ createdAt: -1 }).lean(),
        Category.find().lean(),
        bookingView({}, req.user),
        Review.find()
          .populate("customer", "name")
          .populate("provider", "name")
          .sort({ createdAt: -1 })
          .lean(),
        Enquiry.find().sort({ createdAt: -1 }).lean(),
        settings(),
      ]);
    const completed = bookings.filter((b) => b.status === "COMPLETED");
    res.json({
      users: users.map(safeUser),
      categories,
      bookings,
      reviews,
      enquiries,
      settings: config,
      stats: {
        customers: users.filter((x) => x.role === "customer").length,
        providers: users.filter((x) => x.role === "provider").length,
        pending: users.filter((x) => x.profile?.status === "PENDING").length,
        completed: completed.length,
        serviceValue: completed.reduce((sum, b) => sum + b.price, 0),
      },
    });
  });
  app.patch("/api/admin/users/:id", auth, role("admin"), async (req, res) => {
    const u = await User.findById(id(req.params.id));
    let supportingDocument;
    if (!u || u.role === "admin")
      fail(400, "Administrator accounts cannot be changed here.");
    if (req.body.status !== undefined) {
      if (!["ACTIVE", "SUSPENDED"].includes(req.body.status))
        fail(400, "Invalid account status.");
      u.status = req.body.status;
    }
    if (req.body.approval !== undefined) {
      if (
        u.role !== "provider" ||
        !["APPROVED", "REJECTED", "PENDING"].includes(req.body.approval)
      )
        fail(400, "Invalid provider approval.");
      if (req.body.approval === "APPROVED") {
        supportingDocument = await hasSupportingDocument(u);
        if (!supportingDocument)
          fail(
            400,
            "A provider must upload a supporting document before approval. They can sign in and use Photos & documents to upload it.",
          );
      }
      u.profile.status = req.body.approval;
    }
    const releaseIdentity =
      req.body.approval === "APPROVED"
        ? await identityApprovalGuard(u)
        : async () => {};
    try {
      const changes = {};
      if (req.body.status !== undefined) changes.status = u.status;
      if (req.body.approval !== undefined)
        changes["profile.status"] = u.profile.status;
      if (!Object.keys(changes).length) return res.json(safeUser(u));
      const filter = { _id: u._id, name: u.name };
      if (supportingDocument)
        filter["profile.documents"] = supportingDocument._id;
      const updated = await User.findOneAndUpdate(
        filter,
        {
          $set: changes,
          ...(req.body.status !== undefined
            ? { $inc: { sessionVersion: 1 } }
            : {}),
        },
        { returnDocument: "after", runValidators: true },
      );
      if (!updated)
        fail(
          409,
          "The supporting documents changed during review. Refresh and review the current document before approving.",
        );
      if (req.body.approval !== undefined)
        await ProviderApplication.updateOne(
          { user: u._id },
          {
            $set: {
              state:
                req.body.approval === "PENDING"
                  ? "SUBMITTED"
                  : req.body.approval,
            },
            $inc: { revision: 1 },
            $push: {
              history: {
                action: req.body.approval,
                note: "Administrator updated the provider approval from the account panel.",
                actor: req.user._id,
              },
            },
          },
        );
      res.json(safeUser(updated));
    } finally {
      await releaseIdentity();
    }
  });
  app.post("/api/admin/categories", auth, role("admin"), async (req, res) => {
    const name = text(req.body.name, "Category name", 3, 70);
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) fail(400, "Use an English category name.");
    res.status(201).json(
      await Category.create({
        name,
        slug,
        description: text(req.body.description, "Description", 5, 200),
        price: number(req.body.price, "Price", 100, 50000),
        image: "/images/professional.jpg",
      }),
    );
  });
  app.patch(
    "/api/admin/categories/:id",
    auth,
    role("admin"),
    async (req, res) => {
      const c = await Category.findById(id(req.params.id));
      if (!c) fail(404, "Category not found.");
      if (req.body.name !== undefined)
        c.name = text(req.body.name, "Name", 3, 70);
      if (req.body.price !== undefined)
        c.price = number(req.body.price, "Price", 100, 50000);
      if (req.body.enabled !== undefined) c.enabled = Boolean(req.body.enabled);
      await c.save();
      res.json(c);
    },
  );
  app.patch("/api/admin/reviews/:id", auth, role("admin"), async (req, res) => {
    const r = await Review.findByIdAndUpdate(
      id(req.params.id),
      { $set: { hidden: Boolean(req.body.hidden) } },
      { returnDocument: "after" },
    );
    if (!r) fail(404, "Review not found.");
    res.json(r);
  });
  app.patch(
    "/api/admin/enquiries/:id",
    auth,
    role("admin"),
    async (req, res) => {
      if (!["OPEN", "RESOLVED"].includes(req.body.status))
        fail(400, "Invalid enquiry status.");
      const e = await Enquiry.findByIdAndUpdate(
        id(req.params.id),
        { $set: { status: req.body.status } },
        { returnDocument: "after" },
      );
      if (!e) fail(404, "Enquiry not found.");
      res.json(e);
    },
  );
  app.patch("/api/admin/settings", auth, role("admin"), async (req, res) => {
    const s = await settings();
    if (req.body.bookingEnabled !== undefined)
      s.bookingEnabled = Boolean(req.body.bookingEnabled);
    if (req.body.providerRegistration !== undefined)
      s.providerRegistration = Boolean(req.body.providerRegistration);
    if (req.body.commission !== undefined)
      s.commission = number(req.body.commission, "Commission", 0, 30);
    await s.save();
    res.json(s);
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ message: "API endpoint not found." }),
  );
  const dist = fileURLToPath(new URL("../../client/dist/", import.meta.url));
  if (existsSync(dist)) {
    app.use(
      "/assets",
      express.static(`${dist}/assets`, { maxAge: "1y", immutable: true }),
    );
    app.use("/assets", (req, res) =>
      res.status(404).json({ message: "Asset not found." }),
    );
    app.use(
      express.static(dist, {
        setHeaders: (res) => res.setHeader("Cache-Control", "no-cache"),
      }),
    );
    app.get("/{*path}", (req, res) => {
      res.set("Cache-Control", "no-cache");
      res.sendFile(`${dist}/index.html`);
    });
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const duplicate = err.code === 11000;
    const status = duplicate
      ? 409
      : err.status ||
        (["ValidationError", "CastError"].includes(err.name)
          ? 400
          : err instanceof multer.MulterError
            ? 400
            : 500);
    let message = err.message;
    if (err instanceof multer.MulterError)
      message =
        err.code === "LIMIT_FILE_SIZE"
          ? "The file is too large. Supporting documents must be 3 MB or smaller."
          : "Choose one file in the correct upload field and try again.";
    if (duplicate) {
      const fields = Object.keys(err.keyPattern || {});
      message = fields.includes("provider")
        ? "That appointment slot is already booked. Choose another."
        : fields.includes("booking")
          ? "You have already reviewed this booking."
          : "This email, mobile number or category already exists.";
    }
    if (status === 500) {
      console.error(err);
      message = "The server could not complete this request. Please try again.";
    }
    res.status(status).json({
      message,
      ...(typeof err.code === "string" &&
      [
        "SESSION_CONTEXT_CHANGED",
        "REAUTH_REQUIRED",
        "SESSION_EXPIRED",
        "LEGACY_SESSION",
      ].includes(err.code)
        ? { code: err.code }
        : {}),
    });
  });
  return app;
}
