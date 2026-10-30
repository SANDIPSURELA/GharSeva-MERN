import { cashPlanSnapshot } from "./billing-domain.js";
import { ownerImportedDemo } from "./faculty-showcase.js";
import { paymentOptions } from "./payment-gateway.js";
import { serviceSignals } from "./assistant-aliases.js";
import { requireCity, cityFilter, bookingCity } from "./cities.js";
import { supportedCities } from "../../shared/cities.js";
import {
  conversationTurn,
  nextQuestion,
  indiaDate,
} from "./assistant-conversation.js";
import { matchProviders } from "./assistant-matching.js";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import { User, Category, Booking, AssistantBookingDraft } from "./models.js";
import { auth, optionalAuth, role } from "./auth.js";
import { fail, text, number, validateSchedule } from "./domain.js";
import {
  assistantOptions,
  groundedAIResult,
  sensitiveAssistantInput,
  validateMessages,
  guidedAnalysis,
  analyseWithAI,
  safetyConcern,
} from "./assistant-analysis.js";
const oid = (value) => {
  if (!mongoose.isValidObjectId(value))
    fail(404, "Booking draft or professional not found.");
  return value;
};
function preferences(body) {
  return {
    date: body.date ? text(body.date, "Date", 10, 10) : "",
    time: body.time ? text(body.time, "Time", 5, 5) : "",
    area: body.area ? text(body.area, "Area", 1, 100) : "",
    sort: body.sort === "price" ? "price" : "rating",
    city: body.city ? requireCity(body.city) : "",
    budget:
      body.budget !== undefined && body.budget !== ""
        ? number(body.budget, "Budget", 100, 50000)
        : null,
  };
}
const assistantReceipt = (booking) =>
  Object.fromEntries(
    [
      "_id",
      "service",
      "category",
      "city",
      "provider",
      "customer",
      "date",
      "time",
      "status",
      "price",
      "paymentPlan",
      "address",
      "notes",
    ]
      .filter((key) => booking?.[key] !== undefined)
      .map((key) => [key, booking[key]]),
  );
async function draftView(draft) {
  const provider = await User.findById(draft.provider).select(
    "name profile.area profile.city",
  );
  const category = await Category.findOne({ slug: draft.category }).select(
    "slug name",
  );
  return {
    _id: draft._id,
    provider: {
      _id: draft.provider,
      name: provider?.name || "Selected professional",
      area: draft.expectedArea ?? provider?.profile?.area ?? "",
      city: draft.city,
      price: draft.expectedPrice,
    },
    category: {
      slug: draft.category,
      name: category?.name || "Selected service",
    },
    city: draft.city,
    date: draft.date,
    time: draft.time,
    address: draft.address,
    notes: draft.notes,
    price: draft.expectedPrice,
    paymentPlan: draft.paymentPlan,
    expiresAt: draft.expiresAt,
    paymentsEnabled: paymentOptions().enabled,
    priceBasis:
      "Starting estimate. Extra work needs approval; the remaining approved balance is paid online after completion.",
  };
}
export function mountAssistant(
  app,
  {
    settings,
    publicProviders,
    createCustomerBooking,
    bookingView,
    aiAnalyse = analyseWithAI,
  },
) {
  const chatLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    message: { message: "Please wait before asking more service questions." },
  });
  const aiLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 8,
    message: {
      message:
        "AI request limit reached. Switch to guided matching or try again later.",
    },
  });
  const draftLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 40,
    message: { message: "Too many booking drafts. Please wait a little." },
  });
  const findMatches = async (category, prefs, facultyDemo = false) => {
    const cat = await Category.findOne({
      slug: category,
      enabled: true,
    }).lean();
    if (!cat) fail(400, "Choose an available service category.");
    const people = prefs.city
        ? await publicProviders(
            {
              ...cityFilter(prefs.city),
              "profile.available": true,
            },
            { facultyDemo },
          )
        : [],
      controls = await settings();
    const date = prefs.date || indiaDate(1);
    // One bounded query covers all schedules; existing active bookings are never
    // treated as free just because a professional accepts requests in general.
    const occupied = await Booking.find({
      provider: { $in: people.map((p) => p._id) },
      date,
      active: true,
    })
      .select("provider date time active")
      .lean();
    return {
      category: { slug: cat.slug, name: cat.name, image: cat.image },
      providers: matchProviders(people, cat, prefs, occupied, {
        bookingEnabled: controls.bookingEnabled,
      }),
      bookingEnabled: controls.bookingEnabled,
    };
  };
  async function analyse(messages, body, categories) {
    if (body.mode !== undefined && !["guided", "ai"].includes(body.mode))
      fail(400, "Choose guided or AI assistance.");
    if (body.mode === "ai" && body.shareWithAI !== true)
      fail(400, "Choose to share your description before using AI assistance.");
    let result = guidedAnalysis(messages, categories),
      mode = "guided",
      notice =
        "Guided matching uses tested English, Hindi, Gujarati and romanized service phrases. It is not a diagnosis or full language understanding.";
    if (
      body.mode === "ai" &&
      !result.urgent &&
      !result.unsupported &&
      categories.length
    ) {
      if (assistantOptions().aiAvailable) {
        try {
          const signals = serviceSignals(messages);
          result = groundedAIResult(
            await aiAnalyse(signals, categories),
            categories,
            signals,
          );
          mode = "ai";
          notice =
            "AI guidance may be mistaken. A professional must confirm the cause and scope.";
        } catch {
          notice =
            "AI is unavailable or returned invalid guidance. Guided matching was used; choose a service if it misunderstood.";
        }
      } else notice = "Live AI is not configured; guided matching was used.";
    }
    return { ...result, mode, notice };
  }
  app.post(
    "/api/assistant/conversation",
    optionalAuth,
    chatLimit,
    (req, res, next) => {
      if (
        req.body.mode === "ai" &&
        assistantOptions().aiAvailable &&
        req.body.event?.type === "message" &&
        !req.body.state?.category
      )
        return aiLimit(req, res, next);
      next();
    },
    async (req, res) => {
      const categories = await Category.find({ enabled: true })
        .select("slug name description image")
        .limit(100)
        .lean();

      if (
        req.body.state !== undefined &&
        (!req.body.state ||
          typeof req.body.state !== "object" ||
          Array.isArray(req.body.state))
      )
        fail(400, "Use valid discovery preferences.");
      const stateInput = { ...(req.body.state || {}) };
      if (!stateInput.city && req.user?.city) stateInput.city = req.user.city;
      const serviceUnavailable = Boolean(
        stateInput.category &&
        !categories.some((c) => c.slug === stateInput.category),
      );
      if (serviceUnavailable && req.body.event?.type !== "category") {
        stateInput.category = "";
        stateInput.problem = "";
        stateInput.providerId = "";
        stateInput.time = "";
      }
      const turn = await conversationTurn(
        { ...req.body, state: stateInput },
        {
          categories,
          cities: supportedCities,
          analyse: (messages) => analyse(messages, req.body, categories),
        },
      );
      const { state, analysis } = turn;
      const controls = await settings();
      let matches = {
        category: categories.find((c) => c.slug === state.category) || null,
        providers: [],
        bookingEnabled: controls.bookingEnabled,
      };
      if (state.category && state.city && state.date && !analysis?.urgent)
        matches = await findMatches(
          state.category,
          state,
          req.body.facultyDemo === true,
        );
      if (state.providerId) {
        const provider = matches.providers.find(
          (p) => String(p._id) === state.providerId,
        );
        if (provider?.facultyDemo)
          fail(
            409,
            "Faculty showcase profiles are display-only. Use the isolated classroom sandbox for bookings.",
          );
        if (!provider) {
          if (req.body.event?.type === "provider")
            fail(
              409,
              "That professional no longer matches the requested area, price or appointment. Refresh your options.",
            );
          state.providerId = "";
          state.time = "";
        } else if (
          state.time &&
          !provider.availability.slots.includes(state.time)
        ) {
          state.time = "";
        }
      }
      const prompt = nextQuestion(state);
      if (serviceUnavailable && !state.category) {
        prompt.question =
          "The previously selected service is unavailable. Choose an enabled service.";
        prompt.quickReplies = categories.slice(0, 3).map((c) => c.name);
      }
      if (!categories.length) {
        prompt.question =
          "No services are currently enabled. Try later or contact support.";
        prompt.quickReplies = [];
      } else if (!state.category && analysis) {
        prompt.question =
          analysis.questions?.[0] || "Choose an enabled service below.";
        prompt.quickReplies = analysis.choices || [];
      }
      if (analysis?.urgent) {
        prompt.question = "";
        prompt.quickReplies = [];
      }
      if (!state.city && state.category)
        prompt.quickReplies = [...supportedCities].sort().slice(0, 6);
      if (
        state.category &&
        state.city &&
        state.date &&
        !matches.providers.length
      ) {
        prompt.question = controls.bookingEnabled
          ? "No available professionals match these preferences. Try another day or budget, or choose a different city."
          : "Booking requests are temporarily paused. You can still discuss the service and try again later.";
        prompt.quickReplies = [
          "Change date",
          "Clear filters",
          "Change the city",
        ];
      }
      res.json({
        catalogEmpty: categories.length === 0,
        serviceUnavailable,
        ...turn,
        ...matches,
        ...prompt,
        summary: analysis?.summary || turn.summary || prompt.question,
        guidance: analysis?.guidance || "",
        urgent: analysis?.urgent || false,
        notice: analysis?.notice,
        mode: analysis?.mode,
      });
    },
  );

  app.get("/api/assistant/options", async (req, res) =>
    res.json({
      ...assistantOptions(),
      conversationalBooking: true,
      bookingEnabled: (await settings()).bookingEnabled,
    }),
  );
  app.post(
    "/api/assistant/analyse",
    optionalAuth,
    chatLimit,
    (req, res, next) => {
      if (req.body.mode === "ai" && assistantOptions().aiAvailable)
        return aiLimit(req, res, next);
      next();
    },
    async (req, res) => {
      if (
        req.body.mode !== undefined &&
        !["guided", "ai"].includes(req.body.mode)
      )
        fail(400, "Choose guided or AI assistance.");
      if (req.body.mode === "ai" && req.body.shareWithAI !== true)
        fail(
          400,
          "Choose to share your description before using AI assistance.",
        );
      const messages = validateMessages(req.body.messages),
        prefs = preferences({
          ...req.body,
          city: req.body.city || req.user?.city,
        }),
        categories = await Category.find({ enabled: true })
          .select("slug name description image")
          .limit(100)
          .lean();
      const analysis = await analyse(messages, req.body, categories);
      const matches = analysis.category
        ? await findMatches(
            analysis.category,
            prefs,
            req.body.facultyDemo === true,
          )
        : { category: null, providers: [] };
      res.json({ ...analysis, ...matches });
    },
  );
  app.get("/api/assistant/matches", optionalAuth, chatLimit, async (req, res) =>
    res.json(
      await findMatches(
        text(req.query.category, "Service category", 1, 70),
        preferences({ ...req.query, city: req.query.city || req.user?.city }),
        req.query.facultyDemo === "1",
      ),
    ),
  );
  app.post(
    "/api/assistant/drafts",
    auth,
    role("customer"),
    draftLimit,
    async (req, res) => {
      if (!(await settings()).bookingEnabled)
        fail(409, "Bookings are temporarily paused.");
      const provider = await User.findOne({
        _id: oid(req.body.providerId),
        role: "provider",
        status: "ACTIVE",
        "profile.status": "APPROVED",
      });
      if (!provider)
        fail(404, "This professional is not available for booking.");
      if (ownerImportedDemo(provider))
        fail(403, "Faculty showcase profiles cannot receive booking drafts.");
      const category = await Category.findOne({
        slug: req.body.category,
        enabled: true,
      });
      if (
        !category ||
        ![
          provider.profile.category,
          ...(provider.profile.categories || []),
        ].includes(category.slug)
      )
        fail(400, "This professional does not offer the selected service.");
      if (
        req.body.displayedPrice !== undefined &&
        req.body.displayedPrice !== provider.profile.price
      )
        fail(
          409,
          "The starting estimate changed. Refresh the professional and review the new price.",
        );
      const city = bookingCity(req.user, req.body, provider);
      validateSchedule(req.body.date, req.body.time, provider.profile);
      if (
        await Booking.exists({
          provider: provider._id,
          date: req.body.date,
          time: req.body.time,
          active: true,
        })
      )
        fail(409, "That time was just booked. Choose another available time.");
      const address = text(req.body.address, "Service address", 10, 500),
        notes = req.body.notes
          ? text(req.body.notes, "Service notes", 1, 1000)
          : "";
      if (sensitiveAssistantInput(notes))
        fail(
          400,
          "Keep passwords, codes and payment details out of service notes.",
        );
      if (safetyConcern(notes))
        fail(
          400,
          "Do not use a normal booking to handle an immediate hazard. Contact the appropriate local emergency service or utility first.",
        );
      const draft = await AssistantBookingDraft.create({
        customer: req.user._id,
        provider: provider._id,
        category: category.slug,
        date: req.body.date,
        time: req.body.time,
        address,
        notes,
        city,
        expectedPrice: provider.profile.price,
        expectedArea: provider.profile.area,
        paymentPlan: cashPlanSnapshot(provider.profile.price),
        expiresAt: new Date(Date.now() + 20 * 60000),
      });
      res.status(201).json(await draftView(draft));
    },
  );
  app.get(
    "/api/assistant/drafts/:id",
    auth,
    role("customer"),
    async (req, res) => {
      const id = oid(req.params.id);
      const prior = await Booking.findOne({
        assistantDraft: id,
        customer: req.user._id,
      }).select("_id");
      if (prior)
        return res.json({
          booking: assistantReceipt(
            (await bookingView({ _id: prior._id }, req.user))[0],
          ),
        });
      const draft = await AssistantBookingDraft.findOne({
        _id: id,
        customer: req.user._id,
        expiresAt: { $gt: new Date() },
      });
      if (!draft)
        fail(
          404,
          "This prepared request expired or is unavailable. Review a new request.",
        );
      res.json({ draft: await draftView(draft) });
    },
  );
  app.delete(
    "/api/assistant/drafts/:id",
    auth,
    role("customer"),
    async (req, res) => {
      if (
        await Booking.exists({
          assistantDraft: oid(req.params.id),
          customer: req.user._id,
        })
      )
        fail(
          409,
          "This request already created a booking. Open My bookings for its saved status; cancelling a draft cannot cancel that booking.",
        );
      await AssistantBookingDraft.deleteOne({
        _id: oid(req.params.id),
        customer: req.user._id,
      });
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/assistant/drafts/:id/confirm",
    auth,
    role("customer"),
    draftLimit,
    async (req, res) => {
      if (req.body.confirm !== true)
        fail(
          400,
          "Review the booking details and confirm before sending the request.",
        );
      const id = oid(req.params.id);
      const prior = await Booking.findOne({
        assistantDraft: id,
        customer: req.user._id,
      }).select("_id");
      if (prior)
        return res.json(
          assistantReceipt(
            (await bookingView({ _id: prior._id }, req.user))[0],
          ),
        );
      const draft = await AssistantBookingDraft.findOne({
        _id: id,
        customer: req.user._id,
        expiresAt: { $gt: new Date() },
      });
      if (!draft)
        fail(
          404,
          "This booking draft expired or is not yours. Prepare a new draft.",
        );
      if (!draft.paymentPlan)
        fail(409, "Payment terms need a new review. Prepare a new request.");
      try {
        const booked = await createCustomerBooking(
          req.user,
          {
            city: draft.city,
            providerId: draft.provider,
            category: draft.category,
            date: draft.date,
            time: draft.time,
            address: draft.address,
            notes: draft.notes,
            urgency: "STANDARD",
          },
          {
            assistantDraft: draft._id,
            expectedPrice: draft.expectedPrice,
            expectedPaymentPlan: draft.paymentPlan,
            expectedArea: draft.expectedArea,
          },
        );
        res.status(201).json(assistantReceipt(booked));
      } catch (error) {
        if (error.code === 11000) {
          const existing = await Booking.findOne({
            assistantDraft: id,
            customer: req.user._id,
          }).select("_id");
          if (existing)
            return res.json(
              assistantReceipt(
                (await bookingView({ _id: existing._id }, req.user))[0],
              ),
            );
        }
        throw error;
      }
    },
  );
}
