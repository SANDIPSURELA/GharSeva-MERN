import mongoose from "mongoose";
import { User, ProviderApplication } from "./models.js";
import { fail, text } from "./domain.js";
import { ownerImportedDemo } from "./faculty-showcase.js";
import { canonicalCity } from "../../shared/cities.js";

// Approval is an administrative decision, not a profile-completeness check.
export async function providerApprovalRequirements(user) {
  const issues = [];
  if (!user || user.role !== "provider")
    issues.push("No provider account is attached to this application.");
  else if (ownerImportedDemo(user))
    issues.push(
      "Fictional Faculty Demo profiles cannot be approved as real professionals.",
    );
  return { ready: issues.length === 0, issues };
}

// Search and booking readiness is independent of approval. Never fill missing data.
export function providerDiscoveryReadiness(user, categories) {
  const p = user?.profile || {},
    issues = [];
  if (
    user?.role !== "provider" ||
    user.status !== "ACTIVE" ||
    p.status !== "APPROVED" ||
    ownerImportedDemo(user)
  )
    issues.push(
      "An active, approved real-provider account is required for customer discovery.",
    );
  if (!canonicalCity(p.city)) issues.push("Choose a supported service city.");
  const slugs = [p.category, ...(p.categories || [])];
  if (!categories.some((c) => c.enabled && slugs.includes(c.slug)))
    issues.push("Choose an enabled service category.");
  if (
    !Number.isFinite(p.price) ||
    p.price < 100 ||
    p.price > 50000 ||
    Math.abs(p.price * 100 - Math.round(p.price * 100)) > 0.000001
  )
    issues.push(
      "Enter a valid starting price with at most two decimal places.",
    );
  if (
    !p.available ||
    !Array.isArray(p.days) ||
    !p.days.length ||
    p.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
    !Array.isArray(p.slots) ||
    !p.slots.length ||
    p.slots.some((s) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(s))
  )
    issues.push("Set availability, working days and appointment slots.");
  return {
    ready: issues.length === 0,
    issues,
    message: issues.length
      ? "Complete service details to appear in searches."
      : "Your service profile is ready for customer searches.",
  };
}

// Both admin entry points share the existing application revision/lease mechanism.
// A retry after a partial write completes the application without rewriting the
// provider's original approver/date or adding a second identical audit decision.
export async function reviewProviderApplication({
  applicationId,
  providerId,
  revision,
  action,
  note,
  actor,
}) {
  if (
    !["APPROVED", "REJECTED", "NEEDS_CORRECTION", "FOLLOW_UP"].includes(action)
  )
    fail(400, "Choose a valid application decision.");
  if (!mongoose.isValidObjectId(applicationId || providerId))
    fail(404, "Application not found.");
  let a;
  if (applicationId) a = await ProviderApplication.findById(applicationId);
  else {
    const rows = await ProviderApplication.find({ user: providerId }).limit(2);
    if (rows.length > 1)
      fail(
        409,
        "Open the exact request in Registration requests before deciding.",
      );
    a = rows[0];
  }
  if (!a || (a.expiresAt && a.expiresAt <= new Date()))
    fail(404, "Application not found.");
  if (a.reviewLockUntil && a.reviewLockUntil > new Date())
    fail(409, "This application is being reviewed. Refresh before deciding.");
  const decision = ["APPROVED", "REJECTED"].includes(action);
  const suppliedNote = typeof note === "string" ? note.trim() : note;
  const auditNote = text(
    suppliedNote == null || suppliedNote === ""
      ? decision
        ? `Administrator ${action.toLowerCase()} the provider application.`
        : ""
      : suppliedNote,
    "Decision note",
    decision ? 1 : 10,
    500,
  );
  let user;
  const target = action === "NEEDS_CORRECTION" ? "PENDING" : action;
  if (action === "FOLLOW_UP") {
    if (!a.followUpConsent)
      fail(403, "This applicant has not permitted staff follow-up.");
  } else {
    if (
      !["SUBMITTED", "NEEDS_CORRECTION", "APPROVED", "REJECTED"].includes(
        a.state,
      ) ||
      !a.user
    )
      fail(
        400,
        "Only existing submitted provider applications can be reviewed.",
      );
    user = await User.findById(a.user);
    if (!user || user.role !== "provider")
      fail(404, "Professional account not found.");
    if (action === "APPROVED") {
      const eligibility = await providerApprovalRequirements(user);
      if (!eligibility.ready) fail(409, eligibility.issues.join(" "));
    }
    if (a.state === action && user.profile?.status === target)
      return { ok: true, idempotent: true, user };
  }
  if (
    revision !== undefined &&
    (!Number.isInteger(revision) || revision !== a.revision)
  )
    fail(409, "This application changed. Refresh before deciding.");
  const currentRevision = a.revision,
    lockUntil = new Date(Date.now() + 30000);
  const claimed = await ProviderApplication.findOneAndUpdate(
    {
      _id: a._id,
      revision: currentRevision,
      state: a.state,
      $or: [
        { reviewLockUntil: { $exists: false } },
        { reviewLockUntil: { $lte: new Date() } },
      ],
    },
    { $set: { reviewLockUntil: lockUntil } },
    { returnDocument: "after" },
  );
  if (!claimed)
    fail(
      409,
      "Another reviewer changed this application. Refresh before deciding.",
    );
  try {
    if (user && user.profile?.status !== target) {
      const updated = await User.findOneAndUpdate(
        {
          _id: user._id,
          role: "provider",
          status: user.status,
          "profile.status":
            user.profile?.status === undefined
              ? { $exists: false }
              : user.profile.status,
          ...(user.updatedAt ? { updatedAt: user.updatedAt } : {}),
        },
        {
          $set: {
            "profile.status": target,
            ...(action === "APPROVED"
              ? {
                  "profile.approvedBy": actor,
                  "profile.approvedAt": new Date(),
                }
              : {}),
          },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        fail(409, "The provider account changed. Refresh before deciding.");
      user = updated;
    }
    const updated = await ProviderApplication.findOneAndUpdate(
      { _id: a._id, revision: currentRevision, reviewLockUntil: lockUntil },
      {
        ...(action === "FOLLOW_UP"
          ? {}
          : {
              $set: {
                state: action,
                ...(action === "APPROVED"
                  ? {
                      approvedBy: user.profile?.approvedBy || actor,
                      approvedAt: user.profile?.approvedAt || new Date(),
                    }
                  : {}),
              },
            }),
        $inc: { revision: 1 },
        $push: { history: { action, note: auditNote, actor } },
      },
      { returnDocument: "after" },
    );
    if (!updated)
      fail(409, "The application changed. Refresh before deciding.");
    return { ok: true, idempotent: false, user };
  } finally {
    await ProviderApplication.updateOne(
      { _id: a._id, reviewLockUntil: lockUntil },
      { $unset: { reviewLockUntil: "" } },
    );
  }
}
