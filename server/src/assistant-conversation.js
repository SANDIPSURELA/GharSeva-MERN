import { requireCity } from "./cities.js";
import { citySelection } from "../../shared/cities.js";
import { normalizeProblem, phrasePresent } from "./assistant-aliases.js";
import {
  guidedAnalysis,
  safetyConcern,
  sensitiveAssistantInput,
} from "./assistant-analysis.js";
import { fail, text, number } from "./domain.js";

export function indiaDate(days = 0, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(
    new Date(today + "T12:00:00+05:30").getTime() + days * 86400000,
  ).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
// Only public discovery preferences cross this boundary. This state confers no
// authentication, price authority, draft access or right to submit a booking.
export function discoveryState(input = {}, categories = []) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(400, "Use valid discovery preferences.");
  const str = (key, max) => (input[key] ? text(input[key], key, 1, max) : "");
  const category = str("category", 70);
  if (category && !categories.some((c) => c.slug === category))
    fail(400, "Choose an enabled service.");
  const date = str("date", 10),
    time = str("time", 5),
    providerId = str("providerId", 24);
  if (
    date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + "T12:00:00+05:30")) ||
      new Date(date + "T12:00:00+05:30").toISOString().slice(0, 10) !== date)
  )
    fail(400, "Choose a valid date.");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    fail(400, "Choose a valid time.");
  if (providerId && !/^[a-f0-9]{24}$/i.test(providerId))
    fail(400, "Choose a listed professional.");
  return {
    problem: str("problem", 1500),
    category,
    city: input.city ? requireCity(input.city) : "",
    area: str("area", 100),
    budget:
      input.budget === "" || input.budget == null
        ? null
        : number(input.budget, "Budget", 100, 50000),
    date,
    time,
    providerId,
    excludedProvider: input.excludedProvider
      ? text(input.excludedProvider, "Professional", 24, 24)
      : "",
    sort: input.sort === "price" ? "price" : "rating",
  };
}
export function nextQuestion(s) {
  if (!s.category)
    return { question: "What needs attention?", quickReplies: [] };
  if (!s.city)
    return { question: "Which city should I search in?", quickReplies: [] };
  if (!s.date)
    return {
      question: "Which day would you prefer? All appointment times are in IST.",
      quickReplies: ["Today", "Tomorrow"],
    };
  if (!s.providerId)
    return {
      question: "Choose a professional with an available appointment below.",
      quickReplies: ["Show cheaper options", "Change the city", "Change date"],
    };
  if (!s.time)
    return {
      question: "Which available time works for you?",
      quickReplies: [],
    };
  return {
    question:
      "Continue below to choose the service address and review your request.",
    quickReplies: [],
  };
}
export async function conversationTurn(
  body,
  { categories, cities, analyse, now = new Date() },
) {
  let state = discoveryState(body.state, categories),
    analysis = null;
  const event = body.event || {},
    value = event.value;
  const clear = () => {
    state.providerId = "";
    state.time = "";
    state.excludedProvider = "";
  };
  if (
    event.type !== "cancel" &&
    event.type !== "problem" &&
    safetyConcern(state.problem)
  ) {
    clear();
    state.category = "";
    return {
      state,
      analysis: guidedAnalysis([state.problem], categories),
      question: "",
      quickReplies: [],
    };
  }
  if (event.type === "cancel") {
    return {
      state: discoveryState({ city: state.city }, categories),
      cancelled: true,
      summary: "Draft cancelled. No booking was requested.",
      ...nextQuestion({}),
    };
  } else if (event.type === "alternatives") {
    const prior = state.providerId;
    clear();
    state.excludedProvider = prior;
  } else if (event.type === "back") {
    if (state.time) state.time = "";
    else if (state.providerId) clear();
    else if (state.date) {
      state.date = "";
      clear();
    } else {
      state.category = "";
      state.problem = "";
      clear();
    }
  } else if (event.type === "category") {
    if (state.category && state.category !== value) state.problem = "";
    state.category = text(value, "Service", 1, 70);
    if (!categories.some((c) => c.slug === state.category))
      fail(400, "Choose an enabled service.");
    clear();
  } else if (event.type === "preferences") {
    const next = discoveryState(
      {
        ...state,
        ...Object.fromEntries(
          ["city", "area", "budget", "date", "time", "sort"]
            .filter((k) => event[k] !== undefined)
            .map((k) => [k, event[k]]),
        ),
      },
      categories,
    );
    if (
      ["city", "area", "budget", "date", "sort"].some(
        (k) => next[k] !== state[k],
      )
    ) {
      next.providerId = "";
      next.time = "";
      next.excludedProvider = "";
    }
    state = next.city !== state.city ? citySelection(next, next.city) : next;
  } else if (event.type === "provider") {
    state.providerId = text(value, "Professional", 24, 24);
    state.time = "";
  } else if (event.type === "problem") {
    state.problem = "";
    state.category = "";
    clear();
  } else if (event.type === "message") {
    const message = text(value, "Message", 1, 1500),
      lower = normalizeProblem(message);
    if (!safetyConcern(message) && sensitiveAssistantInput(message))
      return {
        state,
        sensitiveRejected: true,
        summary:
          "Do not share passwords, login/visit codes or payment details here. Use the existing secure sign-in or payment screen.",
        ...nextQuestion(state),
      };
    if (safetyConcern(message)) {
      analysis = await analyse([message]);
      state.problem = "Possible immediate hazard: fire, gas or electrical";
      state.category = "";
      clear();
      return { state, analysis, ...nextQuestion(state) };
    }
    if (
      /^(cancel( (the )?(draft|request|booking))?|start over|રદ કરો|रद्द करो)$/u.test(
        lower,
      )
    )
      return conversationTurn(
        { state, event: { type: "cancel" } },
        { categories, cities, analyse, now },
      );
    if (/^(go back|back|પાછા|वापस)$/u.test(lower))
      return conversationTurn(
        { state, event: { type: "back" } },
        { categories, cities, analyse, now },
      );
    if (
      /alternatives|another professional|other professionals|change (the )?provider/.test(
        lower,
      )
    )
      return conversationTurn(
        { state, event: { type: "alternatives" } },
        { categories, cities, analyse, now },
      );
    if (/change (the )?(service|problem)|બીજી સેવા|दूसरी सेवा/u.test(lower)) {
      state.category = "";
      state.problem = "";
      clear();
    }
    const day = /\btomorrow\b|આવતી કાલે|આવતીકાલે|કાલે|कल|\bkal\b/u.test(lower)
      ? indiaDate(1, now)
      : /\btoday\b|આજે|आज|\baaj\b/u.test(lower)
        ? indiaDate(0, now)
        : message.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
    const city = cities.find((c) =>
      phrasePresent(
        lower.replace(/ahemdabad|અમદાવાદ|अहमदाबाद/g, "ahmedabad"),
        c.toLowerCase(),
      ),
    );
    const amount = lower.match(
      /(?:budget|under|below|up to|₹|rs\.?)[ :]*(\d{3,5})/,
    );
    const time = message.match(/\b([01]\d|2[0-3]):[0-5]\d\b/)?.[0];
    let correction = false;
    const area = message
      .match(/^(?:area|in the area of)[: ]+(.{1,100})$/i)?.[1]
      ?.trim();
    if (area) {
      state.area = area;
      clear();
      correction = true;
    }
    const local = guidedAnalysis([message], categories);
    if (state.category && local.unsupported) {
      state.category = "";
      state.problem = message;
      clear();
      return { state, analysis: local, ...nextQuestion(state) };
    }
    if (state.category && local.category && local.category !== state.category) {
      state.category = local.category;
      state.problem = message;
      clear();
      correction = true;
      analysis = local;
    }
    if (/change (the )?city/.test(lower) && !city) {
      state.city = "";
      state.area = "";
      clear();
      correction = true;
    }
    if (/change (the )?date/.test(lower) && !day) {
      state.date = "";
      clear();
      correction = true;
    }
    if (/clear filters/.test(lower)) {
      state.budget = null;
      state.area = "";
      clear();
      correction = true;
    }
    if (/cheaper/.test(lower)) {
      state.sort = "price";
      clear();
      correction = true;
    }
    if (day) {
      state.date = day;
      clear();
      correction = true;
    }
    if (city) {
      if (state.city !== city) {
        state.city = city;
        state.area = "";
        clear();
      }
      correction = true;
    }
    if (amount) {
      state.budget = number(amount[1], "Budget", 100, 50000);
      clear();
      correction = true;
    }
    if (time) {
      state.time = time;
      correction = true;
    }
    // Booking/address messages never go back through the external model. A new
    // problem requires the explicit change-problem control once a trade is known.
    const remaining = lower
      .replace(
        /\b(today|tomorrow|actually|please|in|at|on|my|city|budget|under|below|up to)\b/g,
        "",
      )
      .replace(city?.toLowerCase() || /$a/, "")
      .replace(/\b\d[\d:-]*\b/g, "")
      .trim();
    if (
      !state.category &&
      (!correction || remaining.length > 4) &&
      !/change (the )?(city|date)|cheaper/.test(lower)
    ) {
      const problem = [state.problem, message]
        .filter(Boolean)
        .join("\n")
        .slice(-1500);
      analysis = await analyse([problem]);
      state.problem = problem;
      state.category = analysis.category || "";
      clear();
    } else if (!correction) {
      return {
        state,
        ...nextQuestion(state),
        summary:
          "Choose a listed option, or say change service, change city, tomorrow, alternatives or go back.",
      };
    }
  } else if (event.type !== "resume")
    fail(400, "Choose a valid conversation action.");
  state = discoveryState(state, categories);
  return { state, analysis, ...nextQuestion(state) };
}
