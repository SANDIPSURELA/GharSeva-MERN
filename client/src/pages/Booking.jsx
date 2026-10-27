import { useState, useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  ArrowRight,
  MapPin,
  CalendarDays,
  ShieldCheck,
  Clock,
  ChevronRight,
} from "lucide-react";
import { useApp } from "../context";
import { api, money, indiaToday, indiaDateAfter, prettyDate } from "../api";
import { PageHead, Field, Loading, ErrorBox, Avatar } from "../components/UI";
function bookingDate(value) {
  const parsed = new Date(`${value}T12:00:00+05:30`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value >= indiaToday() &&
    value <= indiaDateAfter(90)
    ? value
    : indiaDateAfter(1);
}
export function Booking() {
  const { id } = useParams(),
    [params] = useSearchParams(),
    { user, config, selectedCity } = useApp();
  const [p, setP] = useState(null),
    [slots, setSlots] = useState([]),
    [slotsLoading, setSlotsLoading] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState(null);
  const [form, setForm] = useState({
    date: bookingDate(params.get("date")),
    time: "",
    address: user?.addresses?.[0]?.address || "",
    notes: params.get("notes") || "",
    category: params.get("category") || "",
    urgency: params.get("urgency") === "PRIORITY" ? "PRIORITY" : "STANDARD",
  });
  const preferredSlot = useRef(params.get("time") || "");
  const previousCity = useRef(selectedCity);
  useEffect(() => {
    if (previousCity.current === selectedCity) return;
    previousCity.current = selectedCity;
    preferredSlot.current = "";
    setSlots([]);
    setForm((f) => ({ ...f, time: "", address: "" }));
  }, [selectedCity]);
  useEffect(() => {
    let active = true;
    setError("");
    api(`/providers/${id}`)
      .then((p) => {
        if (active) setP(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (!p || !form.date || p.city !== selectedCity) return;
    let active = true;
    const preferred = preferredSlot.current;
    setSlotsLoading(true);
    setError("");
    setSlots([]);
    setForm((f) => ({ ...f, time: "" }));
    api(`/providers/${id}/slots?date=${form.date}`)
      .then((r) => {
        if (active) {
          setSlots(r.slots);
          setForm((f) => ({
            ...f,
            time: r.slots.includes(preferred) ? preferred : "",
          }));
          preferredSlot.current = "";
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, p, form.date, selectedCity]);
  if (p && p.city !== selectedCity)
    return (
      <section className="container section">
        <h1>Choose a professional in {selectedCity || "your city"}</h1>
        <p>
          This professional serves {p.city}. Use Change city above to browse
          there explicitly, or choose another professional.
        </p>
        <Link className="btn" to="/services">
          Find local professionals
        </Link>
      </section>
    );
  if (!p)
    return (
      <div className="container section">
        {error ? <ErrorBox message={error} /> : <Loading />}
      </div>
    );
  if (receipt)
    return (
      <section className="section">
        <div className="container receipt card booking-receipt">
          <span className="receipt-icon">
            <CheckCircle2 />
          </span>
          <span className="eyebrow">YOUR REQUEST IS ON ITS WAY</span>
          <h1>
            One step closer
            <br />
            to a happier home.
          </h1>
          <p>
            {p.name} has received your request for {prettyDate(receipt.date)} at{" "}
            {receipt.time}. You'll see their response in your dashboard.
          </p>
          <div className="receipt-reference">
            Booking reference{" "}
            <strong>GS-{receipt._id.slice(-8).toUpperCase()}</strong>
          </div>
          <div className="info-box">
            <ShieldCheck />
            <span>
              Your visit code is available in your customer dashboard. Share it
              only when you're ready for the service to start.
            </span>
          </div>
          <Link className="btn" to="/dashboard/customer?section=bookings">
            View my booking <ArrowRight size={17} />
          </Link>
        </div>
      </section>
    );
  return (
    <>
      <PageHead
        eyebrow="MAKE IT YOUR TIME"
        title="A helping hand, booked around you."
        text="Choose your appointment and tell your professional what needs attention."
      />
      <section className="section">
        <div className="container booking-layout">
          <form
            className="card booking-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (slotsLoading || !slots.includes(form.time)) {
                setError("Choose an available time slot.");
                return;
              }
              setBusy(true);
              setError("");
              try {
                setReceipt(
                  await api("/bookings", {
                    method: "POST",
                    body: {
                      ...form,
                      city: selectedCity,
                      category: form.category || p.category,
                      providerId: p._id,
                    },
                  }),
                );
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              <strong>Service city: {selectedCity}</strong>. Enter the full
              address and locality below.
            </p>
            <h2>
              <span className="step-number">1</span>Choose your appointment
            </h2>
            <Field label="Service to book">
              <select
                value={form.category || p.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                required
              >
                {(p.categories || [p.category]).map((slug, i) => (
                  <option key={slug} value={slug}>
                    {p.categoryNames?.[i] || p.categoryName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Service date">
              <input
                type="date"
                required
                min={indiaToday()}
                max={indiaDateAfter(90)}
                aria-label="Service date"
                value={form.date}
                onChange={(e) => {
                  preferredSlot.current = "";
                  setForm({ ...form, date: e.target.value, time: "" });
                }}
              />
            </Field>
            <div className="field">
              <span>Available times</span>
              <div className="slot-grid">
                {slotsLoading ? (
                  <span>Checking availability…</span>
                ) : slots.length ? (
                  slots.map((s) => (
                    <button
                      type="button"
                      key={s}
                      className={form.time === s ? "slot active" : "slot"}
                      onClick={() => setForm({ ...form, time: s })}
                    >
                      <Clock size={15} />
                      {s}
                    </button>
                  ))
                ) : (
                  <p>No available slots on this date. Choose another day.</p>
                )}
              </div>
            </div>
            <h2>
              <span className="step-number">2</span>A few helpful details
            </h2>
            {user.addresses?.length > 0 && (
              <Field label="Use a saved address">
                <select
                  value=""
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                >
                  <option value="">Choose a saved address…</option>
                  {user.addresses.map((a) => (
                    <option value={a.address} key={a._id}>
                      {a.label}: {a.address}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Full service address">
              <textarea
                required
                minLength={10}
                maxLength={500}
                rows={3}
                placeholder="House number, street, area, city and landmark"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
            <Field label="What needs attention? (optional)">
              <textarea
                maxLength={1000}
                rows={3}
                placeholder="Share the issue, access instructions or other details."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <Field label="Request priority">
              <select
                value={form.urgency}
                onChange={(e) => setForm({ ...form, urgency: e.target.value })}
              >
                <option value="STANDARD">Standard request</option>
                <option value="PRIORITY">
                  Priority — highlight to the provider
                </option>
              </select>
            </Field>
            <p className="muted small-text">
              Priority highlights your request. It does not guarantee faster
              acceptance or a different slot.
            </p>
            <ErrorBox message={error} />
            {!config.bookingEnabled && (
              <ErrorBox message="Bookings are temporarily paused by the administrator." />
            )}
            <button
              className="btn full"
              disabled={
                busy ||
                slotsLoading ||
                !slots.includes(form.time) ||
                !config.bookingEnabled
              }
            >
              {busy ? "Submitting…" : "Send booking request"}
              <ArrowRight size={17} />
            </button>
          </form>
          <aside>
            <div className="card book-aside">
              <div className="provider-person">
                <Avatar person={p} />
                <div>
                  <h3>{p.name}</h3>
                  <p>{p.categoryName}</p>
                </div>
              </div>
              <hr />
              <h3>Your visit at a glance</h3>
              <div className="summary-row">
                <span>Starting visit price</span>
                <strong>{money(p.price)}</strong>
              </div>
              <div className="summary-row">
                <span>Appointment</span>
                <strong>
                  {prettyDate(form.date)}
                  <br />
                  {form.time || "Select a time"}
                </strong>
              </div>
              <div className="summary-row">
                <span>Payment</span>
                <strong>Deposit + approved balance online</strong>
              </div>
              <hr />
              <div className="summary-row total">
                <span>Starting estimate</span>
                <strong>{money(p.price)}</strong>
              </div>
              <p className="small-text muted">
                Additional parts or work may cost extra. Agree with your
                professional through the approval flow. After acceptance, pay
                the required deposit online before arrival verification and
                work. After completion, approve the itemised bill and pay the
                remaining balance online. Checkout uses clearly labelled TEST
                payments; unavailable configuration blocks payment.
              </p>
              <div className="info-box">
                <ShieldCheck size={20} />
                <span>
                  You control the start. Your visit OTP is required before work
                  begins.
                </span>
              </div>
              <Link className="text-link" to={`/providers/${p._id}`}>
                Back to profile <ChevronRight size={15} />
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
