import { requireCity } from "./cities.js";
import { citySelection } from "../../shared/cities.js";
import { safetyConcern } from "./assistant-analysis.js";
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
  };
  if (event.type === "category") {
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
      lower = message.toLowerCase();
    if (safetyConcern(message)) {
      analysis = await analyse([message]);
      state.problem = message;
      state.category = "";
      clear();
      return { state, analysis, ...nextQuestion(state) };
    }
    const day = /\btomorrow\b/.test(lower)
      ? indiaDate(1, now)
      : /\btoday\b/.test(lower)
        ? indiaDate(0, now)
        : message.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
    const city = cities.find((c) =>
      lower.replace(/ahemdabad/g, "ahmedabad").includes(c.toLowerCase()),
    );
    const amount = lower.match(
      /(?:budget|under|below|up to|₹|rs\.?)[ :]*(\d{3,5})/,
    );
    const time = message.match(/\b([01]\d|2[0-3]):[0-5]\d\b/)?.[0];
    let correction = false;
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
          "Use the controls below, or say tomorrow, change the city, or show cheaper options. To describe another task, choose Change problem.",
      };
    }
  } else if (event.type !== "resume")
    fail(400, "Choose a valid conversation action.");
  state = discoveryState(state, categories);
  return { state, analysis, ...nextQuestion(state) };
}
