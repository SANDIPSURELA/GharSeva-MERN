import { popularCategories } from "../../../shared/discovery-state.js";
import { DiscoveryNotice } from "../components/DiscoveryNotice";
import { supportedCities } from "../../../shared/cities.js";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Search,
  MapPin,
  ShieldCheck,
  Clock,
  Scale,
  Sparkles,
  CheckCircle2,
  CalendarDays,
  KeyRound,
  Wallet,
  Plus,
  Minus,
  Check,
} from "lucide-react";
import { useApp } from "../context";
import { money } from "../api";
import { ProviderCard } from "../components/UI";
import "./Home.css";

const questions = [
  [
    "How do I choose the right service?",
    "Browse the service cards for common jobs. If you are unsure whether an issue needs a plumber, electrician or another professional, the guided service finder helps you choose a category. You can then read profiles and compare up to three professionals.",
  ],
  [
    "Is my booking confirmed immediately?",
    "Your request begins as Pending. The assigned professional must accept it before it becomes Accepted. Your dashboard shows each step, including when the professional is on the way, when work starts and when it is completed.",
  ],
  [
    "What does the starting price include?",
    "The listed amount is a starting estimate. After provider acceptance, pay the required deposit online before arrival verification and work. Approve extras, review the itemised final bill after completion, then pay the approved total less the credited deposit online. Razorpay TEST payments do not collect live money; unavailable checkout blocks required payments. Historical bookings retain their saved rules.",
  ],
  [
    "When should I share my visit OTP?",
    "Your six-digit visit code appears in your customer dashboard. Share it with your assigned professional after they arrive and you are ready for work to begin. The code allows the professional to mark the booking as In Progress. It is not sent by SMS.",
  ],
  [
    "Can I cancel or change my appointment?",
    "You can cancel or reschedule a Pending or Accepted booking from your dashboard. A rescheduled request needs provider acceptance again. These options close once the professional is on the way.",
  ],
  [
    "How are professionals and reviews checked?",
    "The platform administrator reviews supporting documents before a new profile appears in search. Customers can review their own completed bookings once. Administrator approval is a profile review, not an external background check. Sample profiles and photos in this college project are demonstration content.",
  ],
];

export function Home() {
  const {
    categories,
    providers,
    discoveryLoading,
    discoveryError,
    user,
    selectedCity: city,
    setSelectedCity: setCity,
  } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [openQuestion, setOpenQuestion] = useState(0);
  const cities = supportedCities;
  const local = providers.filter((p) => !city || p.city === city);
  const featured = [...local]
    .sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        b.rating - a.rating ||
        b.reviews - a.reviews,
    )
    .slice(0, 3);
  const servicesUrl = (slug = "") => {
    const params = new URLSearchParams();
    if (slug) params.set("category", slug);
    if (city) params.set("city", city);
    return `/services${params.size ? `?${params}` : ""}`;
  };
  const providerAction =
    user?.role === "provider"
      ? "/dashboard/provider"
      : user
        ? "/contact"
        : "/register?role=provider";

  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="tiny-dot" />
              EVERYDAY HELP, EXTRAORDINARY CARE
            </span>
            <h1 id="home-title">
              A little help.
              <br />A <span>happier home.</span>
            </h1>
            <p>
              Repairs, cleaning and everyday care. Find a local professional,
              compare your options and choose a visit that fits your day.
            </p>
            <form
              className="hero-search"
              onSubmit={(e) => {
                e.preventDefault();
                const params = new URLSearchParams();
                if (query.trim()) params.set("query", query.trim());
                if (city) params.set("city", city);
                navigate(`/services${params.size ? `?${params}` : ""}`);
              }}
            >
              <label>
                <Search size={19} />
                <input
                  aria-label="Search for a service"
                  placeholder="Try plumbing, cleaning, electrical…"
                  value={query}
                  maxLength={100}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="city-select">
                <MapPin size={18} />
                <select
                  aria-label="Select your city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                >
                  <option value="">Select city</option>
                  {cities.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <button className="btn" type="submit">
                <span className="home-search-label" aria-hidden="true">
                  Find help
                </span>
                <ArrowRight size={21} />
                <span className="sr-only">Find services</span>
              </button>
            </form>
            <div className="home-popular">
              <span>Popular:</span>
              {!discoveryLoading &&
                !discoveryError &&
                popularCategories(categories).map((c) => (
                  <Link key={c.slug} to={servicesUrl(c.slug)}>
                    {c.name}
                  </Link>
                ))}
            </div>
            <div className="hero-trust">
              <span>
                <ShieldCheck size={17} />
                Reviewed profiles
              </span>
              <span>
                <Scale size={17} />
                Compare your options
              </span>
              <span>
                <CalendarDays size={17} />
                Pick an available slot
              </span>
            </div>
            <div className="hero-help">
              <Sparkles size={18} />
              <span>Not sure who to book?</span>
              <Link to="/finder">
                Try the service finder <ArrowRight size={15} />
              </Link>
            </div>
          </div>
          <div className="hero-visual">
            <img
              className="hero-photo"
              src="/images/cleaning.jpg"
              alt="A home cleaning professional wiping a window shutter"
              fetchPriority="high"
              width="1000"
              height="667"
            />
            <div className="hero-photo-caption">
              <span>LESS ON YOUR TO-DO LIST</span>
              <strong>More time for what matters.</strong>
            </div>
            <div className="floating-card top">
              <span className="float-icon">
                <ShieldCheck />
              </span>
              <div>
                <strong>Your home. Your choice.</strong>
                <small>Read profiles before you book</small>
              </div>
            </div>
            <div className="floating-card bottom">
              <span className="float-icon soft">
                <KeyRound />
              </span>
              <div>
                <strong>You're in control</strong>
                <small>Visit code before work begins</small>
              </div>
              <span className="tiny-dot" />
            </div>
          </div>
        </div>
      </section>

      <section className="home-assurance" aria-label="Your booking at a glance">
        <div className="container">
          {[
            [
              ShieldCheck,
              "A reviewed profile",
              "Explore skills, experience and work examples.",
            ],
            [
              CalendarDays,
              "A time that suits you",
              "Choose from the professional's available slots.",
            ],
            [
              KeyRound,
              "A confident start",
              "Share your code when you are ready to begin.",
            ],
            [
              Wallet,
              "A clear conversation",
              "Approve extras, then pay the approved balance online.",
            ],
          ].map(([Icon, title, text]) => (
            <div key={title}>
              <Icon size={22} />
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="home-services-title">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">WHAT'S ON YOUR LIST?</span>
              <h2 id="home-services-title">Good help, for every corner.</h2>
              <p>
                From small fixes to everyday routines, start with the job you
                need done.
              </p>
            </div>
            <Link className="text-link" to={servicesUrl()}>
              Browse professionals <ArrowRight size={17} />
            </Link>
          </div>
          <div className="home-service-grid">
            {!discoveryLoading &&
              !discoveryError &&
              categories.map((c) => (
                <Link
                  key={c._id}
                  className="category-card home-service-card"
                  to={servicesUrl(c.slug)}
                >
                  <img
                    src={c.image}
                    alt={`${c.name} service example`}
                    loading="lazy"
                    width="400"
                    height="260"
                  />
                  <div>
                    <h3>{c.name}</h3>
                    <p className="home-service-description">{c.description}</p>
                    <div className="home-service-price">
                      <span>
                        Starting from <strong>{money(c.price)}</strong>
                      </span>
                      <span className="home-card-arrow">
                        <ArrowRight size={17} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
          </div>
          <DiscoveryNotice scope="catalog" />
          <p className="home-price-note">
            Starting prices are visit estimates. Discuss any extra work or
            materials with your professional before agreeing to them.
          </p>
        </div>
      </section>

      <section
        className="section home-tools-section"
        aria-labelledby="home-tools-title"
      >
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">A LITTLE LESS GUESSWORK</span>
              <h2 id="home-tools-title">
                Helpful choices. A calmer experience.
              </h2>
              <p>
                Three thoughtful tools to help you choose and stay in control.
              </p>
            </div>
          </div>
          <div className="home-tools-grid">
            <article className="home-tool-card">
              <span className="home-tool-icon">
                <Sparkles />
              </span>
              <span className="home-tool-number">01 / FIND YOUR FIT</span>
              <h3>
                Describe the problem.
                <br />
                Find your service.
              </h3>
              <p>
                A leaking tap or a faulty switch? Select your household issue,
                city and priority. The guided finder suggests a category and
                shows matching professionals.
              </p>
              <div className="home-tool-example">
                <span>Leaking tap</span>
                <ArrowRight size={16} />
                <strong>Plumbing</strong>
              </div>
              <Link className="text-link" to="/finder">
                Guide me to a service <ArrowRight size={16} />
              </Link>
            </article>
            <article className="home-tool-card">
              <span className="home-tool-icon">
                <Scale />
              </span>
              <span className="home-tool-number">02 / CHOOSE WITH CONTEXT</span>
              <h3>
                A few good options.
                <br />
                One easier decision.
              </h3>
              <p>
                Select Compare on up to three provider cards. View starting
                prices, experience, skills and saved customer feedback side by
                side before choosing.
              </p>
              <div className="home-compare-example">
                <span>Price</span>
                <span>Experience</span>
                <span>Reviews</span>
              </div>
              <Link className="text-link" to={servicesUrl()}>
                Find people to compare <ArrowRight size={16} />
              </Link>
            </article>
            <article className="home-tool-card">
              <span className="home-tool-icon">
                <KeyRound />
              </span>
              <span className="home-tool-number">03 / START ON YOUR TERMS</span>
              <h3>
                Your visit.
                <br />
                Your go-ahead.
              </h3>
              <p>
                Your private six-digit code appears in your booking. Share it
                with the assigned professional when they arrive and you are
                ready for work to start.
              </p>
              <div
                className="home-otp-example"
                aria-label="Private six-digit visit code"
              >
                <KeyRound size={16} />
                <span aria-hidden="true">••••••</span>
                <small>Only in your dashboard</small>
              </div>
              <a className="text-link" href="#home-how-it-works">
                See the booking journey <ArrowRight size={16} />
              </a>
            </article>
          </div>
        </div>
      </section>

      <section
        className="section pale"
        aria-labelledby="home-professionals-title"
      >
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">MEET YOUR NEXT HELPING HAND</span>
              <h2 id="home-professionals-title">
                {city
                  ? `A helping hand in ${city}.`
                  : "Find someone you can count on."}
              </h2>
              <p>
                Read about their skills, service area and experience. Reviews
                come from completed bookings.
              </p>
            </div>
            <Link className="text-link" to={servicesUrl()}>
              View all {city ? `in ${city}` : "professionals"}{" "}
              <ArrowRight size={17} />
            </Link>
          </div>
          <div
            className="home-city-picker"
            aria-label="Browse professionals by city"
          >
            <button
              className={!city ? "active" : ""}
              aria-pressed={!city}
              onClick={() => setCity("")}
            >
              <MapPin size={15} />
              Choose a city
            </button>
            {cities.map((c) => (
              <button
                key={c}
                className={city === c ? "active" : ""}
                aria-pressed={city === c}
                onClick={() => setCity(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="home-local-count" role="status">
            {local.length} listed professional{local.length === 1 ? "" : "s"}
            {city ? ` in ${city}` : " across listed cities"}. Check each profile
            for appointment availability.
          </p>
          <div className="provider-grid">
            {!discoveryLoading &&
              !discoveryError &&
              featured.map((p) => <ProviderCard key={p._id} provider={p} />)}
          </div>
          <DiscoveryNotice resultCount={featured.length} />
        </div>
      </section>

      <section
        className="section home-journey"
        id="home-how-it-works"
        aria-labelledby="home-journey-title"
      >
        <div className="container how-grid">
          <div>
            <span className="eyebrow">THOUGHTFULLY SIMPLE</span>
            <h2 id="home-journey-title">
              From “I need help”
              <br />
              to “all taken care of.”
            </h2>
            <p>
              Your customer dashboard keeps the request, appointment details and
              booking activity together. Follow the progress as your
              professional updates the same booking.
            </p>
            <Link className="btn" to={servicesUrl()}>
              Find my professional <ArrowRight size={17} />
            </Link>
            <div className="home-journey-note">
              <Clock size={17} />
              <span>
                A request is confirmed only after the provider accepts it.
              </span>
            </div>
          </div>
          <div className="steps">
            {[
              [
                "01",
                "Find your fit",
                "Browse a service, read profiles and compare professionals before choosing.",
              ],
              [
                "02",
                "Request your visit",
                "Pick an available date and time, add your address and describe the work. Wait for provider acceptance.",
              ],
              [
                "03",
                "Welcome your professional",
                "Follow the status in your dashboard. Share your visit OTP after arrival, when you are ready to begin.",
              ],
              [
                "04",
                "Finish with confidence",
                "Approve extras and the final bill, pay the remaining balance online, and review the completed service. Work completion and payment settlement are separate.",
              ],
            ].map(([number, title, text]) => (
              <article key={number}>
                <span>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="section home-ready-section"
        aria-labelledby="home-ready-title"
      >
        <div className="container home-ready-grid">
          <div className="home-ready-photo">
            <img
              src="/images/home.jpg"
              alt="A bright home ready for everyday living"
              loading="lazy"
              width="1000"
              height="667"
            />
            <div>
              <ShieldCheck size={20} />
              <span>
                A few details now.
                <br />
                <strong>A smoother visit later.</strong>
              </span>
            </div>
          </div>
          <div>
            <span className="eyebrow">BEFORE YOUR FIRST VISIT</span>
            <h2 id="home-ready-title">
              A little preparation
              <br />
              goes a long way.
            </h2>
            <p>Help your professional understand the job before they arrive.</p>
            <ul className="home-ready-list">
              {[
                [
                  "Describe the work",
                  "Add the issue, access instructions and any useful details to your request.",
                ],
                [
                  "Give a complete address",
                  "Include your house number, area, city and a helpful landmark.",
                ],
                [
                  "Discuss the estimate",
                  "Confirm the scope and any extra materials before agreeing to the work.",
                ],
                [
                  "Keep your visit code private",
                  "Share it with the assigned professional only when you are ready to start.",
                ],
              ].map(([title, text]) => (
                <li key={title}>
                  <span>
                    <Check size={16} />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Link className="text-link" to="/contact">
              Need a little help? Contact support <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="home-faq-title">
        <div className="container home-faq-grid">
          <div>
            <span className="eyebrow">GOOD QUESTIONS. CLEAR ANSWERS.</span>
            <h2 id="home-faq-title">Before you book.</h2>
            <p>
              A few things that help make your first booking feel
              straightforward.
            </p>
            <Link className="text-link" to="/contact">
              Ask another question <ArrowRight size={16} />
            </Link>
          </div>
          <div>
            {questions.map(([question, answer], i) => (
              <article className="faq" key={question}>
                <button
                  aria-expanded={openQuestion === i}
                  aria-controls={`home-answer-${i}`}
                  id={`home-question-${i}`}
                  onClick={() => setOpenQuestion(openQuestion === i ? -1 : i)}
                >
                  {question}
                  {openQuestion === i ? (
                    <Minus size={18} />
                  ) : (
                    <Plus size={18} />
                  )}
                </button>
                <div
                  id={`home-answer-${i}`}
                  role="region"
                  aria-labelledby={`home-question-${i}`}
                  hidden={openQuestion !== i}
                >
                  <p>{answer}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="container join-banner home-provider-banner"
        aria-labelledby="home-provider-title"
      >
        <div>
          <span className="eyebrow">GOOD AT WHAT YOU DO?</span>
          <h2 id="home-provider-title">Your skills deserve a bigger stage.</h2>
          <p>
            Create your profile, add your work photos and supporting documents,
            then manage requests after administrator approval.
          </p>
          <div className="home-provider-benefits">
            <span>
              <Check size={15} />
              Your own availability
            </span>
            <span>
              <Check size={15} />
              One connected job inbox
            </span>
            <span>
              <Check size={15} />
              Customer feedback
            </span>
          </div>
        </div>
        <Link className="btn white" to={providerAction}>
          {user?.role === "provider"
            ? "Open my workspace"
            : user
              ? "Ask about becoming a professional"
              : "Become a professional"}
          <ArrowRight size={17} />
        </Link>
      </section>
    </div>
  );
}
