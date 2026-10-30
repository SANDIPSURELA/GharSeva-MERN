import {
  savePublicSelection,
  takePublicSelection,
  saveDraftReference,
  readDraftReference,
  clearDraftReference,
  AssistantRequestGate,
} from "../../../shared/assistant-client-state.js";
import { DiscoveryNotice } from "../components/DiscoveryNotice";
import { FacultyDemoToggle } from "../components/FacultyDemoToggle";
import { discoveryState } from "../../../shared/discovery-state.js";
import {
  supportedCities,
  citySelection,
  canonicalCity,
} from "../../../shared/cities.js";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  LoaderCircle,
  MapPin,
  MessageCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useApp } from "../context";
import { api, indiaToday, indiaDateAfter, prettyDate } from "../api";
import { WorkPhoto } from "../components/WorkPhoto";
import { resolveWorkImages } from "../../../shared/work-images.js";
import "./ServiceAssistant.css";

const empty = {
  problem: "",
  category: "",
  city: "",
  area: "",
  budget: null,
  date: "",
  time: "",
  providerId: "",
  sort: "rating",
};
const starters = [
  "Tap leaking",
  "AC not cooling",
  "Need someone to clean kitchen",
  "Fan making noise",
  "Washing machine not draining",
];
const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);
export function ServiceAssistant() {
  const {
      user,
      loading,
      categories,
      providers,
      facultyDemo,
      selectedCity,
      setSelectedCity,
      discoveryLoading,
      discoveryError,
      refresh,
    } = useApp(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [options, setOptions] = useState({
      aiAvailable: false,
      bookingEnabled: true,
    }),
    [state, setState] = useState(() => ({ ...empty, city: selectedCity })),
    [messages, setMessages] = useState([]),
    [input, setInput] = useState(""),
    [result, setResult] = useState(null),
    [useAI, setUseAI] = useState(false),
    [busy, setBusy] = useState(false),
    [bookingBusy, setBookingBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(null),
    [progress, setProgress] = useState("Discovery"),
    [bookingDetails, setBookingDetails] = useState(null),
    [recovered, setRecovered] = useState(null),
    [pendingRequest, setPendingRequest] = useState(false),
    [recoveryRetry, setRecoveryRetry] = useState(0),
    [resumeRetryAvailable, setResumeRetryAvailable] = useState(false);
  const lock = useRef(false),
    end = useRef(null),
    restored = useRef(false);
  const cities = supportedCities;
  const currentCity = useRef(selectedCity),
    generation = useRef(new AssistantRequestGate());
  const previousOwner = useRef(user?._id || "");
  useEffect(() => {
    generation.current.invalidate();
    setResult(null);
    setState((s) => ({ ...s, providerId: "", time: "" }));
    lock.current = false;
    setBusy(false);
  }, [facultyDemo]);
  useEffect(() => () => generation.current.invalidate(), []);
  useEffect(() => {
    const owner = user?._id || "";
    if (previousOwner.current === owner) return;
    previousOwner.current = owner;
    generation.current.invalidate();
    lock.current = false;
    setBusy(false);
    setBookingBusy(false);
    setRecovered(null);
    setPendingRequest(false);
    setResumeRetryAvailable(false);
    setBookingDetails(null);
    setMessages([]);
    setInput("");
    setError("");
    setRetry(null);
    setResult(null);
    setState({ ...empty, city: selectedCity });
    setProgress("Discovery");
  }, [user?._id]);
  useEffect(() => {
    if (loading) return;
    const ref = readDraftReference(sessionStorage, user?._id);
    if (!ref || user?.role !== "customer") return;
    let active = true;
    setPendingRequest(true);
    setResumeRetryAvailable(false);
    api("/assistant/drafts/" + ref.id)
      .then((value) => {
        if (!active) return;
        setRecovered({ ...value, pending: ref.pending });
        setPendingRequest(ref.pending && !value.booking);
        setError("");
      })
      .catch((e) => {
        if (!active) return;
        if (e.status === 404) {
          clearDraftReference(sessionStorage, ref.id);
          setPendingRequest(false);
        } else setResumeRetryAvailable(true);
        setError("Prepared request could not load. " + e.message);
      });
    return () => {
      active = false;
    };
  }, [loading, user?._id, recoveryRetry, selectedCity]);

  useEffect(() => {
    if (currentCity.current === selectedCity) return;
    currentCity.current = selectedCity;
    generation.current.invalidate();
    lock.current = false;
    setBusy(false);
    setBookingBusy(false);
    setRetry(null);
    setResult(null);
    setMessages([]);
    setBookingDetails(null);
    setError("");
    setProgress("Discovery");
    setState((s) => citySelection(s, selectedCity));
  }, [selectedCity]);
  const selected = result?.providers?.find(
    (p) => String(p._id) === state.providerId,
  );
  async function turn(event, base = state) {
    if (
      lock.current ||
      bookingBusy ||
      pendingRequest ||
      recovered ||
      resumeRetryAvailable
    )
      return;
    lock.current = true;
    const serial = generation.current.begin();
    setBusy(true);
    setError("");
    setRetry(null);
    try {
      const response = await api("/assistant/conversation", {
        method: "POST",
        body: {
          state: base,
          event,
          mode: useAI ? "ai" : "guided",
          shareWithAI: useAI,
          facultyDemo,
        },
      });
      if (!generation.current.valid(serial)) return;
      const changed = [
        "category",
        "city",
        "area",
        "providerId",
        "date",
        "time",
      ].some((key) => response.state[key] !== base[key]);
      if (response.cancelled || changed) {
        const ref = readDraftReference(sessionStorage, user?._id);
        if (ref) {
          await api("/assistant/drafts/" + ref.id, { method: "DELETE" });
          if (!generation.current.valid(serial)) return;
          clearDraftReference(sessionStorage, ref.id);
        }
        if (response.cancelled) setBookingDetails(null);
      }
      currentCity.current = response.state.city;
      setSelectedCity(response.state.city);
      setState(response.state);
      setResult(response);
      setInput("");
      setProgress(response.state.providerId ? "Appointment" : "Discovery");
      const userText =
        event.type === "message" &&
        !response.sensitiveRejected &&
        !response.urgent
          ? event.value
          : event.type === "provider"
            ? "Choose this professional"
            : null;
      setMessages((old) =>
        [
          ...old,
          ...(userText ? [{ role: "user", content: userText }] : []),
          {
            role: "assistant",
            content: [
              response.summary,
              response.guidance,
              response.question !== response.summary ? response.question : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ].slice(-30),
      );
    } catch (e) {
      if (!generation.current.valid(serial)) return;
      setError(
        e.status >= 500
          ? "The service could not respond. Your choices are kept; try again."
          : e.message,
      );
      setRetry({ event, base });
    } finally {
      if (generation.current.valid(serial)) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    document.title = "Find help & request a booking | GharSeva";
    api("/assistant/options")
      .then(setOptions)
      .catch((e) => setError(e.message));
    return () => {
      document.title = "GharSeva - A little help. A happier home.";
    };
  }, []);
  useEffect(() => {
    if (
      loading ||
      (user?.city &&
        selectedCity !== canonicalCity(user.city) &&
        !restored.current)
    )
      return;
    if (restored.current) return;
    restored.current = true;
    // A private prepared request takes precedence over an older guest selection.
    if (readDraftReference(sessionStorage, user?._id)) {
      takePublicSelection(sessionStorage, selectedCity);
      return;
    }
    try {
      const selection = takePublicSelection(sessionStorage, selectedCity);
      if (selection) {
        turn({ type: "resume" }, { ...empty, ...selection });
        return;
      }
    } catch {
      /* Discovery remains available if browser storage is disabled. */
    }
    const id = params.get("provider"),
      category = params.get("service");
    if (id && category) {
      const serial = generation.current.begin();
      api(`/providers/${encodeURIComponent(id)}`)
        .then(() => {
          if (generation.current.valid(serial))
            turn(
              { type: "resume" },
              { ...empty, category, city: selectedCity },
            );
        })
        .catch((e) => {
          if (generation.current.valid(serial)) setError(e.message);
        });
    }
  }, [loading, selectedCity, user?._id]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  const signIn = () => {
    savePublicSelection(sessionStorage, state);
    navigate("/login", { state: { from: "/assistant" } });
  };
  const update = (key, value) => turn({ type: "preferences", [key]: value });
  const blocked =
    busy ||
    bookingBusy ||
    pendingRequest ||
    Boolean(recovered) ||
    resumeRetryAvailable;
  if (
    discoveryState({
      loading: discoveryLoading,
      error: discoveryError,
      categories,
      scope: "catalog",
    }) !== "ready"
  )
    return (
      <div className="container section">
        <h1>Find the right home service</h1>
        <DiscoveryNotice scope="catalog" />
      </div>
    );
  return (
    <div className="gs-assistant gs-assistant--conversational">
      <section className="gs-assistant__intro container">
        <div>
          <span className="eyebrow">
            <Sparkles size={14} /> YOUR HOME, A LITTLE EASIER
          </span>
          <h1>
            Tell us the problem.
            <br />
            <span>Find help. Plan a visit.</span>
          </h1>
          <p>
            A few words are enough to start. Choose an actual professional,
            check a time and review before requesting a booking.
          </p>
        </div>
        <div className="gs-assistant__mode">
          <span className={options.aiAvailable ? "is-live" : ""} />
          <div>
            <strong>
              {options.aiAvailable
                ? "Optional AI guidance"
                : "Guided service helper"}
            </strong>
            <small>
              {options.aiAvailable
                ? "Guided multilingual phrases, with optional keyword-based AI matching."
                : "Tested English, Hindi, Gujarati and romanized service phrases. No AI account needed."}
            </small>
          </div>
        </div>
      </section>
      <div className="container">
        <FacultyDemoToggle />
      </div>
      {resumeRetryAvailable && (
        <section className="container" role="alert">
          <p>
            A saved request could not be checked. Retry before preparing another
            request.
          </p>
          <button
            className="btn light"
            disabled={busy || bookingBusy}
            onClick={() => setRecoveryRetry((v) => v + 1)}
          >
            Retry saved request
          </button>
        </section>
      )}
      {recovered && user?.role === "customer" && (
        <section
          className="container gs-assistant__resume"
          aria-label="Saved request"
        >
          <h2>
            {recovered.booking
              ? "Your saved booking"
              : "Resume your prepared request"}
          </h2>
          <AssistantBooking
            key={"resume:" + user._id}
            customerId={user._id}
            resume={recovered}
            onUncertain={setPendingRequest}
            provider={
              recovered.draft?.provider || recovered.booking?.provider || {}
            }
            category={recovered.draft?.category || {}}
            state={{ ...empty, city: recovered.draft?.city || selectedCity }}
            onBusy={setBookingBusy}
            onProgress={setProgress}
            onDetails={() => {}}
            onEditResume={() => {
              setBookingDetails(
                recovered.draft
                  ? {
                      address: recovered.draft.address,
                      notes: recovered.draft.notes,
                      owner: user._id,
                      city: recovered.draft.city,
                      area: recovered.draft.provider.area,
                      category: recovered.draft.category.slug,
                      problem: "",
                    }
                  : null,
              );
              setRecovered(null);
              setPendingRequest(false);
              setBookingBusy(false);
            }}
            onRefresh={() =>
              setError(
                "Use Edit details to choose current options. Retry an uncertain confirmation using the same request.",
              )
            }
          />
          {!pendingRequest && (
            <button
              className="btn light"
              type="button"
              disabled={bookingBusy}
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                setBookingBusy(true);
                try {
                  const ref = readDraftReference(sessionStorage, user._id);
                  if (ref && !recovered.booking)
                    await api("/assistant/drafts/" + ref.id, {
                      method: "DELETE",
                    });
                  clearDraftReference(sessionStorage, ref?.id);
                  setRecovered(null);
                  setPendingRequest(false);
                  setError("");
                } catch {
                  setError(
                    "The saved request could not be cancelled. Retry or open My bookings to check its status.",
                  );
                } finally {
                  lock.current = false;
                  setBookingBusy(false);
                }
              }}
            >
              {recovered.booking
                ? "Start a separate request"
                : "Cancel this draft"}
            </button>
          )}
        </section>
      )}

      <div className="container gs-assistant__layout">
        <section
          className="gs-assistant__conversation"
          aria-label="Service conversation"
        >
          <div className="gs-assistant__chat-head">
            <MessageCircle size={22} />
            <div>
              <h2>GharSeva helper</h2>
              <p>{progress} · Appointment times in IST</p>
            </div>
            <button
              type="button"
              aria-label="Start a new conversation"
              disabled={blocked}
              onClick={async () => {
                const ref = readDraftReference(sessionStorage, user?._id);
                if (ref) {
                  try {
                    await api("/assistant/drafts/" + ref.id, {
                      method: "DELETE",
                    });
                    clearDraftReference(sessionStorage, ref.id);
                  } catch {
                    setError(
                      "The prepared request could not be cancelled. Try again.",
                    );
                    return;
                  }
                }
                setState({ ...empty, city: selectedCity });
                setResult(null);
                setMessages([]);
                setError("");
                setInput("");
                setProgress("Discovery");
                setBookingDetails(null);
              }}
            >
              <RotateCcw size={17} />
            </button>
          </div>
          <div
            className="gs-assistant__messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            <div className="gs-assistant__bubble">
              <span className="gs-assistant__speaker">GharSeva helper</span>
              <p>
                What needs attention? Try “Tap leaking”. I’ll help you choose a
                service and an available professional.
              </p>
              <small>
                Use the private address step for your exact address. Keep
                contact details, documents and payment information out of chat.
              </small>
            </div>
            {messages.map((m, i) => (
              <div
                key={i}
                className={`gs-assistant__bubble ${m.role === "user" ? "is-user" : ""}`}
              >
                <span className="gs-assistant__speaker">
                  {m.role === "user" ? "You" : "GharSeva helper"}
                </span>
                <p className="gs-assistant__text">{m.content}</p>
              </div>
            ))}
            {busy && (
              <p role="status" className="gs-assistant__thinking">
                <LoaderCircle size={16} /> Checking your next step…
              </p>
            )}
            <div ref={end} />
          </div>
          {!messages.length && (
            <div className="gs-assistant__starters">
              {starters.map((s) => (
                <button
                  type="button"
                  key={s}
                  disabled={blocked}
                  onClick={() => turn({ type: "message", value: s })}
                >
                  {s}
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          )}
          {error && (
            <div className="gs-assistant__error" role="alert">
              {error}{" "}
              {retry && (
                <button
                  className="text-link"
                  type="button"
                  disabled={blocked}
                  onClick={() => turn(retry.event, retry.base)}
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {result?.notice && (
            <p className="gs-assistant__notice">{result.notice}</p>
          )}
          {result?.urgent ? (
            <div className="gs-assistant__safety" role="alert">
              <ShieldCheck size={22} />
              <h3>Put safety first.</h3>
              <p>
                GharSeva is not an emergency service. Keep away from the hazard
                and contact the appropriate local emergency service or utility.
              </p>
            </div>
          ) : (
            <>
              {!!result?.quickReplies?.length && (
                <div
                  className="gs-assistant__quick"
                  aria-label="Suggested replies"
                >
                  {result.quickReplies.map((q) => (
                    <button
                      className="btn light small"
                      type="button"
                      key={q}
                      disabled={blocked}
                      onClick={() => turn({ type: "message", value: q })}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {state.category && state.city && !state.date && (
                <label className="gs-assistant__inline-control">
                  Preferred date (IST)
                  <input
                    aria-label="Preferred date"
                    type="date"
                    min={indiaToday()}
                    max={indiaDateAfter(90)}
                    value={state.date}
                    disabled={blocked}
                    onChange={(e) => update("date", e.target.value)}
                  />
                </label>
              )}
              {!state.providerId && !!result?.providers?.length && (
                <div
                  className="gs-assistant__providers gs-assistant__inline-providers"
                  aria-label="Available professionals"
                >
                  <p className="gs-assistant__notice">
                    {state.sort === "price"
                      ? "Lowest starting estimate first"
                      : "Sorted by rating, review count, then starting estimate"}
                    . Availability is checked again before booking.
                  </p>
                  {result.providers.map((p) => (
                    <article className="gs-assistant__provider" key={p._id}>
                      <div className="gs-assistant__work">
                        <WorkPhoto
                          photo={resolveWorkImages(p, { publicView: true })[0]}
                          showCaption
                        />
                      </div>
                      <h3>{p.name}</h3>
                      {p.facultyDemo && (
                        <p role="status">
                          <strong>{p.facultyDemoLabel}</strong>
                        </p>
                      )}
                      <p>
                        <MapPin size={13} /> {p.area}, {p.city} ·{" "}
                        {result.category.name}
                      </p>
                      <p>
                        {p.facultyDemo
                          ? "Display only — no bookings or payments"
                          : p.reviews
                            ? `${p.rating}/5 from ${p.reviews} reviews`
                            : "No reviews yet"}
                      </p>
                      <ul>
                        {p.reasons?.map((r) => (
                          <li key={r}>
                            <CheckCircle2 size={12} />
                            {r}
                          </li>
                        ))}
                      </ul>
                      <div>
                        <span>
                          <small>
                            {p.facultyDemo
                              ? "Illustrative rate"
                              : "Starting visit estimate"}
                          </small>
                          <strong>{money(p.price)}</strong>
                        </span>
                        <button
                          className="btn small"
                          type="button"
                          disabled={
                            p.facultyDemo ||
                            blocked ||
                            result.bookingEnabled === false
                          }
                          onClick={() =>
                            turn({ type: "provider", value: String(p._id) })
                          }
                        >
                          Choose professional
                        </button>
                      </div>
                      <Link
                        to={`/providers/${p._id}${p.facultyDemo ? "?facultyDemo=1" : ""}`}
                      >
                        View profile & work photographs
                      </Link>
                    </article>
                  ))}
                </div>
              )}
              {state.category &&
                state.city &&
                state.date &&
                result &&
                !error &&
                !result.providers?.length &&
                !busy && (
                  <div className="gs-assistant__empty">
                    <p>
                      {result?.bookingEnabled === false
                        ? "Booking requests are paused."
                        : "No free appointments match this city, area, date and budget."}
                    </p>
                    <p>
                      Change a preference above. Your requested area will stay
                      unchanged until you choose another.
                    </p>
                  </div>
                )}
              {selected && (
                <section
                  className="gs-assistant__inline-booking"
                  aria-label="Booking steps"
                >
                  <h3>
                    {selected.name} · {result.category.name}
                  </h3>
                  <p>
                    {selected.area}, {selected.city} · Starting estimate{" "}
                    {money(selected.price)}
                  </p>
                  <label>
                    Appointment date (IST)
                    <input
                      aria-label="Selected appointment date"
                      type="date"
                      min={indiaToday()}
                      max={indiaDateAfter(90)}
                      value={state.date}
                      disabled={blocked}
                      onChange={(e) => update("date", e.target.value)}
                    />
                  </label>
                  <div
                    className="gs-assistant__slots"
                    role="group"
                    aria-label="Available appointment times"
                  >
                    {selected.availability.slots.map((time) => (
                      <button
                        key={time}
                        type="button"
                        aria-pressed={state.time === time}
                        disabled={blocked}
                        onClick={() => update("time", time)}
                      >
                        <Clock size={13} />
                        {time} IST
                      </button>
                    ))}
                  </div>
                  {state.time &&
                    (!user ? (
                      <div className="gs-assistant__auth">
                        <p>
                          Sign in as a customer to choose your private address
                          and request this appointment. Your public selection
                          will be kept for 20 minutes.
                        </p>
                        <button className="btn" type="button" onClick={signIn}>
                          Sign in to continue
                        </button>
                      </div>
                    ) : user.role !== "customer" ? (
                      <p role="alert">
                        A customer account is required to book. Your current
                        account keeps its existing role.
                      </p>
                    ) : (
                      <AssistantBooking
                        key={`${user._id}:${selected._id}:${state.category}:${state.date}:${state.time}`}
                        disabled={busy}
                        onUncertain={setPendingRequest}
                        customerId={user._id}
                        provider={selected}
                        category={result.category}
                        state={state}
                        onBusy={setBookingBusy}
                        onProgress={setProgress}
                        onRefresh={() => turn({ type: "resume" })}
                        previous={
                          bookingDetails?.owner === user._id &&
                          bookingDetails.city === selected.city &&
                          bookingDetails.area === selected.area
                            ? {
                                ...bookingDetails,
                                notes:
                                  bookingDetails.category === state.category &&
                                  bookingDetails.problem === state.problem
                                    ? bookingDetails.notes
                                    : state.problem,
                              }
                            : null
                        }
                        onDetails={(details) =>
                          setBookingDetails({
                            ...details,
                            owner: user._id,
                            city: selected.city,
                            area: selected.area,
                            category: state.category,
                            problem: state.problem,
                          })
                        }
                      />
                    ))}
                </section>
              )}
            </>
          )}
          <form
            className="gs-assistant__composer"
            onSubmit={(e) => {
              e.preventDefault();
              turn({ type: "message", value: input });
            }}
          >
            <label htmlFor="gs-service-problem">
              {state.category
                ? "Update your preferences"
                : "What do you need help with?"}
            </label>
            <textarea
              id="gs-service-problem"
              rows={2}
              maxLength={1500}
              value={input}
              disabled={blocked}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                state.category
                  ? "Actually tomorrow · Change the city · Show cheaper options"
                  : "Tap leaking · AC not cooling"
              }
            />
            <div>
              <small>One step at a time</small>
              <button
                className="btn"
                type="submit"
                disabled={blocked || !input.trim()}
              >
                {busy ? "Checking…" : "Send"}
                <Send size={15} />
              </button>
            </div>
            {options.aiAvailable && !state.category && (
              <label className="gs-assistant__ai-choice">
                <input
                  type="checkbox"
                  checked={useAI}
                  disabled={blocked}
                  onChange={(e) => setUseAI(e.target.checked)}
                />
                <span>
                  Send fixed service keywords and enabled service names to
                  OpenAI. Raw messages, addresses, codes and booking details
                  stay out. Optional.
                </span>
              </label>
            )}
          </form>
        </section>
        <aside
          className="gs-assistant__results"
          aria-label="Conversation preferences"
        >
          <div className="gs-assistant__results-title">
            <span className="eyebrow">YOUR PREFERENCES</span>
            <h2>{result?.category?.name || "Find the right service"}</h2>
            <p>
              {state.problem ||
                "Describe the task or choose an enabled service."}
            </p>
          </div>
          <div className="gs-assistant__filters">
            <label>
              Service
              <select
                aria-label="Service category"
                value={state.category}
                disabled={blocked}
                onChange={(e) =>
                  e.target.value &&
                  turn({ type: "category", value: e.target.value })
                }
              >
                <option value="">Choose a service</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              City
              <select
                aria-label="Service city"
                value={state.city}
                disabled={blocked}
                onChange={(e) =>
                  turn({ type: "preferences", city: e.target.value, area: "" })
                }
              >
                <option value="">Choose city</option>
                {cities.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {state.city && (
              <label>
                Service area (optional)
                <select
                  aria-label="Service area"
                  value={state.area}
                  disabled={blocked}
                  onChange={(e) => update("area", e.target.value)}
                >
                  <option value="">Any listed area in {state.city}</option>
                  {[
                    ...new Set(
                      providers
                        .filter((p) => p.city === state.city)
                        .map((p) => p.area),
                    ),
                  ]
                    .sort()
                    .map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Maximum starting estimate (optional)
              <input
                aria-label="Maximum starting visit price"
                type="number"
                min="100"
                max="50000"
                defaultValue={state.budget ?? ""}
                key={state.budget ?? "any"}
                disabled={blocked}
                placeholder="Any budget"
                onBlur={(e) => {
                  if (
                    e.target.reportValidity() &&
                    String(state.budget ?? "") !== e.target.value
                  )
                    update("budget", e.target.value);
                }}
              />
            </label>
            {state.date && (
              <label>
                Preferred date (IST)
                <input
                  aria-label="Preferred date"
                  type="date"
                  min={indiaToday()}
                  max={indiaDateAfter(90)}
                  value={state.date}
                  disabled={blocked}
                  onChange={(e) => update("date", e.target.value)}
                />
              </label>
            )}
            <button
              className="btn light"
              type="button"
              disabled={blocked}
              onClick={() => turn({ type: "problem" })}
            >
              Change problem
            </button>
            <small>
              Extra work or materials require agreement with the professional. A
              free slot is not reserved until the booking request succeeds.
            </small>
          </div>
        </aside>
      </div>
      <section className="container gs-assistant__bottom">
        <ShieldCheck size={17} />
        <p>
          Only your explicit confirmation sends a PENDING request. The
          professional must accept the booking. Share your visit OTP when
          they arrive. After service, approve the final bill, pay cash to
          the provider, and confirm the payment in GharSeva.
        </p>
      </section>
    </div>
  );
}
function AssistantBooking({
  customerId,
  disabled = false,
  resume,
  onUncertain = () => {},
  onEditResume,
  provider,
  category,
  state,
  onBusy,
  onProgress,
  onRefresh,
  previous,
  onDetails,
}) {
  const [account, setAccount] = useState(null),
    [stage, setStage] = useState(resume?.draft ? "review" : "address"),
    [address, setAddress] = useState(
      resume?.draft?.address || previous?.address || "",
    ),
    [notes, setNotes] = useState(
      (resume?.draft?.notes ?? previous?.notes ?? state.problem).slice(0, 1000),
    ),
    [prepared, setPrepared] = useState(resume?.draft || null),
    [receipt, setReceipt] = useState(resume?.booking || null),
    [uncertain, setUncertain] = useState(resume?.pending || false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [accountLoading, setAccountLoading] = useState(true);
  const lock = useRef(false),
    storedDraft = useRef(resume?.draft?._id || null),
    confirming = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const updateAddress = (value) => {
    setAddress(value);
    onDetails({ address: value, notes });
  };
  const updateNotes = (value) => {
    setNotes(value);
    onDetails({ address, notes: value });
  };
  const validateAccount = (a) => {
    if (a.role !== "customer" || a._id !== customerId)
      throw new Error(
        "Your account changed. Sign in as the intended customer and reopen the assistant.",
      );
    return a;
  };
  const retryAccount = async () => {
    setAccountLoading(true);
    setError("");
    try {
      setAccount(validateAccount(await api("/auth/me")));
    } catch (e) {
      setAccount(null);
      setError(e.message);
    } finally {
      setAccountLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    api("/auth/me")
      .then(validateAccount)
      .then((a) => {
        if (active) setAccount(a);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setAccountLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function request(action) {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
      if (confirming.current && (!e.status || e.status >= 500)) {
        setUncertain(true);
        onUncertain(true);
      }
      if (e.status === 409 || e.status === 404) {
        setUncertain(false);
        onUncertain(false);
        clearDraftReference(sessionStorage, storedDraft.current);
        setStage("address");
        setPrepared(null);
        onProgress("Review needs updating");
        if (onEditResume) onEditResume();
      }
    } finally {
      confirming.current = false;
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  const prepare = (e) => {
    e.preventDefault();
    request(async () => {
      const d = await api("/assistant/drafts", {
        method: "POST",
        body: {
          providerId: provider._id,
          city: state.city,
          category: category.slug,
          date: state.date,
          time: state.time,
          address,
          notes,
          displayedPrice: provider.price,
        },
      });
      storedDraft.current = d._id;
      saveDraftReference(sessionStorage, customerId, d);
      setPrepared(d);
      setStage("review");
      onProgress("Review booking");
    });
  };
  const edit = () =>
    request(async () => {
      if (prepared)
        await api(`/assistant/drafts/${prepared._id}`, { method: "DELETE" });
      clearDraftReference(sessionStorage, storedDraft.current);
      storedDraft.current = null;
      setPrepared(null);
      if (onEditResume) {
        onEditResume();
        return;
      }
      setStage("address");
      onProgress("Address & notes");
    });
  const confirm = () =>
    request(async () => {
      confirming.current = true;
      onUncertain(true);
      saveDraftReference(sessionStorage, customerId, prepared, true);
      const r = await api(`/assistant/drafts/${prepared._id}/confirm`, {
        method: "POST",
        body: { confirm: true },
      });
      clearDraftReference(sessionStorage, storedDraft.current);
      storedDraft.current = null;
      setUncertain(false);
      onUncertain(false);
      setReceipt(r);
      onProgress("Request sent");
    });
  if (receipt)
    return (
      <div className="gs-assistant__receipt" role="status">
        <CheckCircle2 size={30} />
        <h3>
          Booking {String(receipt._id).slice(-8).toUpperCase()}:{" "}
          {receipt.status}
        </h3>
        <p>
          {receipt.status === "PENDING"
            ? (receipt.provider?.name || provider.name) +
              " still needs to accept your request."
            : "This is the saved server status; open your booking for current next steps."}{" "}
          Appointment: {prettyDate(receipt.date)} at {receipt.time} IST.
        </p>
        <Link className="btn" to="/dashboard/customer?section=bookings">
          View my booking
        </Link>
      </div>
    );
  return (
    <div className="gs-assistant__private-step">
      {error && (
        <div className="gs-assistant__error" role="alert">
          {error} If a price or time changed, refresh your professional options
          and review again.
          <button
            className="text-link"
            type="button"
            disabled={busy || accountLoading}
            onClick={account ? (uncertain ? confirm : onRefresh) : retryAccount}
          >
            {account
              ? uncertain
                ? "Retry same confirmation"
                : "Refresh options"
              : "Retry customer session"}
          </button>
        </div>
      )}
      {uncertain && (
        <p role="status">
          Confirmation is uncertain. Retry this same request to retrieve its
          saved result. Do not prepare another request until it is resolved.
        </p>
      )}
      {accountLoading ? (
        <p role="status">Loading your private address choices…</p>
      ) : !account ? (
        <p>
          A current customer session is required.{" "}
          <Link to="/login" state={{ from: "/assistant" }}>
            Customer sign-in
          </Link>
        </p>
      ) : stage === "review" && prepared ? (
        <>
          <h3>Review your booking request</h3>
          <dl className="gs-assistant__review">
            <div>
              <dt>Professional & service</dt>
              <dd>
                {prepared.provider.name} · {prepared.category.name}
              </dd>
            </div>
            <div>
              <dt>Appointment (IST)</dt>
              <dd>
                {prettyDate(prepared.date)} at {prepared.time}
              </dd>
            </div>
            <div>
              <dt>Requested area</dt>
              <dd>
                {provider.area}, {provider.city}
              </dd>
            </div>
            <div>
              <dt>Service address</dt>
              <dd>{prepared.address}</dd>
            </div>
            <div>
              <dt>Problem notes</dt>
              <dd>{prepared.notes || "No additional notes"}</dd>
            </div>
            <div>
              <dt>Starting estimate</dt>
              <dd>
                {money(prepared.price)}
                <small>{prepared.priceBasis}</small>
              </dd>
            </div>
          </dl>
          <p>Cash after service — no advance payment required.</p>
          <p className="gs-assistant__review-note">
            This draft expires in 20 minutes and does not hold the slot.
            Additional work/materials need agreement. The professional must
            accept the PENDING request. Share the visit OTP before work.
            After service, approve the final bill, pay cash directly to the provider,
            and confirm cash payment in GharSeva. No advance is required.
          </p>
          <div className="gs-assistant__booking-actions">
            <button
              className="btn light"
              type="button"
              disabled={busy || disabled || uncertain}
              onClick={edit}
            >
              Edit details
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy || disabled || accountLoading || !account}
              onClick={confirm}
            >
              {busy ? "Sending…" : "Confirm & request booking"}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={prepare}>
          <h3>Where should the professional visit?</h3>
          <p>
            Choose a saved address or enter an address in {provider.area},{" "}
            {provider.city}. Nothing in this step is sent to AI.
          </p>
          {!!account?.addresses?.length && (
            <div className="gs-assistant__quick" aria-label="Saved addresses">
              {account.addresses.map((a) => (
                <button
                  className="btn light small"
                  type="button"
                  key={a._id}
                  disabled={busy}
                  aria-pressed={address === a.address}
                  onClick={() => updateAddress(a.address)}
                >
                  Use {a.label}
                </button>
              ))}
            </div>
          )}
          <label htmlFor="assistant-address">Service address</label>
          <textarea
            id="assistant-address"
            rows={3}
            minLength={10}
            maxLength={500}
            required
            value={address}
            disabled={busy || disabled || account?.role !== "customer"}
            onChange={(e) => updateAddress(e.target.value)}
          />
          <details>
            <summary>Edit problem notes (optional)</summary>
            <label htmlFor="assistant-notes">Notes for the professional</label>
            <textarea
              id="assistant-notes"
              rows={3}
              maxLength={1000}
              value={notes}
              disabled={busy}
              onChange={(e) => updateNotes(e.target.value)}
            />
          </details>
          <button
            className="btn"
            type="submit"
            disabled={
              busy ||
              disabled ||
              account?.role !== "customer" ||
              address.trim().length < 10
            }
          >
            {busy ? "Checking current details…" : "Review booking request"}
            <ArrowRight size={15} />
          </button>
        </form>
      )}
    </div>
  );
}
