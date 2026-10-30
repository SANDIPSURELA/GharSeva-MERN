import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import multer from "multer";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import {
  File,
  User,
  ProviderIdentity,
  ProviderApplication,
  Category,
} from "./models.js";
import { canonicalCity } from "../../shared/cities.js";
import { auth, role, adminReview } from "./auth.js";
import { ownerImportedDemo } from "./faculty-showcase.js";
import { fail, text } from "./domain.js";
import { prepareIdentityImage, readIdentityImages } from "./identity-ocr.js";
import {
  compareIdentityNames,
  extractPrimaryName,
  containsFullIdentityNumber,
} from "./identity-name-check.js";
const unlocked = () => ({
  $or: [
    { reviewLockUntil: { $exists: false } },
    { reviewLockUntil: { $lte: new Date() } },
  ],
});
const validId = (v) => {
  if (!mongoose.isValidObjectId(v)) fail(404, "Verification record not found.");
  return v;
};
const revision = (v) => {
  const n = Number(v);
  if (v === "" || !Number.isInteger(n) || n < 0)
    fail(400, "Refresh the verification before making changes.");
  return n;
};
const key = () => {
  const configured = process.env.IDENTITY_STORAGE_KEY;
  if (configured && /^[a-f0-9]{64}$/i.test(configured))
    return Buffer.from(configured, "hex");
  if (configured || process.env.NODE_ENV === "production")
    fail(
      503,
      "Private document storage is not configured. Contact the administrator.",
    );
  if (!process.env.JWT_SECRET)
    fail(503, "Private document storage is not configured.");
  return createHash("sha256")
    .update(`gharseva-identity-v1:${process.env.JWT_SECRET}`)
    .digest();
};
export function encryptIdentity(data) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  return {
    data: Buffer.concat([cipher.update(data), cipher.final()]),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}
function decryptIdentity(file) {
  try {
    const cipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(file.iv, "hex"),
    );
    cipher.setAuthTag(Buffer.from(file.tag, "hex"));
    return Buffer.concat([cipher.update(file.data), cipher.final()]);
  } catch (e) {
    if (e.status) throw e;
    fail(
      503,
      "The private document could not be opened. Check the storage key or request a new upload.",
    );
  }
}
// Admin profile approval is independent of optional historical identity records.
export async function providerApprovalRequirements(user) {
  const issues = [];
  if (!user || user.role !== "provider")
    issues.push("No provider account is attached to this application.");
  else if (ownerImportedDemo(user))
    issues.push(
      "Fictional Faculty Demo profiles cannot be approved as real professionals.",
    );
  else if (user.status !== "ACTIVE")
    issues.push("The provider account must be active before approval.");
  if (!issues.length) {
    const p = user.profile || {};
    if (
      !user.name?.trim() ||
      !user.email ||
      !/^[6-9]\d{9}$/.test(user.mobile || "")
    )
      issues.push("Complete the provider's name, email and mobile number.");
    if (
      !canonicalCity(user.city) ||
      canonicalCity(user.city) !== canonicalCity(p.city)
    )
      issues.push("Choose a supported matching account and service city.");
    if (
      !p.area ||
      p.area.trim().length < 3 ||
      !p.bio ||
      p.bio.trim().length < 30 ||
      !Number.isFinite(p.price) ||
      p.price < 100 ||
      p.price > 50000
    )
      issues.push(
        "Complete the service area, description and valid starting price.",
      );
    if (
      !p.category ||
      !(await Category.exists({ slug: p.category, enabled: true }))
    )
      issues.push("Choose an enabled service category.");
  }
  return { ready: !issues.length, issues };
}
export async function identityApprovalGuard(user) {
  if (ownerImportedDemo(user))
    fail(
      409,
      "Fictional Faculty Demo profiles cannot be approved as real professionals.",
    );
  const exists = await ProviderIdentity.exists({
    provider: user._id,
    state: { $ne: "WITHDRAWN" },
  });
  if (!user.profile?.identityRequired && !exists) return async () => {};
  const record = await ProviderIdentity.findOneAndUpdate(
    {
      provider: user._id,
      state: "REVIEWED",
      accountName: user.name,
      evidenceExpiresAt: { $gt: new Date() },
      ...unlocked(),
    },
    { $set: { reviewLockUntil: new Date(Date.now() + 30000) } },
    { returnDocument: "after" },
  );
  if (!record)
    fail(
      409,
      "Complete the current optional identity document review before recording identity proof.",
    );
  const release = () =>
    ProviderIdentity.updateOne(
      { _id: record._id, revision: record.revision },
      { $unset: { reviewLockUntil: "" } },
    );
  const count = await File.countDocuments({
    _id: { $in: [record.front, record.back].filter(Boolean) },
    owner: user._id,
    kind: "identity",
    expiresAt: { $gt: new Date() },
  });
  if (count !== (record.back ? 2 : 1)) {
    await release();
    fail(
      409,
      "Verification evidence expired or changed. Request new images and review again.",
    );
  }
  return release;
}
export async function identityView(record) {
  if (!record) return null;
  const r = record.toObject ? record.toObject() : { ...record };
  delete r.reviewLockUntil;
  r.authenticity = "NOT_VERIFIED";
  r.evidenceExpired =
    !r.evidenceExpiresAt || new Date(r.evidenceExpiresAt) <= new Date();
  r.images = [
    ...[r.front]
      .filter(Boolean)
      .map((id) => ({ side: "front", url: `/api/identity/files/${id}` })),
    ...[r.back]
      .filter(Boolean)
      .map((id) => ({ side: "back", url: `/api/identity/files/${id}` })),
  ];
  delete r.front;
  delete r.back;
  return r;
}
export function mountProviderIdentity(app, { ocr = readIdentityImages } = {}) {
  const limit = rateLimit({
    windowMs: 15 * 60000,
    limit: 8,
    message: {
      message: "Please wait before uploading more verification images.",
    },
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 3 * 1024 * 1024,
      files: 2,
      fields: 10,
      fieldSize: 1000,
    },
  }).fields([
    { name: "front", maxCount: 1 },
    { name: "back", maxCount: 1 },
  ]);
  app.get("/api/provider/identity", auth, role("provider"), async (req, res) =>
    res.json({
      record: await identityView(
        await ProviderIdentity.findOne({ provider: req.user._id }),
      ),
      required: false,
      ocrEngine: "Local Tesseract English OCR",
      authenticity: "NOT_VERIFIED",
    }),
  );
  app.post(
    "/api/provider/identity",
    auth,
    role("provider"),
    limit,
    upload,
    async (req, res) => {
      if (!["AADHAAR_MASKED", "OTHER"].includes(req.body.documentType))
        fail(400, "Choose a document type.");
      if (req.body.consent !== "true")
        fail(
          400,
          "Consent is required to process and retain the private review images.",
        );
      const aadhaar = req.body.documentType === "AADHAAR_MASKED";
      if (aadhaar && req.body.maskedConfirmed !== "true")
        fail(
          400,
          "Confirm that Aadhaar numbers and unnecessary private details are masked before uploading.",
        );
      if (aadhaar && !req.files?.back?.[0])
        fail(400, "Upload both the front and back masked images.");
      const names = {
        firstName: text(req.body.firstName, "First / given name", 1, 60),
        middleName: req.body.middleName
          ? text(req.body.middleName, "Middle name", 1, 60)
          : "",
        lastName: req.body.lastName
          ? text(req.body.lastName, "Surname", 1, 60)
          : "",
      };
      if (Object.values(names).some((v) => v && !/^[\p{L} .'-]+$/u.test(v)))
        fail(400, "Use name letters, spaces, apostrophes or hyphens only.");
      const declared = Object.values(names).filter(Boolean).join(" ");
      if (declared.length > 100)
        fail(400, "The full name must be 100 characters or fewer.");
      const old = await ProviderIdentity.findOne({ provider: req.user._id });
      const rev = revision(req.body.revision);
      if (
        (old?.revision || 0) !== rev ||
        (old?.reviewLockUntil && old.reviewLockUntil > new Date())
      )
        fail(
          409,
          "Verification changed or is being reviewed. Refresh before uploading again.",
        );
      const front = await prepareIdentityImage(req.files?.front?.[0]),
        back = req.files?.back?.[0]
          ? await prepareIdentityImage(req.files.back[0])
          : null;
      let read;
      try {
        read = await ocr(front, back);
      } catch (e) {
        if (e.status) throw e;
        fail(
          503,
          "The local document reader could not finish. Please retry; no new images were retained.",
        );
      }
      // Raw OCR text, addresses, dates, ID numbers and original filenames are never saved.
      if (
        containsFullIdentityNumber(read.frontText) ||
        containsFullIdentityNumber(read.backText)
      )
        fail(
          400,
          "A full 12-digit number was detected. Mask it on both sides and upload again. No new images were retained.",
        );
      const extracted = extractPrimaryName(read.frontText, declared),
        check = {
          ...compareIdentityNames(declared, extracted, read.confidence),
          extractedName: extracted,
          ocrConfidence: Math.max(
            0,
            Math.min(100, Number(read.confidence) || 0),
          ),
          engine: "Tesseract English OCR + name-component rules",
        };
      const accountCheck = compareIdentityNames(
        req.user.name,
        extracted,
        read.confidence,
      );
      check.accountStatus = accountCheck.status;
      if (extracted && accountCheck.status !== "CONSISTENT") {
        if (check.status === "CONSISTENT") check.status = "REVIEW";
        check.reasons.unshift(
          "The name read from the document also needs comparison with the current registration name: " +
            req.user.name +
            ".",
        );
      }
      const expiresAt = new Date(Date.now() + 30 * 86400000),
        created = [];
      let committed = false;
      try {
        for (const [side, buffer] of [
          ["front", front],
          ["back", back],
        ])
          if (buffer)
            created.push(
              await File.create({
                owner: req.user._id,
                kind: "identity",
                name: `verification-${side}.png`,
                mime: "image/png",
                expiresAt,
                ...encryptIdentity(buffer),
              }),
            );
        const patch = {
          $set: {
            ...names,
            accountName: req.user.name,
            documentType: req.body.documentType,
            front: created[0]._id,
            back: created[1]?._id || null,
            consentAt: new Date(),
            maskedConfirmed: aadhaar,
            state: "SUBMITTED",
            evidenceExpiresAt: expiresAt,
            check,
          },
          $unset: { reviewedName: "", reviewedAt: "" },
          $inc: { revision: 1 },
          $push: {
            history: {
              action: "SUBMITTED",
              note: "Applicant consented and submitted private review images. Automated checks are advisory; administrator review is required.",
              actor: req.user._id,
            },
          },
        };
        const saved = await ProviderIdentity.findOneAndUpdate(
          {
            provider: req.user._id,
            ...(old
              ? { revision: rev, ...unlocked() }
              : { revision: { $exists: false } }),
          },
          patch,
          {
            upsert: !old,
            returnDocument: "after",
            runValidators: true,
            setDefaultsOnInsert: false,
          },
        );
        if (!saved)
          fail(
            409,
            "Verification changed while the reader worked. Refresh and try again.",
          );
        committed = true;
        // Replacement is atomic at the record. Old evidence is removed only after the new revision wins.
        if (old)
          await File.deleteMany({
            _id: { $in: [old.front, old.back].filter(Boolean) },
            owner: req.user._id,
            kind: "identity",
          });
        await ProviderApplication.updateOne(
          { user: req.user._id },
          {
            $push: {
              history: {
                action: "IDENTITY_SUBMITTED",
                note: "Private identity evidence submitted for a human document review.",
                actor: req.user._id,
              },
            },
            $inc: { revision: 1 },
          },
        );
        res.status(201).json({ record: await identityView(saved) });
      } catch (e) {
        if (!committed)
          await File.deleteMany({ _id: { $in: created.map((f) => f._id) } });
        if (e.code === 11000)
          fail(
            409,
            "Another upload changed the verification. Refresh and try again.",
          );
        throw e;
      }
    },
  );
  app.delete(
    "/api/provider/identity",
    auth,
    role("provider"),
    async (req, res) => {
      const r = await ProviderIdentity.findOneAndUpdate(
        {
          provider: req.user._id,
          revision: revision(req.body.revision),
          ...unlocked(),
        },
        {
          $set: { state: "WITHDRAWN" },
          $unset: {
            front: "",
            back: "",
            check: "",
            firstName: "",
            middleName: "",
            lastName: "",
            reviewedName: "",
            reviewedAt: "",
            consentAt: "",
          },
          $inc: { revision: 1 },
          $push: {
            history: {
              action: "WITHDRAWN",
              note: "Applicant removed the private review images.",
              actor: req.user._id,
            },
          },
        },
        { returnDocument: "before" },
      );
      if (!r)
        fail(
          409,
          "Verification changed or is being reviewed. Refresh before removing evidence.",
        );
      await File.deleteMany({
        _id: { $in: [r.front, r.back].filter(Boolean) },
        owner: req.user._id,
        kind: "identity",
      });
      res.json({ ok: true });
    },
  );
  app.get("/api/identity/files/:id", auth, async (req, res) => {
    const file = await File.findOne({
      _id: validId(req.params.id),
      kind: "identity",
      expiresAt: { $gt: new Date() },
      ...(req.user.role === "admin" ? {} : { owner: req.user._id }),
    }).select("+data +iv +tag");
    if (!file) fail(404, "Private image is unavailable or expired.");
    res
      .set({
        "Cache-Control": "no-store, private",
        "Content-Disposition": "inline; filename=verification.png",
        "X-Content-Type-Options": "nosniff",
      })
      .type("image/png")
      .send(decryptIdentity(file));
  });
  app.get("/api/admin/identities", auth, role("admin"), async (req, res) => {
    const state = req.query.state;
    if (
      state &&
      !["SUBMITTED", "NEEDS_CORRECTION", "REVIEWED", "WITHDRAWN"].includes(
        state,
      )
    )
      fail(400, "Choose a valid verification status.");
    const page = Math.max(
        1,
        Math.min(10000, Math.floor(Number(req.query.page) || 1)),
      ),
      filter = {
        ...(state ? { state } : {}),
        ...(req.query.provider
          ? { provider: validId(req.query.provider) }
          : {}),
      };
    const [records, total] = await Promise.all([
      ProviderIdentity.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .populate("provider", "name profile.status")
        .lean(),
      ProviderIdentity.countDocuments(filter),
    ]);
    res.json({
      items: records.map((r) => ({
        _id: r._id,
        provider: r.provider,
        state: r.state,
        check: r.check,
        updatedAt: r.updatedAt,
        revision: r.revision,
        evidenceExpired: r.evidenceExpiresAt <= new Date(),
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / 20)),
    });
  });
  app.get(
    "/api/admin/identities/:provider",
    auth,
    role("admin"),
    async (req, res) => {
      const user = await User.findOne({
        _id: validId(req.params.provider),
        role: "provider",
      }).select("name profile.status profile.identityRequired");
      if (!user) fail(404, "Professional account not found.");
      res.json({
        record: await identityView(
          await ProviderIdentity.findOne({ provider: user._id }),
        ),
        provider: user,
      });
    },
  );
  app.patch(
    "/api/admin/identities/:provider",
    auth,
    adminReview,
    async (req, res) => {
      if (!["REVIEWED", "NEEDS_CORRECTION"].includes(req.body.action))
        fail(400, "Choose a manual document review action.");
      const note = text(req.body.note, "Review reason", 10, 500);
      if (containsFullIdentityNumber(note))
        fail(400, "Do not include full identity numbers in review notes.");
      const filter = {
        provider: validId(req.params.provider),
        revision: revision(req.body.revision),
        state: { $ne: "WITHDRAWN" },
        ...unlocked(),
      };
      const record = await ProviderIdentity.findOne(filter);
      if (!record)
        fail(
          409,
          "This verification changed or is being reviewed. Refresh before recording a decision.",
        );
      const user = await User.findById(record.provider);
      if (!user) fail(404, "Professional account not found.");
      let reviewedName;
      if (req.body.action === "REVIEWED") {
        if (req.body.humanReviewed !== true)
          fail(
            400,
            "Confirm that you personally reviewed the evidence and name differences.",
          );
        reviewedName = text(
          req.body.reviewedName,
          "Name read by reviewer",
          2,
          100,
        );
        if (!/^[\p{L} .'-]+$/u.test(reviewedName))
          fail(
            400,
            "Enter the name only, without identity numbers or other details.",
          );
        if (record.accountName !== user.name)
          fail(
            409,
            "The account name changed. Request a fresh submission before completing review.",
          );
        const count = await File.countDocuments({
          _id: { $in: [record.front, record.back].filter(Boolean) },
          owner: user._id,
          kind: "identity",
          expiresAt: { $gt: new Date() },
        });
        if (
          record.evidenceExpiresAt <= new Date() ||
          count !== (record.back ? 2 : 1)
        )
          fail(409, "The images expired or changed. Ask for a new submission.");
      }
      const updated = await ProviderIdentity.findOneAndUpdate(
        filter,
        {
          $set: {
            state: req.body.action,
            ...(reviewedName ? { reviewedName, reviewedAt: new Date() } : {}),
          },
          ...(reviewedName
            ? {}
            : { $unset: { reviewedName: "", reviewedAt: "" } }),
          $inc: { revision: 1 },
          $push: {
            history: { action: req.body.action, note, actor: req.user._id },
          },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        fail(
          409,
          "Another reviewer changed this evidence. Refresh and review the current images.",
        );
      await ProviderApplication.updateOne(
        { user: user._id },
        {
          $push: {
            history: {
              action: `IDENTITY_${req.body.action}`,
              note,
              actor: req.user._id,
            },
          },
          $inc: { revision: 1 },
        },
      );
      res.json({ record: await identityView(updated) });
    },
  );
}
