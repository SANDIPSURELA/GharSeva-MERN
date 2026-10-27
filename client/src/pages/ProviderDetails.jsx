import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  CalendarDays,
  Heart,
  MapPin,
  Scale,
  ShieldCheck,
  Share2,
  Star,
  Wallet,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { useApp } from "../context";
import { api, money, indiaToday, indiaDateAfter, prettyDate } from "../api";
import { Avatar, Stars, Loading, ErrorBox } from "../components/UI";
import "./ProviderDetails.css";
import { resolveWorkImages } from "../../../shared/work-images.js";
import { WorkPhoto } from "../components/WorkPhoto";

const week = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const timeLabel = (time) => {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const shortDate = (date, options) =>
  new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    ...options,
  });

export function ProviderDetails() {
  const { id } = useParams();
  const {
    user,
    setUser,
    setToast,
    comparison,
    toggleCompare,
    categories,
    config,
  } = useApp();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ id: "", data: null, error: "" });
  const [retry, setRetry] = useState(0);
  const [date, setDate] = useState(() => indiaDateAfter(1));
  const [selected, setSelected] = useState("");
  const [availability, setAvailability] = useState({
    key: "",
    slots: [],
    error: "",
    loading: true,
  });
  const [slotRetry, setSlotRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [reviewRating, setReviewRating] = useState("");
  const [reviewSort, setReviewSort] = useState("newest");
  const [photoIndex, setPhotoIndex] = useState(-1);
  const dialogRef = useRef(null);
  const appointmentRef = useRef(null);
  const p = profile.id === id ? profile.data : null;
  const error = profile.id === id ? profile.error : "";
  const slotKey = `${id}:${date}:${slotRetry}`;
  const currentSlots = availability.key === slotKey ? availability.slots : [];
  const slotsLoading = availability.key !== slotKey || availability.loading;
  const slotError = availability.key === slotKey ? availability.error : "";
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date >= indiaToday() &&
    date <= indiaDateAfter(90);
  const canRequest = Boolean(
    p?.available &&
    config.bookingEnabled &&
    (!user || user.role === "customer"),
  );
  const chosen =
    !slotsLoading && currentSlots.includes(selected) ? selected : "";

  useEffect(() => {
    let active = true;
    setProfile({ id, data: null, error: "" });
    setSelected("");
    setReviewRating("");
    setReviewSort("newest");
    setPhotoIndex(-1);
    api(`/providers/${id}`)
      .then((data) => {
        if (active) setProfile({ id, data, error: "" });
      })
      .catch((e) => {
        if (active) setProfile({ id, data: null, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [id, retry]);

  useEffect(() => {
    let active = true;
    setSelected("");
    if (!p?.available || !validDate || !config.bookingEnabled) {
      setAvailability({ key: slotKey, slots: [], error: "", loading: false });
      return;
    }
    setAvailability({ key: slotKey, slots: [], error: "", loading: true });
    api(`/providers/${id}/slots?date=${encodeURIComponent(date)}`)
      .then((result) => {
        if (active)
          setAvailability({
            key: slotKey,
            slots: result.slots,
            error: "",
            loading: false,
          });
      })
      .catch((e) => {
        if (active)
          setAvailability({
            key: slotKey,
            slots: [],
            error: e.message,
            loading: false,
          });
      });
    return () => {
      active = false;
    };
  }, [id, p, date, validDate, slotRetry, config.bookingEnabled]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (photoIndex >= 0 && !dialog.open) dialog.showModal();
    if (photoIndex < 0 && dialog.open) dialog.close();
    if (photoIndex >= 0) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [photoIndex]);

  if (error)
    return (
      <section className="section provider-profile">
        <div className="container pp-error card">
          <span className="eyebrow">LET'S FIND YOUR NEXT HELPING HAND</span>
          <h1>This profile couldn't be opened.</h1>
          <ErrorBox message={error} />
          <div>
            <button
              className="btn light"
              onClick={() => setRetry((n) => n + 1)}
            >
              Try again
            </button>
            <Link className="btn" to="/services">
              Browse other professionals <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>
    );
  if (!p) return <Loading />;

  const category = categories.find((c) => c.slug === p.category);
  const feedback = p.feedback || [];
  const reviews = feedback
    .filter((r) => !reviewRating || r.rating === Number(reviewRating))
    .sort((a, b) =>
      reviewSort === "highest"
        ? b.rating - a.rating || new Date(b.createdAt) - new Date(a.createdAt)
        : reviewSort === "lowest"
          ? a.rating - b.rating || new Date(b.createdAt) - new Date(a.createdAt)
          : reviewSort === "oldest"
            ? new Date(a.createdAt) - new Date(b.createdAt)
            : new Date(b.createdAt) - new Date(a.createdAt),
    );
  const portfolio = resolveWorkImages(p);
  const saved = user?.favourites?.includes(p._id);
  const compared = comparison.includes(p._id);
  const bookingParams = new URLSearchParams({ date, time: chosen });
  const bookingHref = `/booking/${p._id}?${bookingParams}`;
  const showAppointments = () => {
    appointmentRef.current?.scrollIntoView({
      behavior: "auto",
      block: "start",
    });
    appointmentRef.current
      ?.querySelector('input[type="date"]')
      ?.focus({ preventScroll: true });
  };
  const save = async () => {
    if (!user) {
      setToast("Log in to your customer account to save a professional.");
      navigate("/login");
      return;
    }
    if (user.role !== "customer") {
      setToast("Saved professionals are available in customer accounts.");
      return;
    }
    setSaving(true);
    try {
      setUser(await api(`/favourites/${p._id}`, { method: "POST" }));
    } catch (e) {
      setToast(e.message);
    } finally {
      setSaving(false);
    }
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/providers/${p._id}`,
      );
      setToast("Profile link copied.");
    } catch {
      setToast("Copy the profile URL from your address bar to share it.");
    }
  };

  return (
    <div className="provider-profile">
      <section className="pp-hero">
        <div className="container">
          <nav className="pp-breadcrumb" aria-label="Breadcrumb">
            <Link to="/services">Find services</Link>
            <ChevronRight size={13} />
            <Link
              to={`/services?category=${p.category}&city=${encodeURIComponent(p.city)}`}
            >
              {p.categoryName}
            </Link>
            <ChevronRight size={13} />
            <span aria-current="page">{p.name}</span>
          </nav>
          <div className="pp-hero-grid">
            <div className="pp-identity">
              <Avatar person={p} size="large" />
              <div>
                <span className="eyebrow">
                  YOUR {p.categoryName.toUpperCase()} PROFESSIONAL
                </span>
                <h1>{p.name}</h1>
                <p>
                  <MapPin size={16} />
                  {p.area}
                </p>
                <div className="pp-identity-meta">
                  <Stars rating={p.rating} count={p.reviews} />
                  <span className="pp-approved">
                    <ShieldCheck size={16} />
                    Profile reviewed
                  </span>
                </div>
              </div>
            </div>
            <div className="pp-hero-price">
              <span>Starting visit price</span>
              <strong>
                {money(p.price)}
                <small> / visit</small>
              </strong>
              <p>Agree on additional work and materials before the service.</p>
              <button className="btn" onClick={showAppointments}>
                Check appointments <ArrowRight size={17} />
              </button>
            </div>
          </div>
          <div className="pp-stats-actions">
            <div className="pp-stats">
              <div>
                <strong>
                  {p.experience}
                  <small> years</small>
                </strong>
                <span>Professional experience</span>
              </div>
              <div>
                <strong>{p.completed}</strong>
                <span>Completed on GharSeva</span>
              </div>
              <div>
                <strong className={p.available ? "pp-positive" : ""}>
                  {p.available ? "Accepting requests" : "Currently unavailable"}
                </strong>
                <span>Appointment confirmation required</span>
              </div>
            </div>
            <div className="pp-actions">
              <button
                className={saved ? "active" : ""}
                onClick={save}
                disabled={saving}
                aria-pressed={Boolean(saved)}
                aria-label={
                  saved ? "Remove from favourites" : "Save professional"
                }
              >
                <Heart size={17} fill={saved ? "currentColor" : "none"} />
                {saving ? "Saving…" : saved ? "Saved" : "Save"}
              </button>
              <button
                className={compared ? "active" : ""}
                onClick={() => toggleCompare(p._id)}
                aria-pressed={compared}
              >
                <Scale size={17} />
                {compared ? "Added to compare" : "Compare"}
              </button>
              <button onClick={share}>
                <Share2 size={16} />
                Share
              </button>
            </div>
          </div>
        </div>
      </section>
      <nav className="pp-section-nav" aria-label="Profile sections">
        <div className="container">
          <a href="#professional-about">Overview</a>
          <a href="#professional-photos">Work examples</a>
          <a href="#professional-reviews">
            Reviews <span>{p.reviews}</span>
          </a>
          <a href="#professional-appointment">Appointments</a>
        </div>
      </nav>
      <section className="section pp-content-section">
        <div className="container pp-layout">
          <div className="pp-main">
            <article id="professional-about" className="card pp-card">
              <span className="eyebrow">MEET YOUR PROFESSIONAL</span>
              <h2>A little about {p.name.split(" ")[0]}.</h2>
              <p className="pp-bio">
                {p.bio ||
                  "This professional has not added an introduction yet."}
              </p>
              <div className="pp-service-facts">
                <div>
                  <MapPin size={18} />
                  <span>
                    <small>Listed service area</small>
                    <strong>{p.area}</strong>
                  </span>
                </div>
                <div>
                  <ShieldCheck size={18} />
                  <span>
                    <small>Platform profile</small>
                    <strong>Reviewed by an administrator</strong>
                  </span>
                </div>
              </div>
              <h3>Skills & services</h3>
              <div className="pp-skills">
                {(p.categories || [p.category]).map((slug) => (
                  <Link key={slug} to={`/services?category=${slug}`}>
                    {categories.find((c) => c.slug === slug)?.name || slug}
                  </Link>
                ))}
              </div>
              <p className="pp-caption">
                Ask about your specific job before agreeing on the work.
              </p>
              <div className="pp-skills">
                {p.skills?.length ? (
                  p.skills.map((skill) => (
                    <span key={skill}>
                      <Check size={14} />
                      {skill}
                    </span>
                  ))
                ) : (
                  <p>No specific skills have been listed yet.</p>
                )}
              </div>
            </article>

            <article className="card pp-card pp-scope">
              <span className="eyebrow">KNOW WHAT TO EXPECT</span>
              <h2>A clear scope. A better visit.</h2>
              <div className="pp-scope-grid">
                <div>
                  <Wallet size={21} />
                  <h3>Starting estimate</h3>
                  <p>
                    The listed {money(p.price)} is a starting visit price.
                    Describe the job and agree on any extra work or materials
                    with your professional.
                  </p>
                </div>
                <div>
                  <CalendarDays size={21} />
                  <h3>Work around your day</h3>
                  <p>
                    Select an available appointment. Your request starts as
                    Pending and becomes accepted when the professional confirms
                    it.
                  </p>
                </div>
                <div>
                  <ShieldCheck size={21} />
                  <h3>Your visit code</h3>
                  <p>
                    Find the private OTP in your customer dashboard. Share it on
                    arrival when you are ready for work to start.
                  </p>
                </div>
              </div>
              <div className="pp-preparation">
                <CheckCircle2 size={19} />
                <div>
                  <strong>Details that make the request easier</strong>
                  <p>
                    Describe the issue or task, provide your full service
                    address and note any access instructions. Confirm the scope
                    before work begins. Payment is on site.
                  </p>
                </div>
              </div>
            </article>

            <article id="professional-photos" className="card pp-card">
              <div className="pp-card-heading">
                <div>
                  <span className="eyebrow">A CLOSER LOOK</span>
                  <h2>Service & work examples.</h2>
                </div>
                <span>
                  {portfolio.length}{" "}
                  {portfolio.length === 1 ? "photo" : "photos"}
                </span>
              </div>
              <p className="pp-caption">
                Professional uploads appear first. Photos labelled as samples
                are stock illustrations, not verified jobs completed by this
                professional.
              </p>
              {portfolio.length ? (
                <div
                  className={`pp-gallery ${portfolio.length === 1 ? "pp-gallery-single" : ""}`}
                >
                  {portfolio.map((photo, i) => (
                    <button
                      key={`${photo.src}-${i}`}
                      onClick={() => setPhotoIndex(i)}
                      aria-label={`Open ${photo.kind === "sample" ? "sample photograph" : "professional work photograph"} ${i + 1}`}
                    >
                      <WorkPhoto photo={photo} showCaption />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="pp-no-photos">
                  <ImageIcon size={27} />
                  <h3>No work photos added yet.</h3>
                  <p>
                    Read the listed skills and discuss your job with the
                    professional when making a request.
                  </p>
                </div>
              )}
            </article>

            <article id="professional-reviews" className="card pp-card">
              <span className="eyebrow">FROM COMPLETED BOOKINGS</span>
              <h2>Customer experiences.</h2>
              {feedback.length ? (
                <>
                  <div className="pp-review-summary">
                    <div>
                      <strong>
                        {p.rating.toFixed(1)}
                        <small> / 5</small>
                      </strong>
                      <Stars rating={p.rating} count={p.reviews} />
                      <p>Customer rating on GharSeva</p>
                    </div>
                    <div
                      className="pp-rating-bars"
                      aria-label="Rating distribution of displayed reviews"
                    >
                      {[5, 4, 3, 2, 1].map((stars) => {
                        const count = feedback.filter(
                          (r) => r.rating === stars,
                        ).length;
                        return (
                          <div key={stars}>
                            <span>
                              {stars}
                              <Star size={11} />
                            </span>
                            <div className="pp-rating-track">
                              <span
                                style={{
                                  width: `${(count / feedback.length) * 100}%`,
                                }}
                              />
                            </div>
                            <small>{count}</small>
                          </div>
                        );
                      })}
                      <p>
                        Distribution of {feedback.length} displayed{" "}
                        {feedback.length === 1 ? "review" : "reviews"}.
                      </p>
                    </div>
                  </div>
                  <div className="pp-review-tools">
                    <label>
                      <span>Review rating</span>
                      <select
                        aria-label="Filter reviews by rating"
                        value={reviewRating}
                        onChange={(e) => setReviewRating(e.target.value)}
                      >
                        <option value="">All ratings</option>
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>
                            {n} {n === 1 ? "star" : "stars"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Review order</span>
                      <select
                        aria-label="Sort reviews"
                        value={reviewSort}
                        onChange={(e) => setReviewSort(e.target.value)}
                      >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="highest">Highest rating</option>
                        <option value="lowest">Lowest rating</option>
                      </select>
                    </label>
                  </div>
                  <p className="pp-caption" role="status">
                    Showing {reviews.length} of {feedback.length} loaded
                    reviews.
                    {p.reviews > feedback.length
                      ? " The profile loads up to 30 recent reviews."
                      : ""}
                  </p>
                  <div className="pp-reviews">
                    {reviews.length ? (
                      reviews.map((r) => (
                        <article className="pp-review" key={r._id}>
                          <Avatar person={r.customer} />
                          <div>
                            <div className="pp-review-head">
                              <strong>
                                {r.customer?.name?.split(" ")[0] || "Customer"}
                              </strong>
                              <time dateTime={r.createdAt}>
                                {new Date(r.createdAt).toLocaleDateString(
                                  "en-IN",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                    timeZone: "Asia/Kolkata",
                                  },
                                )}
                              </time>
                            </div>
                            <Stars rating={r.rating} />
                            <p>{r.feedback}</p>
                            <span className="pp-review-booking">
                              <CheckCircle2 size={12} />
                              Completed booking
                            </span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="pp-empty-reviews">
                        <h3>No reviews with this rating.</h3>
                        <p>
                          Try all ratings to read the available customer
                          experiences.
                        </p>
                        <button
                          className="text-link"
                          onClick={() => setReviewRating("")}
                        >
                          Show all reviews
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="pp-new-profile">
                  <Star size={25} />
                  <div>
                    <h3>New to customer reviews.</h3>
                    <p>
                      No customer reviews have been published yet. Use the
                      listed experience and skills to assess the fit, then
                      discuss your job. Customers can review a completed booking
                      from their dashboard.
                    </p>
                  </div>
                </div>
              )}
            </article>

            <div className="pp-return">
              <Link
                to={`/services?category=${p.category}&city=${encodeURIComponent(p.city)}`}
              >
                <ArrowLeft size={16} />
                More {p.categoryName.toLowerCase()} professionals in {p.city}
              </Link>
              <Link to="/contact">
                Need help choosing? Contact support <ArrowRight size={15} />
              </Link>
            </div>
          </div>

          <aside className="pp-sidebar">
            <article
              id="professional-appointment"
              ref={appointmentRef}
              className="card pp-appointment"
            >
              <span className="eyebrow">MAKE IT YOUR TIME</span>
              <h2>Plan your appointment.</h2>
              <div className="pp-booking-price">
                <strong>
                  {money(p.price)}
                  <small> / visit</small>
                </strong>
                <span>
                  Starting estimate · deposit + approved balance online
                </span>
              </div>
              {!p.available ? (
                <div className="pp-appointment-message">
                  <Clock size={22} />
                  <h3>Not taking new requests.</h3>
                  <p>
                    This professional is currently unavailable. Browse other
                    professionals for the service you need.
                  </p>
                  <Link
                    className="btn light full"
                    to={`/services?category=${p.category}&city=${encodeURIComponent(p.city)}`}
                  >
                    Find another professional
                  </Link>
                </div>
              ) : !config.bookingEnabled ? (
                <div className="pp-appointment-message">
                  <CalendarDays size={22} />
                  <h3>Booking is temporarily paused.</h3>
                  <p>
                    The platform is not accepting requests at the moment. Please
                    try again later or contact support.
                  </p>
                  <Link className="text-link" to="/contact">
                    Contact support
                  </Link>
                </div>
              ) : (
                <>
                  <p className="pp-caption">
                    Times are shown in Indian Standard Time (IST). Choose a date
                    within the next 90 days.
                  </p>
                  <label className="field">
                    <span>Service date</span>
                    <input
                      type="date"
                      aria-label="Appointment date"
                      min={indiaToday()}
                      max={indiaDateAfter(90)}
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setSelected("");
                      }}
                    />
                  </label>
                  <div className="pp-quick-dates" aria-label="Upcoming dates">
                    {[1, 2, 3, 4].map((offset) => {
                      const d = indiaDateAfter(offset);
                      return (
                        <button
                          key={d}
                          className={date === d ? "active" : ""}
                          aria-pressed={date === d}
                          aria-label={`Choose ${prettyDate(d)}`}
                          onClick={() => {
                            setDate(d);
                            setSelected("");
                          }}
                        >
                          <span>
                            {offset === 1
                              ? "Tomorrow"
                              : shortDate(d, { weekday: "short" })}
                          </span>
                          <strong>
                            {shortDate(d, { day: "numeric", month: "short" })}
                          </strong>
                        </button>
                      );
                    })}
                  </div>
                  <div className="pp-slot-heading">
                    <h3>Available start times</h3>
                    <span>IST</span>
                  </div>
                  <div
                    className="pp-slots"
                    aria-busy={slotsLoading}
                    aria-live="polite"
                  >
                    {!validDate ? (
                      <p>
                        Choose a date between {prettyDate(indiaToday())} and{" "}
                        {prettyDate(indiaDateAfter(90))}.
                      </p>
                    ) : slotsLoading ? (
                      <p>Checking live availability…</p>
                    ) : slotError ? (
                      <div>
                        <ErrorBox message={slotError} />
                        <button
                          className="text-link"
                          onClick={() => setSlotRetry((n) => n + 1)}
                        >
                          Retry availability
                        </button>
                      </div>
                    ) : currentSlots.length ? (
                      currentSlots.map((time) => (
                        <button
                          key={time}
                          className={chosen === time ? "active" : ""}
                          aria-pressed={chosen === time}
                          onClick={() => setSelected(time)}
                        >
                          <Clock size={14} />
                          {timeLabel(time)}
                        </button>
                      ))
                    ) : (
                      <div className="pp-no-slots">
                        <CalendarDays size={20} />
                        <strong>No open times on this date.</strong>
                        <p>
                          Try another day. Existing requests and the
                          professional's schedule can affect availability.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="pp-appointment-selection" role="status">
                    {chosen ? (
                      <>
                        <CheckCircle2 size={16} />
                        <span>
                          {prettyDate(date)} at {timeLabel(chosen)} IST
                        </span>
                      </>
                    ) : (
                      "Select a start time to continue."
                    )}
                  </div>
                  {user && user.role !== "customer" ? (
                    <div className="pp-account-note">
                      <p>
                        Booking requests are available in customer accounts. You
                        are signed in as{" "}
                        {user.role === "admin"
                          ? "an administrator"
                          : "a professional"}
                        .
                      </p>
                      <Link
                        className="btn light full"
                        to={`/dashboard/${user.role}`}
                      >
                        Go to my dashboard
                      </Link>
                    </div>
                  ) : canRequest && chosen ? (
                    <Link className="btn full pp-booking-link" to={bookingHref}>
                      Request a booking <ArrowRight size={17} />
                    </Link>
                  ) : (
                    <button className="btn full" disabled>
                      Choose an available time <ArrowRight size={17} />
                    </button>
                  )}
                  <p className="pp-next-note">
                    {!user
                      ? "You'll log in before adding your address and job details."
                      : "Next: add your address and job details."}{" "}
                    No request is sent from this page. Availability is checked
                    again when booking.
                  </p>
                </>
              )}
              <div className="pp-weekly">
                <h3>Listed working days</h3>
                <div>
                  {week.map((day, i) => (
                    <span
                      key={day}
                      className={p.days?.includes(i) ? "active" : ""}
                      aria-label={`${day}: ${p.days?.includes(i) ? "listed working day" : "not listed"}`}
                    >
                      {day}
                    </span>
                  ))}
                </div>
                <p>
                  Working days indicate the usual schedule. Use the live times
                  above to check a specific date.
                </p>
              </div>
              <div className="pp-confirmation">
                <ShieldCheck size={18} />
                <p>
                  Your request needs provider acceptance. Share the private
                  visit code only when your professional arrives and you are
                  ready.
                </p>
              </div>
            </article>
            <div className="pp-side-help">
              <h3>A question before you book?</h3>
              <p>
                Support can help with the booking process or finding the right
                category.
              </p>
              <Link to="/contact">
                Contact support <ArrowRight size={14} />
              </Link>
            </div>
          </aside>
        </div>
      </section>
      {portfolio.length > 0 && (
        <dialog
          ref={dialogRef}
          className="pp-photo-dialog"
          aria-label="Work example viewer"
          onKeyDown={(e) => {
            if (e.key !== "Tab") return;
            const controls = [
              ...e.currentTarget.querySelectorAll("button:not(:disabled)"),
            ];
            const first = controls[0],
              last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }}
          onCancel={() => setPhotoIndex(-1)}
          onClose={() => setPhotoIndex(-1)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPhotoIndex(-1);
          }}
        >
          <div className="pp-photo-head">
            <span>
              {p.categoryName} · Example {photoIndex + 1} of {portfolio.length}
            </span>
            <button
              className="icon-button"
              aria-label="Close work example"
              onClick={() => setPhotoIndex(-1)}
            >
              <X />
            </button>
          </div>
          {photoIndex >= 0 && (
            <WorkPhoto
              key={portfolio[photoIndex]?.src}
              photo={portfolio[photoIndex]}
              loading="eager"
            />
          )}
          <div className="pp-photo-controls">
            <button
              className="btn light small"
              disabled={photoIndex <= 0}
              onClick={() => setPhotoIndex((i) => i - 1)}
            >
              <ArrowLeft size={16} />
              Previous
            </button>
            <span>
              {portfolio[photoIndex]?.kind === "sample"
                ? "Illustrative stock sample, not verified completed work"
                : "Photograph uploaded by this professional"}
            </span>
            <button
              className="btn light small"
              disabled={photoIndex >= portfolio.length - 1}
              onClick={() => setPhotoIndex((i) => i + 1)}
            >
              Next <ArrowRight size={16} />
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
