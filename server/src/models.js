import mongoose from "mongoose";
const { Schema } = mongoose;
const ref = (model) => ({ type: Schema.Types.ObjectId, ref: model });
const options = { timestamps: true };
const profile = new Schema(
  {
    category: String,
    categories: [String],
    city: String,
    area: String,
    bio: String,
    experience: { type: Number, min: 0, max: 50, default: 0 },
    price: { type: Number, min: 100, default: 299 },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    photo: String,
    portfolio: [String],
    demoProviderId: String,
    skills: [String],
    available: { type: Boolean, default: true },
    days: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
    slots: { type: [String], default: ["09:00", "11:00", "14:00", "16:00"] },
    documents: [ref("File")],
    identityRequired: { type: Boolean, default: false },
    approvedBy: ref("User"),
    approvedAt: Date,
  },
  { _id: false },
);
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxLength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    mobile: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    sessionVersion: { type: Number, default: 0, min: 0 },
    loginRevision: { type: Number, default: 0, min: 0, select: false },
    demoAccountId: { type: String, index: true, sparse: true },
    termsAcceptedAt: Date,
    appleRelayConsentAt: Date,
    verification: {
      email: { at: Date, mode: { type: String, enum: ["live", "demo"] } },
      mobile: { at: Date, mode: { type: String, enum: ["live", "demo"] } },
    },
    role: {
      type: String,
      enum: ["customer", "provider", "admin"],
      required: true,
    },
    status: { type: String, enum: ["ACTIVE", "SUSPENDED"], default: "ACTIVE" },
    city: { type: String, default: "" },
    addresses: [{ label: String, address: String }],
    favourites: [ref("User")],
    profile,
  },
  options,
);
export const User = mongoose.model("User", userSchema);
const authSessionSchema = new Schema(
  {
    mode: { type: String, enum: ["demo", "live"], required: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    context: { type: String, required: true },
    user: { ...ref("User"), required: true, index: true },
    role: {
      type: String,
      enum: ["customer", "provider", "admin"],
      required: true,
    },
    sessionVersion: { type: Number, required: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    idleExpiresAt: Date,
    lastActiveAt: Date,
    reauthenticatedAt: Date,
    reauthRevision: Number,
    revokedAt: { type: Date, default: null },
  },
  options,
);
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AuthSession = mongoose.model("AuthSession", authSessionSchema);
export const Category = mongoose.model(
  "Category",
  new Schema(
    {
      slug: { type: String, required: true, unique: true },
      name: { type: String, required: true, maxLength: 70 },
      description: { type: String, maxLength: 200 },
      image: String,
      price: { type: Number, min: 100, default: 299 },
      enabled: { type: Boolean, default: true },
    },
    options,
  ),
);
export const statuses = [
  "PENDING",
  "ACCEPTED",
  "ON_THE_WAY",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
];
const bookingSchema = new Schema(
  {
    city: String,
    assistantDraft: ref("AssistantBookingDraft"),
    paymentPlan: {
      type: new Schema(
        {
          type: { type: String, enum: ["DEPOSIT_BALANCE_V1", "CASH_AFTER_SERVICE_V1"] },
          mode: { type: String, enum: ["demo", "razorpay_test", "cash"] },
          depositAmount: Number,
          estimateAmount: Number,
          currency: { type: String, enum: ["INR"] },
        },
        { _id: false },
      ),
      default: undefined,
    },
    billing: { type: Schema.Types.Mixed, default: undefined },
    customer: { ...ref("User"), required: true },
    provider: { ...ref("User"), required: true },
    category: String,
    service: String,
    date: { type: String, required: true },
    time: { type: String, required: true },
    address: { type: String, required: true, maxLength: 500 },
    notes: { type: String, maxLength: 1000 },
    price: { type: Number, min: 100, required: true },
    urgency: {
      type: String,
      enum: ["STANDARD", "PRIORITY"],
      default: "STANDARD",
    },
    status: { type: String, enum: statuses, default: "PENDING" },
    active: { type: Boolean, default: true },
    visitCode: { type: String, select: false },
    otpAttempts: { type: Number, default: 0 },
    timeline: [{ status: String, at: { type: Date, default: Date.now } }],
  },
  options,
);
bookingSchema.index(
  { provider: 1, date: 1, time: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
bookingSchema.index({ assistantDraft: 1 }, { unique: true, sparse: true });
export const Booking = mongoose.model("Booking", bookingSchema);
export const Review = mongoose.model(
  "Review",
  new Schema(
    {
      booking: { ...ref("Booking"), unique: true, required: true },
      customer: ref("User"),
      provider: ref("User"),
      rating: { type: Number, min: 1, max: 5, required: true },
      feedback: {
        type: String,
        required: true,
        minLength: 10,
        maxLength: 1000,
      },
      hidden: { type: Boolean, default: false },
    },
    options,
  ),
);
export const Enquiry = mongoose.model(
  "Enquiry",
  new Schema(
    {
      name: { type: String, required: true, maxLength: 80 },
      email: { type: String, required: true, maxLength: 120 },
      mobile: String,
      subject: { type: String, required: true, maxLength: 100 },
      message: { type: String, required: true, minLength: 20, maxLength: 2000 },
      status: { type: String, enum: ["OPEN", "RESOLVED"], default: "OPEN" },
    },
    options,
  ),
);
export const File = mongoose.model(
  "File",
  new Schema(
    {
      owner: ref("User"),
      kind: {
        type: String,
        enum: ["photo", "portfolio", "document", "identity"],
        required: true,
      },
      name: String,
      mime: String,
      data: { type: Buffer, required: true, select: false },
      iv: { type: String, select: false },
      tag: { type: String, select: false },
      expiresAt: Date,
    },
    options,
  ),
);
File.schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Settings = mongoose.model(
  "Settings",
  new Schema(
    {
      key: { type: String, unique: true, default: "main" },
      facultyDemoEnabled: { type: Boolean, default: false },
      facultyDemoRevision: { type: Number, default: 0 },
      facultyDemoAudit: [
        {
          enabled: Boolean,
          at: Date,
          actor: ref("User"),
          revision: Number,
          _id: false,
        },
      ],
      bookingEnabled: { type: Boolean, default: true },
      providerRegistration: { type: Boolean, default: true },
      commission: { type: Number, min: 0, max: 30, default: 10 },
    },
    options,
  ),
);

const challengeSchema = new Schema(
  {
    channel: { type: String, enum: ["email", "mobile"], required: true },
    contact: { type: String, required: true, index: true },
    purpose: {
      type: String,
      enum: ["register", "login", "verify", "recover"],
      required: true,
    },
    owner: ref("User"),
    portal: { type: String, enum: ["customer", "provider"] },
    sessionVersion: Number,
    deliveryEligible: { type: Boolean, default: true, select: false },
    mode: { type: String, enum: ["live", "demo"], required: true },
    digest: { type: String, select: false },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false },
    // A code cannot be consumed until the selected delivery provider accepts it.
    ready: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  options,
);
challengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ContactChallenge = mongoose.model(
  "ContactChallenge",
  challengeSchema,
);
// A login challenge is a restricted password proof, never an authenticated session.
const pendingLoginSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, select: false },
    user: { ...ref("User"), required: true },
    purpose: {
      type: String,
      enum: ["login", "admin_reauth"],
      default: "login",
    },
    portal: {
      type: String,
      enum: ["customer", "provider", "admin"],
      required: true,
    },
    email: { type: String, required: true, select: false },
    accountProof: { type: String, required: true, select: false },
    boundSession: ref("AuthSession"),
    sessionVersion: { type: Number, required: true },
    mode: { type: String, enum: ["live", "demo"], required: true },
    digest: { type: String, select: false },
    generation: { type: Number, default: 0 },
    codeHistory: { type: [String], select: false, default: [] },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false },
    ready: { type: Boolean, default: false },
    nextSendAt: { type: Date, required: true },
    codeExpiresAt: { type: Date, required: true },
    // Absolute password-proof deadline. Resending never extends it.
    expiresAt: { type: Date, required: true },
  },
  options,
);
pendingLoginSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PendingLogin = mongoose.model("PendingLogin", pendingLoginSchema);
const throttleSchema = new Schema({
  _id: String,
  nextAllowedAt: Date,
  windowStart: Date,
  count: Number,
  expiresAt: Date,
});
throttleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ContactThrottle = mongoose.model(
  "ContactThrottle",
  throttleSchema,
);
const registrationSessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, select: false },
    channel: String,
    contact: String,
    name: String,
    mode: { type: String, enum: ["live", "demo"] },
    externalUid: { type: String, select: false },
    externalProvider: String,
    expiresAt: Date,
  },
  options,
);
registrationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RegistrationSession = mongoose.model(
  "RegistrationSession",
  registrationSessionSchema,
);
const recoverySchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, select: false },
    user: { ...ref("User"), required: true },
    channel: { type: String, enum: ["email", "mobile"], required: true },
    contact: { type: String, required: true, select: false },
    mode: { type: String, enum: ["live", "demo"], required: true },
    sessionVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  options,
);
recoverySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PasswordRecovery = mongoose.model(
  "PasswordRecovery",
  recoverySchema,
);
export const ExternalIdentity = mongoose.model(
  "ExternalIdentity",
  new Schema(
    {
      uid: { type: String, required: true, unique: true },
      provider: {
        type: String,
        enum: ["google.com", "apple.com"],
        required: true,
      },
      additionalProviders: [
        { type: String, enum: ["google.com", "apple.com"] },
      ],
      user: { ...ref("User"), required: true },
    },
    options,
  ),
);
const applicationSchema = new Schema(
  {
    contactKey: { type: String, required: true, unique: true, select: false },
    channel: String,
    contact: { type: String, select: false },
    mode: String,
    user: ref("User"),
    approvedBy: ref("User"),
    approvedAt: Date,
    data: {
      name: String,
      email: String,
      mobile: String,
      city: String,
      categories: [String],
      area: String,
      bio: String,
      experience: Number,
      price: Number,
    },
    state: {
      type: String,
      enum: [
        "DRAFT",
        "SUBMITTED",
        "NEEDS_CORRECTION",
        "APPROVED",
        "REJECTED",
        "WITHDRAWN",
      ],
      default: "DRAFT",
    },
    step: { type: Number, default: 1 },
    saveConsent: { type: Boolean, default: false },
    followUpConsent: { type: Boolean, default: false },
    consentAt: Date,
    revision: { type: Number, default: 0 },
    reviewLockUntil: Date,
    lastActivityAt: { type: Date, default: Date.now },
    submittedAt: Date,
    expiresAt: Date,
    history: [
      {
        action: String,
        note: String,
        actor: ref("User"),
        at: { type: Date, default: Date.now },
      },
    ],
  },
  options,
);
applicationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ProviderApplication = mongoose.model(
  "ProviderApplication",
  applicationSchema,
);
const assistantDraftSchema = new Schema(
  {
    customer: { ...ref("User"), required: true },
    provider: { ...ref("User"), required: true },
    category: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    address: { type: String, required: true, maxLength: 500 },
    notes: { type: String, maxLength: 1000 },
    city: String,
    expectedPrice: { type: Number, required: true },
    expectedArea: String,
    paymentPlan: { type: Schema.Types.Mixed },
    expiresAt: { type: Date, required: true },
  },
  options,
);
assistantDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AssistantBookingDraft = mongoose.model(
  "AssistantBookingDraft",
  assistantDraftSchema,
);

const identitySchema = new Schema(
  {
    provider: { ...ref("User"), required: true, unique: true },
    accountName: String,
    documentType: { type: String, enum: ["AADHAAR_MASKED", "OTHER"] },
    firstName: String,
    middleName: String,
    lastName: String,
    front: ref("File"),
    back: ref("File"),
    consentAt: Date,
    maskedConfirmed: Boolean,
    evidenceExpiresAt: Date,
    state: {
      type: String,
      enum: ["SUBMITTED", "NEEDS_CORRECTION", "REVIEWED", "WITHDRAWN"],
      default: "SUBMITTED",
    },
    revision: { type: Number, default: 1 },
    check: {
      extractedName: String,
      accountStatus: String,
      status: String,
      reasons: [String],
      matched: [String],
      missing: [String],
      extra: [String],
      ocrConfidence: Number,
      engine: String,
    },
    reviewedName: String,
    reviewedAt: Date,
    reviewLockUntil: Date,
    history: [
      {
        action: String,
        note: String,
        actor: ref("User"),
        at: { type: Date, default: Date.now },
      },
    ],
  },
  options,
);
export const ProviderIdentity = mongoose.model(
  "ProviderIdentity",
  identitySchema,
);

const invitationSchema = new Schema(
  {
    contactKey: { type: String, required: true, unique: true, select: false },
    channel: { type: String, enum: ["email", "mobile"], required: true },
    contact: { type: String, required: true },
    name: { type: String, maxLength: 80 },
    city: { type: String, maxLength: 70 },
    role: { type: String, enum: ["customer", "provider"], required: true },
    tokenHash: { type: String, required: true, select: false },
    state: {
      type: String,
      enum: ["PENDING", "ACCEPTING", "ACCEPTED", "REVOKED"],
      default: "PENDING",
    },
    revision: { type: Number, default: 1 },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
    createdBy: ref("User"),
    user: ref("User"),
    claimedAt: Date,
    reservedUser: ref("User"),
    acceptedAt: Date,
    history: [
      {
        action: String,
        actor: ref("User"),
        at: { type: Date, default: Date.now },
      },
    ],
  },
  options,
);
invitationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
export const AccountInvitation = mongoose.model(
  "AccountInvitation",
  invitationSchema,
);

const paymentSchema = new Schema(
  {
    booking: { ...ref("Booking"), required: true },
    customer: { ...ref("User"), required: true },
    provider: { ...ref("User"), required: true },
    mode: { type: String, enum: ["demo", "razorpay_test"], required: true },
    purpose: {
      type: String,
      default: "VISIT_DEPOSIT",
      enum: ["VISIT_DEPOSIT", "FINAL_BALANCE"],
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR", enum: ["INR"] },
    bookingEstimate: Number,
    billVersion: Number,
    creditSnapshot: Number,
    capturedAmount: { type: Number, min: 0 },
    captureIds: [String],
    refundPending: { type: Boolean, default: false },
    reconciliationIssue: { type: String, default: "" },
    status: {
      type: String,
      enum: [
        "CREATING",
        "READY",
        "AUTHORIZED",
        "CAPTURED",
        "FAILED",
        "PARTIALLY_REFUNDED",
        "REFUNDED",
      ],
      default: "CREATING",
    },
    orderId: { type: String, unique: true, sparse: true },
    paymentId: { type: String, unique: true, sparse: true },
    receipt: { type: String, required: true, unique: true },
    method: String,
    refundedAmount: { type: Number, default: 0, min: 0 },
    lastError: String,
    revision: { type: Number, default: 1 },
    history: [
      {
        action: String,
        source: String,
        note: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  options,
);
paymentSchema.index(
  { booking: 1, purpose: 1 },
  { unique: true, name: "payment_booking_purpose" },
);
export const Payment = mongoose.model("Payment", paymentSchema);
export const PaymentRefund = mongoose.model(
  "PaymentRefund",
  new Schema(
    {
      payment: { ...ref("Payment"), required: true },
      booking: { ...ref("Booking"), required: true },
      customer: ref("User"),
      provider: ref("User"),
      mode: { type: String, enum: ["demo", "razorpay_test"], required: true },
      gatewayRefundId: { type: String, unique: true, sparse: true },
      amount: { type: Number, required: true, min: 1 },
      status: {
        type: String,
        enum: ["REQUESTED", "PENDING", "PROCESSED", "FAILED", "CLOSED"],
        required: true,
      },
      reason: String,
      postSettlement: Boolean,
      revision: { type: Number, default: 0 },
      history: [
        {
          action: String,
          actor: ref("User"),
          at: { type: Date, default: Date.now },
          note: String,
        },
      ],
    },
    options,
  ),
);
const paymentEventSchema = new Schema(
  {
    eventKey: { type: String, required: true, unique: true },
    bodyHash: { type: String, required: true },
    gatewayOrderId: String,
    gatewayPaymentId: String,
    resolution: {
      type: String,
      enum: ["PENDING", "UNMATCHED", "RECONCILIATION_REQUIRED", "PROCESSED"],
      default: "PENDING",
    },
    payment: ref("Payment"),
    event: String,
    processedAt: Date,
  },
  options,
);
export const PaymentEvent = mongoose.model("PaymentEvent", paymentEventSchema);
