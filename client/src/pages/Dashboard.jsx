import { Payments } from "./Payments";
import { FacultyShowcaseAdmin } from "./FacultyShowcaseAdmin";
import { AccountInvitations } from "./AccountInvitations";
import {
  ProviderIdentityVerification,
  IdentityReviewQueue,
} from "./IdentityVerification";
import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resolveWorkImages } from "../../../shared/work-images.js";
import { WorkPhoto } from "../components/WorkPhoto";
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  Heart,
  Star,
  MapPin,
  UserRound,
  Clock,
  CheckCircle2,
  ShieldCheck,
  BriefcaseBusiness,
  Settings,
  Users,
  MessageSquare,
  BarChart3,
  FileText,
  ArrowRight,
  Plus,
  Upload,
  RefreshCw,
  KeyRound,
  Check,
  X,
  Search,
  ChevronRight,
} from "lucide-react";
import { useApp } from "../context";
import { api, money, label, prettyDate, indiaToday } from "../api";
import {
  Avatar,
  Status,
  Stars,
  Field,
  ErrorBox,
  Loading,
  Empty,
  ProviderCard,
  Modal,
} from "../components/UI";
import {
  Applications,
  ProviderApplicationStatus,
  ConnectedSignIn,
} from "./Applications";
const navigation = {
  customer: [
    ["overview", "Overview", LayoutDashboard],
    ["bookings", "My bookings", CalendarDays],
    ["payments", "Bills & payments", BriefcaseBusiness],
    ["favourites", "Saved professionals", Heart],
    ["reviews", "My reviews", Star],
    ["addresses", "Saved addresses", MapPin],
    ["activity", "Booking activity", Clock],
    ["profile", "Account settings", UserRound],
  ],
  provider: [
    ["application", "My application", ClipboardList],
    ["overview", "Overview", LayoutDashboard],
    ["requests", "New requests", CalendarDays],
    ["jobs", "My jobs", BriefcaseBusiness],
    ["payments", "Bills & collection", BriefcaseBusiness],
    ["schedule", "Availability", Clock],
    ["reviews", "Customer reviews", Star],
    ["profile", "Profile & services", UserRound],
    ["documents", "Photos & documents", FileText],
  ],
  admin: [
    ["faculty-showcase", "Faculty Demo Showcase", ShieldCheck],
    ["applications", "Registration requests", ClipboardList],
    ["invitations", "Create accounts", Users],
    ["overview", "Overview", LayoutDashboard],
    ["users", "Customers", Users],
    ["providers", "Providers & approval", ShieldCheck],
    ["bookings", "All bookings", CalendarDays],
    ["payments", "Payment ledger", BriefcaseBusiness],
    ["categories", "Service categories", Settings],
    ["reviews", "Review moderation", Star],
    ["enquiries", "Enquiry inbox", MessageSquare],
    ["reports", "Reports", BarChart3],
    ["settings", "Platform settings", Settings],
  ],
};
const Stat = ({ icon: Icon, title, value, note }) => (
  <article className="stat-card card">
    <span>
      <Icon size={21} />
    </span>
    <div>
      <small>{title}</small>
      <strong>{value}</strong>
      <p>{note}</p>
    </div>
  </article>
);
export function Dashboard() {
  const { user, setUser, categories, providers, refresh, setToast } = useApp();
  const [params, setParams] = useSearchParams();
  const allowed = navigation[user.role];
  const section = allowed.some((x) => x[0] === params.get("section"))
    ? params.get("section")
    : "overview";
  const [bookings, setBookings] = useState([]),
    [reviews, setReviews] = useState([]),
    [admin, setAdmin] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(null),
    [draft, setDraft] = useState({}),
    [search, setSearch] = useState("");
  const reload = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        if (user.role === "admin") {
          const data = await api("/admin/overview");
          setAdmin(data);
          setBookings(data.bookings);
          setReviews(data.reviews);
        } else {
          const [b, r, account] = await Promise.all([
            api("/bookings"),
            api("/reviews/mine"),
            api("/auth/me"),
          ]);
          setUser((current) =>
            current?._id === account._id &&
            new Date(current.updatedAt) > new Date(account.updatedAt)
              ? current
              : account,
          );
          setBookings(b);
          setReviews(r);
        }
        setError("");
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [user._id, user.role, setUser],
  );
  useEffect(() => {
    reload();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") reload(true);
    }, 15000);
    return () => clearInterval(t);
  }, [reload]);
  const act = async (path, body, method = "PATCH") => {
    setBusy(true);
    try {
      const data = await api(path, { method, body });
      await reload(true);
      await refresh();
      setToast("Changes saved.");
      return data;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const statusAction = async (b, status, code) => {
    try {
      await act(`/bookings/${b._id}/status`, { status, code });
      setModal(null);
    } catch {}
  };
  const open = (type, b) => {
    setError("");
    setDraft(
      type === "review"
        ? { rating: 5, feedback: "" }
        : type === "reschedule"
          ? { date: b.date, time: "" }
          : type === "start"
            ? { code: "" }
            : {},
    );
    setModal({ type, booking: b });
  };
  const completed = bookings.filter((b) => b.status === "COMPLETED"),
    active = bookings.filter(
      (b) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(b.status),
    ),
    requests = bookings.filter((b) => b.status === "PENDING"),
    value = completed.reduce((sum, b) => sum + b.price, 0),
    average = reviews.filter((r) => !r.hidden).length
      ? reviews.filter((r) => !r.hidden).reduce((s, r) => s + r.rating, 0) /
        reviews.filter((r) => !r.hidden).length
      : 0;
  const list = (rows) =>
    rows.length ? (
      <div className="booking-list">
        {[...rows]
          .sort(
            (a, b) =>
              Number(b.urgency === "PRIORITY") -
              Number(a.urgency === "PRIORITY"),
          )
          .map((b) => (
            <article className="booking-card" key={b._id}>
              <div className="booking-card-top">
                <span className="booking-reference">
                  GS-{b._id.slice(-8).toUpperCase()}
                </span>
                <div>
                  {b.urgency === "PRIORITY" && (
                    <span className="priority">Priority request</span>
                  )}
                  <Status value={b.status} />
                </div>
              </div>
              <div className="booking-main">
                <Avatar
                  person={user.role === "provider" ? b.customer : b.provider}
                />
                <div>
                  <h3>{b.service}</h3>
                  <p>
                    {user.role === "provider"
                      ? b.customer?.name
                      : b.provider?.name}
                    {user.role === "admin" && ` · for ${b.customer?.name}`}
                  </p>
                </div>
                <strong>{money(b.price)}</strong>
              </div>
              <div className="booking-meta">
                <span>
                  <CalendarDays size={15} />
                  {prettyDate(b.date)} · {b.time}
                </span>
                <span>
                  <MapPin size={15} />
                  {b.address}
                </span>
              </div>
              {b.notes && <p className="booking-notes">{b.notes}</p>}
              {user.role === "customer" &&
                b.visitCode &&
                ["PENDING", "ACCEPTED", "ON_THE_WAY"].includes(b.status) && (
                  <div className="visit-code">
                    <ShieldCheck size={20} />
                    <span>
                      Your visit OTP <strong>{b.visitCode}</strong>
                      <small>
                        Share when your professional arrives and you are ready
                        to begin.
                      </small>
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Generate a new visit code"
                      title="Refresh code"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          await act(
                            `/bookings/${b._id}/visit-code`,
                            {},
                            "POST",
                          );
                        } catch {}
                      }}
                    >
                      <RefreshCw size={17} />
                    </button>
                  </div>
                )}
              <div className="booking-actions">
                {["customer", "provider", "admin"].includes(user.role) && (
                  <Link
                    className="btn light small"
                    to={`/dashboard/${user.role}?section=payments&booking=${b._id}`}
                  >
                    Bill, payments & receipts <ArrowRight size={14} />
                  </Link>
                )}
                <button
                  className="btn small light"
                  onClick={() => open("timeline", b)}
                >
                  View timeline
                </button>
                {user.role === "customer" &&
                  ["PENDING", "ACCEPTED"].includes(b.status) && (
                    <>
                      <button
                        className="btn small light"
                        onClick={() => open("reschedule", b)}
                      >
                        Reschedule
                      </button>
                      <button
                        className="text-danger"
                        onClick={() => open("cancel", b)}
                      >
                        Cancel request
                      </button>
                    </>
                  )}
                {user.role === "customer" &&
                  b.status === "COMPLETED" &&
                  !reviews.some((r) => r.booking === b._id) && (
                    <button
                      className="btn small"
                      onClick={() => open("review", b)}
                    >
                      <Star size={14} />
                      Leave a review
                    </button>
                  )}
                {user.role === "provider" && b.status === "PENDING" && (
                  <>
                    <button
                      className="btn small"
                      disabled={busy}
                      onClick={() => statusAction(b, "ACCEPTED")}
                    >
                      Accept request
                    </button>
                    <button
                      className="text-danger"
                      onClick={() => open("reject", b)}
                    >
                      Reject
                    </button>
                  </>
                )}
                {user.role === "provider" && b.status === "ACCEPTED" && (
                  <button
                    className="btn small"
                    disabled={busy}
                    onClick={() => statusAction(b, "ON_THE_WAY")}
                  >
                    I'm on the way
                  </button>
                )}
                {user.role === "provider" && b.status === "ON_THE_WAY" && (
                  <button
                    className="btn small"
                    onClick={() => open("start", b)}
                  >
                    <KeyRound size={14} />
                    Enter visit OTP
                  </button>
                )}
                {user.role === "provider" && b.status === "IN_PROGRESS" && (
                  <button
                    className="btn small"
                    onClick={() => open("complete", b)}
                  >
                    Complete service
                  </button>
                )}
              </div>
            </article>
          ))}
      </div>
    ) : (
      <Empty
        title="A little breathing room"
        text="There are no bookings in this view."
        action={
          user.role === "customer" ? (
            <Link className="btn light" to="/services">
              Find a professional
            </Link>
          ) : null
        }
      />
    );
  const reviewList = (rows) =>
    rows.length ? (
      <div className="card review-feed">
        {rows.map((r) => (
          <article key={r._id}>
            <div>
              <Avatar
                person={user.role === "provider" ? r.customer : r.provider}
              />
              <div>
                <strong>
                  {user.role === "provider"
                    ? r.customer?.name
                    : r.provider?.name}
                </strong>
                <Stars rating={r.rating} />
              </div>
              <small>{new Date(r.createdAt).toLocaleDateString("en-IN")}</small>
            </div>
            <p>{r.feedback}</p>
            {r.hidden && (
              <span className="muted small-text">
                Hidden from public profiles by the administrator.
              </span>
            )}
          </article>
        ))}
      </div>
    ) : (
      <Empty
        title="Your feedback story starts here"
        text="Reviews become available after completed services."
      />
    );
  return (
    <div className="container dashboard">
      <aside className="dashboard-nav card">
        <div className="dashboard-person">
          <Avatar person={user} />
          <h3>{user.name}</h3>
          <span>{label(user.role)} workspace</span>
        </div>
        <nav aria-label="Dashboard sections">
          {allowed.map(([key, title, Icon]) => (
            <button
              className={section === key ? "active" : ""}
              key={key}
              onClick={() => {
                setParams(key === "overview" ? {} : { section: key });
                setError("");
                setSearch("");
              }}
            >
              <Icon size={17} />
              {title}
              {key === "requests" && requests.length > 0 && (
                <b>{requests.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="dashboard-nav-note">
          <ShieldCheck size={18} />
          <span>Your activity stays connected across the platform.</span>
        </div>
      </aside>
      <div className="dashboard-content">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">
              YOUR {user.role.toUpperCase()} WORKSPACE
            </span>
            <h1>
              {section === "overview"
                ? `Hello, ${user.name.split(" ")[0]}.`
                : allowed.find((x) => x[0] === section)?.[1]}
            </h1>
            <p>
              {section === "overview"
                ? "A clear view of what’s next, and what’s taken care of."
                : "Everything you need, a little more organized."}
            </p>
          </div>
          {section !== "applications" && (
            <button
              className="btn light small"
              disabled={loading}
              onClick={() => reload()}
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          )}
        </div>
        <ErrorBox message={error} />
        {user.role === "provider" &&
          user.profile.status !== "APPROVED" &&
          section !== "verification" && (
            <div className="approval-banner">
              <ShieldCheck />
              <div>
                <strong>
                  {user.profile.status === "REJECTED"
                    ? "Your profile needs attention."
                    : "Your profile is awaiting approval."}
                </strong>
                <p>
                  {user.profile.documents.length
                    ? user.profile.status === "REJECTED"
                      ? "Update your service details and resubmit for administrator review from Photos & documents."
                      : "Your service profile is awaiting administrator approval. No identity images or document review are required."
                    : "Sign-in is available. An administrator can approve your service profile; documents are optional."}
                </p>
              </div>
              <button
                className="btn small light"
                onClick={() => setParams({ section: "documents" })}
              >
                View documents
              </button>
            </div>
          )}
        {loading ? (
          <Loading />
        ) : (
          <>
            {section === "overview" && user.role !== "admin" && (
              <>
                <div className="stats-grid">
                  <Stat
                    icon={CalendarDays}
                    title={
                      user.role === "provider"
                        ? "New requests"
                        : "Active bookings"
                    }
                    value={
                      user.role === "provider" ? requests.length : active.length
                    }
                    note="Waiting or underway"
                  />
                  <Stat
                    icon={CheckCircle2}
                    title="Completed services"
                    value={completed.length}
                    note="All-time service history"
                  />
                  <Stat
                    icon={BriefcaseBusiness}
                    title={
                      user.role === "provider"
                        ? "Completed service value"
                        : "Completed visit estimates"
                    }
                    value={money(value)}
                    note="Estimates only; deposits are listed separately"
                  />
                  <Stat
                    icon={Star}
                    title={
                      user.role === "provider"
                        ? "Customer rating"
                        : "Reviews shared"
                    }
                    value={
                      user.role === "provider"
                        ? average
                          ? average.toFixed(1)
                          : "New"
                        : reviews.length
                    }
                    note="From completed bookings"
                  />
                </div>
                <div className="dashboard-section-title">
                  <h2>
                    {user.role === "provider"
                      ? "What needs your attention"
                      : "Your next helping hands"}
                  </h2>
                  <button
                    className="text-link"
                    onClick={() =>
                      setParams({
                        section: user.role === "provider" ? "jobs" : "bookings",
                      })
                    }
                  >
                    View all <ArrowRight size={15} />
                  </button>
                </div>
                {list(active.slice(0, 3))}
              </>
            )}
            {((section === "bookings" && user.role === "customer") ||
              (section === "jobs" && user.role === "provider")) &&
              list(bookings)}
            {section === "requests" &&
              user.role === "provider" &&
              list(requests)}
            {section === "favourites" &&
              user.role === "customer" &&
              (providers.filter((p) => user.favourites.includes(p._id))
                .length ? (
                <div className="provider-grid dashboard-provider-grid">
                  {providers
                    .filter((p) => user.favourites.includes(p._id))
                    .map((p) => (
                      <ProviderCard key={p._id} provider={p} />
                    ))}
                </div>
              ) : (
                <Empty
                  title="Save a helping hand for later"
                  text="Tap the heart on a professional's card to keep them here."
                  action={
                    <Link className="btn" to="/services">
                      Explore professionals
                    </Link>
                  }
                />
              ))}
            {section === "reviews" &&
              user.role !== "admin" &&
              reviewList(reviews)}
            {section === "addresses" && user.role === "customer" && (
              <Addresses user={user} setUser={setUser} setToast={setToast} />
            )}
            {section === "activity" && user.role === "customer" && (
              <div className="card activity-feed">
                {bookings
                  .flatMap((b) => b.timeline.map((t) => ({ ...t, booking: b })))
                  .sort((a, b) => new Date(b.at) - new Date(a.at))
                  .slice(0, 30)
                  .map((t, i) => (
                    <article key={`${t.booking._id}-${i}`}>
                      <span>
                        <Clock size={18} />
                      </span>
                      <div>
                        <strong>
                          {label(t.status)} · {t.booking.service}
                        </strong>
                        <p>
                          {t.booking.provider?.name} · GS-
                          {t.booking._id.slice(-8).toUpperCase()}
                        </p>
                      </div>
                      <small>{new Date(t.at).toLocaleString("en-IN")}</small>
                    </article>
                  ))}
                {!bookings.length && (
                  <Empty
                    title="Your story is just beginning"
                    text="Booking status updates will appear here."
                  />
                )}
              </div>
            )}
            {section === "profile" && user.role !== "admin" && (
              <Profile
                user={user}
                setUser={setUser}
                categories={categories}
                setToast={setToast}
                refresh={refresh}
              />
            )}
            {section === "schedule" && user.role === "provider" && (
              <Profile
                user={user}
                setUser={setUser}
                categories={categories}
                setToast={setToast}
                refresh={refresh}
                scheduleOnly
              />
            )}
            {section === "payments" && <Payments />}
            {section === "invitations" && user.role === "admin" && (
              <AccountInvitations />
            )}
            {section === "verification" && user.role === "provider" && (
              <ProviderIdentityVerification />
            )}
            {section === "verification" && user.role === "admin" && (
              <IdentityReviewQueue />
            )}
            {section === "documents" && user.role === "provider" && (
              <Uploads
                user={user}
                setUser={setUser}
                setToast={setToast}
                refresh={refresh}
              />
            )}
            {section === "application" && user.role === "provider" && (
              <ProviderApplicationStatus />
            )}
            {section === "applications" && user.role === "admin" && (
              <Applications />
            )}
            {user.role === "admin" && section === "faculty-showcase" && (
              <FacultyShowcaseAdmin />
            )}
            {user.role === "admin" &&
              admin &&
              section !== "applications" &&
              section !== "faculty-showcase" && (
                <AdminContent
                  section={section}
                  data={admin}
                  busy={busy}
                  act={act}
                  search={search}
                  setSearch={setSearch}
                />
              )}
          </>
        )}
      </div>
      {modal && (
        <Modal
          title={
            {
              cancel: "Cancel this request?",
              reject: "Reject this request?",
              complete: "Mark the service completed?",
              start: "Ready to begin?",
              review: "Share your experience",
              timeline: "Your booking journey",
              reschedule: "Find another time",
            }[modal.type]
          }
          onClose={() => setModal(null)}
        >
          {modal.type === "timeline" ? (
            <div className="timeline">
              {modal.booking.timeline.map((t, i) => (
                <article key={i}>
                  <span>
                    <Check size={14} />
                  </span>
                  <div>
                    <strong>{label(t.status)}</strong>
                    <small>{new Date(t.at).toLocaleString("en-IN")}</small>
                  </div>
                </article>
              ))}
            </div>
          ) : modal.type === "review" ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await act(
                    "/reviews",
                    { bookingId: modal.booking._id, ...draft },
                    "POST",
                  );
                  setModal(null);
                } catch {}
              }}
            >
              <Field label="Your rating">
                <div className="star-picker">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} stars`}
                      className={draft.rating >= n ? "active" : ""}
                      onClick={() => setDraft({ ...draft, rating: n })}
                    >
                      <Star
                        fill={draft.rating >= n ? "currentColor" : "none"}
                      />
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Tell others about the service">
                <textarea
                  required
                  minLength={10}
                  maxLength={1000}
                  rows={4}
                  value={draft.feedback}
                  onChange={(e) =>
                    setDraft({ ...draft, feedback: e.target.value })
                  }
                />
              </Field>
              <ErrorBox message={error} />
              <button className="btn full" disabled={busy}>
                Publish review
              </button>
            </form>
          ) : modal.type === "start" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                statusAction(modal.booking, "IN_PROGRESS", draft.code);
              }}
            >
              <p>
                Ask your customer for the six-digit code shown in their booking.
                This confirms they are ready for work to start.
              </p>
              <Field label="Customer's visit OTP">
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={draft.code}
                  onChange={(e) =>
                    setDraft({ code: e.target.value.replace(/\D/g, "") })
                  }
                  placeholder="Enter six-digit code"
                  autoFocus
                />
              </Field>
              <ErrorBox message={error} />
              <button className="btn full" disabled={busy}>
                Verify & start work <ShieldCheck size={16} />
              </button>
            </form>
          ) : modal.type === "reschedule" ? (
            <Reschedule
              booking={modal.booking}
              draft={draft}
              setDraft={setDraft}
              error={error}
              busy={busy}
              onSubmit={async () => {
                try {
                  await act(`/bookings/${modal.booking._id}/schedule`, draft);
                  setModal(null);
                } catch {}
              }}
            />
          ) : (
            <>
              <p>
                {modal.type === "complete"
                  ? "Confirm that the work is finished. The customer will then be able to leave a review."
                  : `This will ${modal.type} booking GS-${modal.booking._id.slice(-8).toUpperCase()}.`}
              </p>
              <ErrorBox message={error} />
              <div className="modal-actions">
                <button className="btn light" onClick={() => setModal(null)}>
                  Go back
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    statusAction(
                      modal.booking,
                      {
                        cancel: "CANCELLED",
                        reject: "REJECTED",
                        complete: "COMPLETED",
                      }[modal.type],
                    )
                  }
                >
                  Confirm {modal.type}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
function Reschedule({ booking, draft, setDraft, error, busy, onSubmit }) {
  const [slots, setSlots] = useState([]),
    [slotError, setSlotError] = useState("");
  useEffect(() => {
    let active = true;
    setSlots([]);
    setSlotError("");
    api(`/providers/${booking.provider._id}/slots?date=${draft.date}`)
      .then((r) => {
        if (active) setSlots(r.slots);
      })
      .catch((e) => {
        if (active) setSlotError(e.message);
      });
    return () => {
      active = false;
    };
  }, [draft.date, booking.provider._id]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <p>Your professional will need to accept the revised appointment.</p>
      <Field label="New date">
        <input
          required
          type="date"
          min={indiaToday()}
          value={draft.date}
          onChange={(e) => setDraft({ date: e.target.value, time: "" })}
        />
      </Field>
      <Field label="Available time">
        <select
          required
          value={draft.time}
          onChange={(e) => setDraft({ ...draft, time: e.target.value })}
        >
          <option value="">Choose a time</option>
          {slots.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <ErrorBox message={error || slotError} />
      <button className="btn full" disabled={busy || !draft.time}>
        Save new appointment
      </button>
    </form>
  );
}
function Addresses({ user, setUser, setToast }) {
  const [form, setForm] = useState({ label: "", address: "" }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async (addresses) => {
    setBusy(true);
    try {
      setUser(
        await api("/auth/me", {
          method: "PATCH",
          body: {
            name: user.name,
            email: user.email,
            mobile: user.mobile,
            city: user.city,
            addresses,
          },
        }),
      );
      setToast("Addresses saved.");
      setForm({ label: "", address: "" });
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="address-grid">
        {user.addresses.map((a) => (
          <article className="card address-card" key={a._id}>
            <MapPin className="teal" />
            <h3>{a.label}</h3>
            <p>{a.address}</p>
            <button
              className="text-danger"
              disabled={busy}
              onClick={() =>
                save(user.addresses.filter((x) => x._id !== a._id))
              }
            >
              Remove address
            </button>
          </article>
        ))}
      </div>
      <form
        className="card settings-card"
        onSubmit={(e) => {
          e.preventDefault();
          save([...user.addresses, form]);
        }}
      >
        <h2>A place for your next visit</h2>
        <div className="form-grid">
          <Field label="Address label">
            <input
              required
              minLength={2}
              maxLength={30}
              placeholder="Home, office…"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </Field>
          <Field label="Full address">
            <textarea
              required
              minLength={10}
              maxLength={500}
              rows={2}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
        </div>
        <ErrorBox message={error} />
        <button className="btn" disabled={busy || user.addresses.length >= 10}>
          <Plus size={16} />
          Save address
        </button>
      </form>
    </>
  );
}
function Profile({
  user,
  setUser,
  categories,
  setToast,
  refresh,
  scheduleOnly = false,
}) {
  const [form, setForm] = useState(() => ({
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      city: user.city,
      profile: user.profile ? { ...user.profile } : undefined,
    })),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [newSlot, setNewSlot] = useState(""),
    [pass, setPass] = useState({ currentPassword: "", newPassword: "" });
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value })),
    setP = (key, value) =>
      setForm((f) => ({ ...f, profile: { ...f.profile, [key]: value } }));
  return (
    <>
      <form
        className="card settings-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const u = await api("/auth/me", { method: "PATCH", body: form });
            setUser(u);
            await refresh();
            setToast("Your details are saved.");
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>
          {scheduleOnly
            ? "Make room for your next job."
            : "Keep your details up to date."}
        </h2>
        {!scheduleOnly && (
          <div className="form-grid">
            <Field label="Full name">
              <input
                required
                minLength={3}
                maxLength={80}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label="Mobile number">
              <input
                required
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                value={form.mobile}
                onChange={(e) => set("mobile", e.target.value)}
              />
            </Field>
            <Field label="City">
              <input
                required
                minLength={2}
                maxLength={70}
                value={form.city}
                onChange={(e) => {
                  set("city", e.target.value);
                  if (form.profile) setP("city", e.target.value);
                }}
              />
            </Field>
            {form.profile && (
              <>
                <Field label="Main service">
                  <select
                    required
                    value={form.profile.category}
                    onChange={(e) => {
                      setP("category", e.target.value);
                      setP("categories", [
                        e.target.value,
                        ...(form.profile.categories || []).filter(
                          (s) => s !== e.target.value,
                        ),
                      ]);
                    }}
                  >
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <fieldset className="gs-apply__categories field wide">
                  <legend>All service categories (up to 8)</legend>
                  <div>
                    {categories.map((c) => {
                      const selected = form.profile.categories?.length
                        ? form.profile.categories
                        : [form.profile.category];
                      return (
                        <label key={c.slug}>
                          <input
                            type="checkbox"
                            checked={selected.includes(c.slug)}
                            disabled={
                              !selected.includes(c.slug) && selected.length >= 8
                            }
                            onChange={() => {
                              const next = selected.includes(c.slug)
                                ? selected.filter((x) => x !== c.slug)
                                : [...selected, c.slug];
                              setP("categories", next);
                              setP("category", next[0] || "");
                            }}
                          />
                          {c.name}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <Field label="Starting visit price (₹)">
                  <input
                    required
                    type="number"
                    min={100}
                    max={50000}
                    value={form.profile.price}
                    onChange={(e) => setP("price", Number(e.target.value))}
                  />
                </Field>
                <Field label="Years of experience">
                  <input
                    required
                    type="number"
                    min={0}
                    max={50}
                    value={form.profile.experience}
                    onChange={(e) => setP("experience", Number(e.target.value))}
                  />
                </Field>
                <Field label="Service area">
                  <input
                    required
                    minLength={3}
                    maxLength={100}
                    value={form.profile.area}
                    onChange={(e) => setP("area", e.target.value)}
                  />
                </Field>
                <Field label="About your work" wide>
                  <textarea
                    required
                    minLength={30}
                    maxLength={500}
                    rows={4}
                    value={form.profile.bio}
                    onChange={(e) => setP("bio", e.target.value)}
                  />
                </Field>
                <Field label="Skills (comma separated)" wide>
                  <input
                    maxLength={480}
                    value={form.profile.skills.join(", ")}
                    onChange={(e) =>
                      setP(
                        "skills",
                        e.target.value
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                </Field>
              </>
            )}
          </div>
        )}
        {scheduleOnly && form.profile && (
          <>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.profile.available}
                onChange={(e) => setP("available", e.target.checked)}
              />
              Accept new bookings
            </label>
            <h3>Your working days</h3>
            <div className="working-days">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                <button
                  type="button"
                  key={d}
                  className={form.profile.days.includes(i) ? "active" : ""}
                  onClick={() =>
                    setP(
                      "days",
                      form.profile.days.includes(i)
                        ? form.profile.days.filter((x) => x !== i)
                        : [...form.profile.days, i],
                    )
                  }
                >
                  {d}
                </button>
              ))}
            </div>
            <h3>Appointment start times</h3>
            <div className="skill-tags">
              {form.profile.slots.map((s) => (
                <span key={s}>
                  {s}
                  <button
                    type="button"
                    aria-label={`Remove ${s}`}
                    onClick={() =>
                      setP(
                        "slots",
                        form.profile.slots.filter((x) => x !== s),
                      )
                    }
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
            <div className="add-slot">
              <input
                aria-label="New appointment time"
                type="time"
                value={newSlot}
                onChange={(e) => setNewSlot(e.target.value)}
              />
              <button
                className="btn small light"
                type="button"
                onClick={() => {
                  if (newSlot && !form.profile.slots.includes(newSlot)) {
                    setP("slots", [...form.profile.slots, newSlot].sort());
                    setNewSlot("");
                  }
                }}
              >
                <Plus size={15} />
                Add time
              </button>
            </div>
            <p className="muted">
              Appointment slots prevent two active bookings for the same
              provider at the same start time. Each slot represents one visit.
            </p>
          </>
        )}
        <ErrorBox message={error} />
        <button className="btn" disabled={busy}>
          Save {scheduleOnly ? "availability" : "details"} <Check size={16} />
        </button>
      </form>
      {!scheduleOnly && <ConnectedSignIn />}
      {!scheduleOnly && (
        <form
          className="card settings-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("/auth/change-password", {
                method: "POST",
                body: pass,
              });
              setUser(null);
              setToast("Password changed. Please log in again.");
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>A fresh password</h2>
          <div className="form-grid">
            <Field label="Current password">
              <input
                type="password"
                required
                autoComplete="current-password"
                value={pass.currentPassword}
                onChange={(e) =>
                  setPass({ ...pass, currentPassword: e.target.value })
                }
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                value={pass.newPassword}
                onChange={(e) =>
                  setPass({ ...pass, newPassword: e.target.value })
                }
              />
            </Field>
          </div>
          <p className="muted small-text">
            Use uppercase, lowercase and a number. You'll be logged out after
            changing it.
          </p>
          <button className="btn light" disabled={busy}>
            <KeyRound size={16} />
            Change password
          </button>
        </form>
      )}
    </>
  );
}
function Uploads({ user, setUser, setToast, refresh }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const upload = async (e, kind) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const limit = kind === "document" ? 3 * 1024 * 1024 : 1024 * 1024;
    if (file.size > limit) {
      setError(
        kind === "document"
          ? "Documents must be 3 MB or smaller."
          : "Images must be 1 MB or smaller.",
      );
      e.target.value = "";
      return;
    }
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file);
      const r = await api("/files", { method: "POST", body: form });
      setUser(r.user);
      await refresh();
      setToast("Your file is saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };
  return (
    <>
      <ErrorBox message={error} />
      <div className="card settings-card">
        <h2>A face to your name</h2>
        <div className="upload-profile">
          <Avatar person={user} size="large" />
          <div>
            <label className="btn light upload-label">
              <input
                disabled={busy}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => upload(e, "photo")}
              />
              <Upload size={16} />
              Upload profile photo
            </label>
            <p className="muted small-text">
              JPG, PNG or WebP · up to 1 MB · publicly visible
            </p>
          </div>
        </div>
      </div>
      <div className="card settings-card">
        <h2>Let your work speak.</h2>
        <p className="muted">
          Add up to six photographs of your work. Your newest upload becomes the
          main photo on your public card. Stock samples are labelled separately.
        </p>
        <div className="portfolio upload-portfolio">
          {resolveWorkImages(user).map((photo, index) => (
            <figure key={photo.src}>
              <WorkPhoto photo={photo} />
              <figcaption>
                {photo.kind === "sample"
                  ? "Sample photograph"
                  : index === 0
                    ? "Main work photo"
                    : "Professional upload"}
              </figcaption>
              {photo.kind === "upload" && (
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label="Remove work photo"
                  onClick={async () => {
                    try {
                      setUser(
                        await api(photo.src.replace("/api", ""), {
                          method: "DELETE",
                        }),
                      );
                      await refresh();
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </figure>
          ))}
        </div>
        <label className="btn light upload-label">
          <input
            disabled={busy}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => upload(e, "portfolio")}
          />
          <Plus size={16} />
          Add a work photo
        </label>
      </div>
      <div className="card settings-card">
        <h2>Documents for profile review</h2>
        <p className="muted">
          Profile photos and supporting files are optional. Supporting files
          stay private to you and the administrator; they are not required for
          listing approval.
        </p>

        <div className="info-box">
          <ShieldCheck size={18} />
          <span>
            {user.profile.documents.length
              ? user.profile.status === "APPROVED"
                ? "Profile approved. Supporting documents are optional and remain private."
                : user.profile.status === "REJECTED"
                  ? "Update your document or profile, then resubmit for administrator review below."
                  : "Optional document uploaded. Approval depends on your service profile, not identity review."
              : "No optional document uploaded. You can still submit your service profile for approval."}
          </span>
        </div>
        <div className="document-list">
          {user.profile.documents.map((id, i) => (
            <div key={id}>
              <FileText />
              <span>Supporting document {i + 1}</span>
              <a
                className="text-link"
                href={`/api/files/${id}`}
                target="_blank"
                rel="noreferrer"
              >
                Download
              </a>
              <button
                className="icon-button"
                disabled={busy}
                aria-label={`Remove document ${i + 1}`}
                onClick={async () => {
                  try {
                    setUser(await api(`/files/${id}`, { method: "DELETE" }));
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
        <label className="btn upload-label">
          <input
            disabled={busy}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            aria-label="Upload supporting document"
            onChange={(e) => upload(e, "document")}
          />
          <Upload size={16} />
          Upload document
        </label>
        <small className="form-note">
          PDF or image · up to 3 MB · five documents maximum
        </small>
        {user.profile.status === "REJECTED" && (
          <button
            className="btn light"
            disabled={busy}
            onClick={async () => {
              setError("");
              setBusy(true);
              try {
                setUser(
                  await api("/provider/review-request", { method: "POST" }),
                );
                await refresh();
                setToast(
                  "Your profile was resubmitted for administrator review.",
                );
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Resubmit for review <ArrowRight size={16} />
          </button>
        )}
      </div>
    </>
  );
}
function AdminContent({ section, data, busy, act, search, setSearch }) {
  const [draft, setDraft] = useState({ name: "", description: "", price: 299 }),
    [categoryEdit, setCategoryEdit] = useState(null);
  const run = async (path, body, method) => {
    try {
      await act(path, body, method);
    } catch {}
  };
  const providerRows = data.users.filter((u) => u.role === "provider"),
    customers = data.users.filter((u) => u.role === "customer");
  const filtered = (rows) =>
    rows.filter((u) =>
      `${u.name} ${u.email} ${u.city} ${u.profile?.category || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const users = (rows, isProvider = false) => (
    <>
      <div className="search-field admin-search">
        <Search size={17} />
        <input
          aria-label="Search accounts"
          placeholder="Search name, email, city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="admin-people">
        {filtered(rows).map((u) => (
          <article
            className="card admin-person"
            key={u._id}
            data-user-id={u._id}
          >
            <div className="admin-person-head">
              <Avatar person={u} />
              <div>
                <h3>{u.name}</h3>
                <p>
                  {u.email} · {u.city}
                </p>
              </div>
              <Status value={u.status} />
            </div>
            {isProvider && (
              <>
                <p>
                  <strong>{label(u.profile.category)}</strong> ·{" "}
                  {money(u.profile.price)} / visit · {u.profile.experience}{" "}
                  years experience
                </p>
                <p className="muted">{u.profile.bio}</p>
                <div className="admin-document-links">
                  {u.profile.documents.map((id, i) => (
                    <a
                      className="btn light small"
                      key={id}
                      href={`/api/files/${id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileText size={14} />
                      Review document {i + 1}
                    </a>
                  ))}
                  {!u.profile.documents.length && (
                    <span className="muted small-text">
                      No document upload is required. Review the basic service
                      profile, then approve or reject it.
                    </span>
                  )}
                </div>
                {u.approvalReadiness && !u.approvalReadiness.ready && (
                  <div role="status">
                    <strong>Before approval</strong>
                    <ul>
                      {u.approvalReadiness.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            <div className="admin-person-actions">
              {isProvider && (
                <>
                  <Status value={u.profile.status} />
                  {u.profile.status !== "APPROVED" && (
                    <button
                      className="btn small"
                      disabled={busy || !u.approvalReadiness?.ready}
                      title={
                        !u.approvalReadiness?.ready
                          ? "Complete the approval requirements shown above."
                          : "Approve this provider's service listing"
                      }
                      onClick={() =>
                        run(`/admin/users/${u._id}`, { approval: "APPROVED" })
                      }
                    >
                      <Check size={14} />
                      Approve profile
                    </button>
                  )}
                  {u.profile.status !== "REJECTED" && (
                    <button
                      className="btn light small"
                      disabled={busy}
                      onClick={() =>
                        run(`/admin/users/${u._id}`, { approval: "REJECTED" })
                      }
                    >
                      Reject profile
                    </button>
                  )}
                </>
              )}
              <button
                className={u.status === "ACTIVE" ? "text-danger" : "text-link"}
                disabled={busy}
                onClick={() =>
                  run(`/admin/users/${u._id}`, {
                    status: u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
                  })
                }
              >
                {u.status === "ACTIVE"
                  ? "Suspend account"
                  : "Reactivate account"}
              </button>
            </div>
          </article>
        ))}
        {!filtered(rows).length && (
          <Empty title="No accounts match" text="Try another search." />
        )}
      </div>
    </>
  );
  const table = (rows) => (
    <div className="table-scroll card">
      <table className="data-table">
        <thead>
          <tr>
            <th>Booking</th>
            <th>Customer / provider</th>
            <th>Appointment</th>
            <th>Estimate</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b._id}>
              <td>
                <strong>GS-{b._id.slice(-8).toUpperCase()}</strong>
                <small>
                  {b.service}
                  {b.urgency === "PRIORITY" ? " · Priority" : ""}
                </small>
              </td>
              <td>
                {b.customer?.name}
                <small>{b.provider?.name}</small>
              </td>
              <td>
                {prettyDate(b.date)}
                <small>{b.time}</small>
              </td>
              <td>{money(b.price)}</td>
              <td>
                <Status value={b.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty title="No bookings yet" />}
    </div>
  );
  if (section === "overview")
    return (
      <>
        <div className="stats-grid">
          <Stat
            icon={Users}
            title="Customers"
            value={data.stats.customers}
            note="Registered accounts"
          />
          <Stat
            icon={BriefcaseBusiness}
            title="Professionals"
            value={data.stats.providers}
            note="All provider accounts"
          />
          <Stat
            icon={ShieldCheck}
            title="Awaiting review"
            value={data.stats.pending}
            note="Provider profiles"
          />
          <Stat
            icon={CheckCircle2}
            title="Completed service value"
            value={money(data.stats.serviceValue)}
            note="Booking estimates, not captured payments"
          />
        </div>
        <div className="dashboard-section-title">
          <h2>Latest booking activity</h2>
          <span className="muted small-text">Refreshes every 15 seconds</span>
        </div>
        {table(data.bookings.slice(0, 6))}
        <div className="admin-summary-grid">
          <article className="card">
            <MessageSquare className="teal" />
            <h3>
              {data.enquiries.filter((e) => e.status === "OPEN").length} open
              enquiries
            </h3>
            <p>Support messages awaiting administrator review.</p>
          </article>
          <article className="card">
            <ShieldCheck className="teal" />
            <h3>{data.stats.pending} profiles to review</h3>
            <p>Review pending service profiles and approve or reject them.</p>
          </article>
        </div>
      </>
    );
  if (section === "users") return users(customers);
  if (section === "providers") return users(providerRows, true);
  if (section === "bookings") return table(data.bookings);
  if (section === "categories")
    return (
      <>
        <div className="card settings-card">
          <h2>The services on offer</h2>
          <div className="admin-category-list">
            {data.categories.map((c) => (
              <article key={c._id}>
                <img src={c.image} alt={`${c.name} service example`} />
                <div>
                  <h3>{c.name}</h3>
                  <p>
                    From {money(c.price)} ·{" "}
                    {
                      providerRows.filter((p) => p.profile.category === c.slug)
                        .length
                    }{" "}
                    professionals
                  </p>
                </div>
                <button
                  className="btn small light"
                  disabled={busy}
                  onClick={() => setCategoryEdit({ ...c })}
                >
                  Edit
                </button>
                <button
                  className={c.enabled ? "toggle on" : "toggle"}
                  role="switch"
                  aria-checked={c.enabled}
                  aria-label={`${c.enabled ? "Disable" : "Enable"} ${c.name}`}
                  disabled={busy}
                  onClick={() =>
                    run(`/admin/categories/${c._id}`, { enabled: !c.enabled })
                  }
                >
                  <span />
                </button>
              </article>
            ))}
          </div>
        </div>
        <form
          className="card settings-card"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await act("/admin/categories", draft, "POST");
              setDraft({ name: "", description: "", price: 299 });
            } catch {}
          }}
        >
          <h2>Add a service category</h2>
          <div className="form-grid">
            <Field label="Category name">
              <input
                required
                minLength={3}
                maxLength={70}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Starting price (₹)">
              <input
                required
                type="number"
                min={100}
                max={50000}
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              />
            </Field>
            <Field label="Short description" wide>
              <input
                required
                minLength={5}
                maxLength={200}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </Field>
          </div>
          <button className="btn" disabled={busy}>
            <Plus size={16} />
            Add category
          </button>
        </form>
        {categoryEdit && (
          <Modal
            title="Edit service category"
            onClose={() => setCategoryEdit(null)}
          >
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await act(`/admin/categories/${categoryEdit._id}`, {
                    name: categoryEdit.name,
                    price: categoryEdit.price,
                  });
                  setCategoryEdit(null);
                } catch {}
              }}
            >
              <Field label="Category name">
                <input
                  required
                  minLength={3}
                  maxLength={70}
                  value={categoryEdit.name}
                  onChange={(e) =>
                    setCategoryEdit({ ...categoryEdit, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Starting price (₹)">
                <input
                  required
                  type="number"
                  min={100}
                  max={50000}
                  value={categoryEdit.price}
                  onChange={(e) =>
                    setCategoryEdit({
                      ...categoryEdit,
                      price: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <button className="btn full" disabled={busy}>
                Save category
              </button>
            </form>
          </Modal>
        )}
      </>
    );
  if (section === "reviews")
    return (
      <div className="card review-feed">
        {data.reviews.map((r) => (
          <article key={r._id}>
            <div>
              <div>
                <strong>
                  {r.customer?.name} → {r.provider?.name}
                </strong>
                <Stars rating={r.rating} />
              </div>
              <Status value={r.hidden ? "HIDDEN" : "VISIBLE"} />
            </div>
            <p>{r.feedback}</p>
            <button
              className="btn light small"
              disabled={busy}
              onClick={() =>
                run(`/admin/reviews/${r._id}`, { hidden: !r.hidden })
              }
            >
              {r.hidden ? "Restore public review" : "Hide public review"}
            </button>
          </article>
        ))}
        {!data.reviews.length && <Empty title="No reviews to moderate yet" />}
      </div>
    );
  if (section === "enquiries")
    return (
      <div className="enquiry-list">
        {data.enquiries.map((e) => (
          <article className="card enquiry-card" key={e._id}>
            <div>
              <h3>{e.subject}</h3>
              <Status value={e.status} />
            </div>
            <p className="muted">
              {e.name} · {e.email} · {e.mobile}
            </p>
            <p>{e.message}</p>
            <div className="enquiry-bottom">
              <small>
                Reference {e._id.slice(-8).toUpperCase()} ·{" "}
                {new Date(e.createdAt).toLocaleString("en-IN")}
              </small>
              <button
                className="btn small light"
                disabled={busy}
                onClick={() =>
                  run(`/admin/enquiries/${e._id}`, {
                    status: e.status === "OPEN" ? "RESOLVED" : "OPEN",
                  })
                }
              >
                {e.status === "OPEN" ? "Mark resolved" : "Reopen"}
              </button>
            </div>
          </article>
        ))}
        {!data.enquiries.length && (
          <Empty
            title="A quiet inbox"
            text="Contact form submissions will appear here."
          />
        )}
      </div>
    );
  if (section === "reports") {
    const counts = [
      "PENDING",
      "ACCEPTED",
      "ON_THE_WAY",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "REJECTED",
    ].map((s) => ({
      name: s,
      count: data.bookings.filter((b) => b.status === s).length,
    }));
    const max = Math.max(1, ...counts.map((c) => c.count));
    return (
      <>
        <div className="stats-grid">
          <Stat
            icon={CalendarDays}
            title="Total requests"
            value={data.bookings.length}
            note="All booking records"
          />
          <Stat
            icon={CheckCircle2}
            title="Completed"
            value={data.stats.completed}
            note="Finished visits"
          />
          <Stat
            icon={Star}
            title="Public reviews"
            value={data.reviews.filter((r) => !r.hidden).length}
            note="Visible feedback"
          />
          <Stat
            icon={MessageSquare}
            title="Support enquiries"
            value={data.enquiries.length}
            note="Saved submissions"
          />
        </div>
        <div className="card settings-card">
          <h2>Where bookings stand</h2>
          <div className="report-bars">
            {counts.map((c) => (
              <div key={c.name}>
                <span>{label(c.name)}</span>
                <div>
                  <i style={{ width: `${(c.count / max) * 100}%` }} />
                </div>
                <strong>{c.count}</strong>
              </div>
            ))}
          </div>
          <p className="muted small-text">
            Counts are calculated from the database. Service value is an
            estimate, not a record of collected payments.
          </p>
        </div>
      </>
    );
  }
  if (section === "settings")
    return (
      <div className="card settings-card">
        <h2>A little control, a clear marketplace.</h2>
        {[
          [
            "bookingEnabled",
            "Accept new bookings",
            "Pausing this stops new booking requests and reschedules.",
          ],
          [
            "providerRegistration",
            "Accept new professionals",
            "Pausing this stops new provider registrations.",
          ],
        ].map(([key, title, body]) => (
          <div className="platform-setting" key={key}>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
            <button
              className={data.settings[key] ? "toggle on" : "toggle"}
              role="switch"
              aria-checked={data.settings[key]}
              aria-label={title}
              disabled={busy}
              onClick={() =>
                run("/admin/settings", { [key]: !data.settings[key] })
              }
            >
              <span />
            </button>
          </div>
        ))}
        <div className="info-box">
          <ShieldCheck />
          <span>
            These settings are enforced by the API and reflected in the public
            marketplace.
          </span>
        </div>
      </div>
    );
  return null;
}
