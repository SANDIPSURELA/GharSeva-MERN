import { supportedCities, citySelection } from "../../../shared/cities.js";
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
import { api, money, indiaToday, indiaDateAfter, prettyDate } from "../api";
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
const resumeKey = "gs_assistant_public_selection";
export function ServiceAssistant() {
  const { user, categories, providers, selectedCity, setSelectedCity } =
      useApp(),
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
    [bookingDetails, setBookingDetails] = useState(null);
  const lock = useRef(false),
    end = useRef(null),
    restored = useRef(false);
  const cities = supportedCities;
  const currentCity = useRef(selectedCity),
    generation = useRef(0);
  useEffect(() => {
    if (currentCity.current === selectedCity) return;
    currentCity.current = selectedCity;
    generation.current++;
    lock.current = false;
    setBusy(false);
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
    if (lock.current || bookingBusy) return;
    lock.current = true;
    const serial = generation.current;
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
        },
      });
      if (serial !== generation.current) return;
      currentCity.current = response.state.city;
      setSelectedCity(response.state.city);
      setBookingDetails(null);
      setState(response.state);
      setResult(response);
      setInput("");
      setProgress(response.state.providerId ? "Appointment" : "Discovery");
      const userText =
        event.type === "message"
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
      if (serial !== generation.current) return;
      setError(
        e.status === 404
          ? "The API needs a restart to load this assistant update. Restart your existing backend, then retry."
          : e.message,
      );
      setRetry({ event, base });
    } finally {
      if (serial === generation.current) {
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
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(resumeKey) || "null");
      sessionStorage.removeItem(resumeKey);
      if (
        saved?.expiresAt > Date.now() &&
        saved.selection.city === selectedCity
      ) {
        turn({ type: "resume" }, { ...empty, ...saved.selection });
        return;
      }
    } catch {
      /* Discovery remains available if browser storage is disabled. */
    }
    const id = params.get("provider"),
      category = params.get("service");
    if (id && category)
      api(`/providers/${encodeURIComponent(id)}`)
        .then((p) =>
          turn({ type: "resume" }, { ...empty, category, city: selectedCity }),
        )
        .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  const signIn = () => {
    const { problem, ...selection } = state;
    try {
      sessionStorage.setItem(
        resumeKey,
        JSON.stringify({ selection, expiresAt: Date.now() + 20 * 60000 }),
      );
    } catch {}
    navigate("/login", { state: { from: "/assistant" } });
  };
  const update = (key, value) => turn({ type: "preferences", [key]: value });
  const blocked = busy || bookingBusy;
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
                ? "English, Hindi, Gujarati and mixed-language descriptions through the configured model."
                : "Common English service rules. Multilingual AI requires server setup."}
            </small>
          </div>
        </div>
      </section>
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
              onClick={() => {
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
                      <p>
                        <MapPin size={13} /> {p.area}, {p.city} ·{" "}
                        {result.category.name}
                      </p>
                      <p>
                        {p.reviews
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
                          <small>Starting visit estimate</small>
                          <strong>{money(p.price)}</strong>
                        </span>
                        <button
                          className="btn small"
                          type="button"
                          disabled={blocked || result.bookingEnabled === false}
                          onClick={() =>
                            turn({ type: "provider", value: String(p._id) })
                          }
                        >
                          Choose professional
                        </button>
                      </div>
                      <Link to={`/providers/${p._id}`}>
                        View profile & work photographs
                      </Link>
                    </article>
                  ))}
                </div>
              )}
              {state.category &&
                state.city &&
                state.date &&
                !result?.providers?.length &&
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
                  Send my problem description and enabled service names to
                  OpenAI for language understanding. Address and booking details
                  stay separate. Optional.
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
          professional must accept. No payment is started here; the visit-start
          OTP still applies.
        </p>
      </section>
    </div>
  );
}
function AssistantBooking({
  customerId,
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
    [stage, setStage] = useState("address"),
    [address, setAddress] = useState(previous?.address || ""),
    [notes, setNotes] = useState(
      (previous?.notes ?? state.problem).slice(0, 1000),
    ),
    [prepared, setPrepared] = useState(null),
    [receipt, setReceipt] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [accountLoading, setAccountLoading] = useState(true);
  const lock = useRef(false),
    storedDraft = useRef(null);
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
      if (storedDraft.current)
        api(`/assistant/drafts/${storedDraft.current}`, {
          method: "DELETE",
        }).catch(() => {});
    };
  }, []);
  async function request(action) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
      if (e.status === 409 || e.status === 404) {
        setStage("address");
        setPrepared(null);
        onProgress("Review needs updating");
      }
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
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
      setPrepared(d);
      setStage("review");
      onProgress("Review booking");
    });
  };
  const edit = () =>
    request(async () => {
      if (prepared)
        await api(`/assistant/drafts/${prepared._id}`, { method: "DELETE" });
      storedDraft.current = null;
      setPrepared(null);
      setStage("address");
      onProgress("Address & notes");
    });
  const confirm = () =>
    request(async () => {
      const r = await api(`/assistant/drafts/${prepared._id}/confirm`, {
        method: "POST",
        body: { confirm: true },
      });
      storedDraft.current = null;
      setReceipt(r);
      onProgress("Request sent");
    });
  if (receipt)
    return (
      <div className="gs-assistant__receipt" role="status">
        <CheckCircle2 size={30} />
        <h3>Your PENDING request has been sent.</h3>
        <p>
          {provider.name} still needs to accept your request for{" "}
          {prettyDate(receipt.date)} at {receipt.time} IST.
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
            onClick={account ? onRefresh : retryAccount}
          >
            {account ? "Refresh options" : "Retry customer session"}
          </button>
        </div>
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
          <p className="gs-assistant__review-note">
            This draft expires in 20 minutes and does not hold the slot.
            Additional work/materials need agreement. The professional must
            accept the PENDING request. No payment is initiated.
          </p>
          <div className="gs-assistant__booking-actions">
            <button
              className="btn light"
              type="button"
              disabled={busy}
              onClick={edit}
            >
              Edit details
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy}
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
            disabled={busy || account?.role !== "customer"}
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
              busy || account?.role !== "customer" || address.trim().length < 10
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
