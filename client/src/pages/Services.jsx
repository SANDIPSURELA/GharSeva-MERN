import { DiscoveryNotice } from "../components/DiscoveryNotice";
import { discoveryState } from "../../../shared/discovery-state.js";
import { supportedCities, canonicalCity } from "../../../shared/cities.js";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Search,
  MapPin,
  ShieldCheck,
  Scale,
  Sparkles,
  SlidersHorizontal,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  Wallet,
} from "lucide-react";
import { useApp } from "../context";
import { money } from "../api";
import { ProviderCard, Field } from "../components/UI";
import "./Services.css";

const guides = {
  plumbing: {
    jobs: [
      "Tap and fitting repairs",
      "Pipe leaks",
      "Water tanks",
      "Drainage inspection",
    ],
    prepare:
      "Describe where the leak or blockage is and how long it has been happening. Discuss replacement parts with your professional before they begin.",
  },
  electrical: {
    jobs: [
      "Lights and fans",
      "Switches and sockets",
      "Household faults",
      "Wiring repairs",
    ],
    prepare:
      "Describe the affected fitting or appliance and the issue you have noticed. Ask the professional to confirm the work and any parts required.",
  },
  cleaning: {
    jobs: [
      "Kitchen cleaning",
      "Bathrooms",
      "Full-home cleaning",
      "Move-in cleaning",
    ],
    prepare:
      "Share the rooms and approximate home size. Agree on the cleaning scope, supplies and any additional tasks before the visit.",
  },
  cooking: {
    jobs: [
      "Everyday meals",
      "Meal preparation",
      "Vegetarian cooking",
      "Family occasions",
    ],
    prepare:
      "Share the number of people, preferred cuisine and dietary requirements. Agree on the menu, ingredients and preparation time.",
  },
  carpentry: {
    jobs: [
      "Furniture repairs",
      "Door fittings",
      "Furniture assembly",
      "Cabinets and storage",
    ],
    prepare:
      "Describe the item and what needs fixing or assembling. Discuss measurements, materials and any hardware needed for the work.",
  },
  masonry: {
    jobs: ["Tile fitting", "Plaster repairs", "Brickwork", "Wall repairs"],
    prepare:
      "Describe the area and approximate size of the repair. Confirm the materials, scope and expected work time with the professional.",
  },
  painting: {
    jobs: [
      "Interior walls",
      "Touch-ups",
      "Surface preparation",
      "Decorative finishes",
    ],
    prepare:
      "Share the rooms, wall condition and preferred finish. Agree on paint, preparation, materials and the scope of the estimate.",
  },
  labour: {
    jobs: [
      "Moving help",
      "Loading and unloading",
      "Material handling",
      "Supervised site assistance",
    ],
    prepare:
      "Describe the items, approximate quantity, floors and access. Agree on the number of helpers and the tasks included.",
  },
  appliance: {
    jobs: [
      "AC servicing",
      "Refrigerators",
      "Washing machines",
      "Geysers and microwaves",
    ],
    prepare:
      "Share the appliance type, brand and symptoms. Confirm the diagnosis and any replacement-part cost before agreeing to repairs.",
  },
  gardening: {
    jobs: [
      "Plant care",
      "Pruning",
      "Balcony gardens",
      "Soil and seasonal care",
    ],
    prepare:
      "Describe your plants or garden area and the care needed. Discuss tools, supplies and any recurring visits separately.",
  },
};
const PAGE_SIZE = 9;
const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function Services() {
  const {
    providers,
    categories,
    comparison,
    error,
    discoveryLoading,
    discoveryError,
    refresh,
    selectedCity,
    setSelectedCity,
  } = useApp();
  const [params, setParams] = useSearchParams();
  const latestParams = useRef(params);
  latestParams.current = params;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const resultsRef = useRef(null);
  const query = params.get("query") || "";
  const city = selectedCity;
  const urlCity = params.get("city");
  useEffect(() => {
    if (urlCity) setSelectedCity(canonicalCity(urlCity));
  }, [urlCity, setSelectedCity]);
  const category = params.get("category") || "";
  const sort = ["rating", "price", "experience"].includes(params.get("sort"))
    ? params.get("sort")
    : "rating";
  const price = positive(params.get("price"));
  const rawRating = positive(params.get("rating"));
  const rating = rawRating <= 5 ? rawRating : 0;
  const accepting = params.get("available") === "1";
  const selectedCategory = categories.find((c) => c.slug === category);
  const guide = selectedCategory ? guides[selectedCategory.slug] : null;
  const cities = supportedCities;
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matching = providers
    .filter((p) => {
      const searchable =
        `${p.name} ${p.categoryName} ${(p.categoryNames || []).join(" ")} ${p.skills?.join(" ") || ""} ${p.area} ${p.city} ${p.bio || ""}`.toLowerCase();
      return (
        terms.every((term) => searchable.includes(term)) &&
        (!city || p.city === city) &&
        (!category || (p.categories || [p.category]).includes(category)) &&
        (!accepting || p.available) &&
        (!price || p.price <= price) &&
        p.rating >= rating
      );
    })
    .sort(
      (a, b) =>
        (sort === "price"
          ? a.price - b.price
          : sort === "experience"
            ? b.experience - a.experience
            : b.rating - a.rating || b.reviews - a.reviews) ||
        a.name.localeCompare(b.name),
    );
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const rawPage = positive(params.get("page"));
  const page = Math.min(
    Number.isInteger(rawPage) ? rawPage || 1 : 1,
    pageCount,
  );
  const visible = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const listingState = discoveryState({
    loading: discoveryLoading,
    error: discoveryError || error,
    categories,
    providers,
    city,
    resultCount: matching.length,
  });
  const update = (key, value) => {
    if (key === "city") setSelectedCity(value);
    const next = new URLSearchParams(latestParams.current);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    latestParams.current = next;
    setParams(next, { replace: key !== "page" });
  };
  const clear = () => {
    const next = new URLSearchParams(sort === "rating" ? {} : { sort });
    latestParams.current = next;
    setParams(next, { replace: true });
  };
  const chips = [
    ...(query.trim()
      ? [{ key: "query", label: `Search: ${query.trim()}` }]
      : []),
    ...(category
      ? [
          {
            key: "category",
            label: selectedCategory?.name || "Unlisted service",
          },
        ]
      : []),

    ...(price ? [{ key: "price", label: `Up to ${money(price)}` }] : []),
    ...(rating ? [{ key: "rating", label: `${rating}+ stars` }] : []),
    ...(accepting ? [{ key: "available", label: "Accepting bookings" }] : []),
  ];
  const filtersCount = chips.filter((c) => c.key !== "query").length;
  const compared = providers.filter((p) => comparison.includes(p._id)).length;
  const goToPage = (next) => {
    update("page", next === 1 ? "" : String(next));
    resultsRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  };

  return (
    <div className="services-page">
      <section className="services-intro">
        <div className="container services-intro-grid">
          <div>
            <nav className="services-breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Home</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Services</span>
            </nav>
            <span className="eyebrow">YOUR NEXT HELPING HAND</span>
            <h1>
              {selectedCategory
                ? `${selectedCategory.name}, on your terms.`
                : "The right person. The right job."}
            </h1>
            <p>
              {selectedCategory
                ? selectedCategory.description
                : "Explore household services, read professional profiles and choose someone who fits your job, location and budget."}
            </p>
            <div className="services-intro-benefits">
              <span>
                <ShieldCheck size={16} />
                Reviewed profiles
              </span>
              <span>
                <Scale size={16} />
                Compare before choosing
              </span>
              <span>
                <CalendarDays size={16} />
                Available appointment slots
              </span>
            </div>
          </div>
          <div className="services-intro-photo">
            <img
              src={selectedCategory?.image || "/images/cleaning.jpg"}
              alt={
                selectedCategory
                  ? `${selectedCategory.name} service example`
                  : "Professional home cleaning example"
              }
              width="600"
              height="400"
              fetchPriority="high"
            />
            <div>
              <Wallet size={18} />
              <span>
                Starting visit estimates.
                <br />
                <strong>
                  Deposit after acceptance. Approved balance online.
                </strong>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        className="services-category-section"
        aria-labelledby="services-category-title"
      >
        <div className="container">
          <div className="services-category-heading">
            <div>
              <span className="eyebrow">START WITH THE JOB</span>
              <h2 id="services-category-title">What needs attention?</h2>
            </div>
            <button
              className={!category ? "services-all active" : "services-all"}
              aria-pressed={!category}
              onClick={() => update("category", "")}
            >
              All services <ArrowRight size={15} />
            </button>
          </div>
          <div className="services-category-nav">
            {categories.map((c) => (
              <button
                key={c.slug}
                className={category === c.slug ? "active" : ""}
                aria-pressed={category === c.slug}
                onClick={() => update("category", c.slug)}
              >
                <img
                  src={c.image}
                  alt=""
                  loading="lazy"
                  width="64"
                  height="64"
                />
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {
                      providers.filter(
                        (p) =>
                          (p.categories || [p.category]).includes(c.slug) &&
                          (!city || p.city === city),
                      ).length
                    }{" "}
                    listed{city ? ` in ${city}` : ""}
                  </small>
                </span>
                <span className="services-category-check">
                  {category === c.slug ? (
                    <Check size={15} />
                  ) : (
                    <ArrowRight size={14} />
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section services-list-section">
        <div className="container services-layout">
          <aside className="filters card">
            <div className="filter-title">
              <h3>
                <SlidersHorizontal size={18} />
                Refine your search
              </h3>
              <button
                className="text-link"
                disabled={!chips.length}
                onClick={clear}
              >
                Reset all
              </button>
            </div>
            <button
              className="services-mobile-filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls="services-filter-fields"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal size={17} />
              {filtersOpen ? "Hide filters" : "Show filters"}
              {filtersCount > 0 && <b>{filtersCount}</b>}
              {filtersOpen ? (
                <ChevronUp size={17} />
              ) : (
                <ChevronDown size={17} />
              )}
            </button>
            <div
              id="services-filter-fields"
              className={`services-filter-fields ${filtersOpen ? "is-open" : ""}`}
            >
              <Field label="Service category">
                <select
                  aria-label="Service category"
                  value={category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  <option value="">All services</option>
                  {!discoveryLoading &&
                    !discoveryError &&
                    categories.length > 0 &&
                    category &&
                    !selectedCategory && (
                      <option value={category}>Service no longer listed</option>
                    )}
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="City">
                <select
                  aria-label="City"
                  value={city}
                  onChange={(e) => update("city", e.target.value)}
                >
                  <option value="" disabled>
                    Select city
                  </option>
                  {city && !cities.includes(city) && (
                    <option value={city}>{city} — no listings</option>
                  )}
                  {cities.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Maximum starting visit price">
                <select
                  aria-label="Maximum starting visit price"
                  value={price || ""}
                  onChange={(e) => update("price", e.target.value)}
                >
                  <option value="">Any price</option>
                  {price && ![300, 500, 800, 1500].includes(price) && (
                    <option value={price}>Up to {money(price)}</option>
                  )}
                  {[300, 500, 800, 1500].map((n) => (
                    <option key={n} value={n}>
                      Up to {money(n)}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="services-filter-help">
                Additional work and materials are agreed separately.
              </p>
              <Field label="Minimum customer rating">
                <select
                  aria-label="Minimum customer rating"
                  value={rating || ""}
                  onChange={(e) => update("rating", e.target.value)}
                >
                  <option value="">Any rating</option>
                  {rating && ![3, 4, 4.5].includes(rating) && (
                    <option value={rating}>{rating} stars or more</option>
                  )}
                  {[3, 4, 4.5].map((n) => (
                    <option key={n} value={n}>
                      {n} stars or more
                    </option>
                  ))}
                </select>
              </Field>
              <p className="services-filter-help">
                A rating filter hides profiles without customer reviews.
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={accepting}
                  onChange={(e) =>
                    update("available", e.target.checked ? "1" : "")
                  }
                />
                Accepting new booking requests
              </label>
              <p className="services-filter-help">
                Exact dates and times are checked when you book.
              </p>
              <button
                className="btn full services-apply-filters"
                onClick={() => {
                  setFiltersOpen(false);
                  resultsRef.current?.scrollIntoView({
                    behavior: "auto",
                    block: "start",
                  });
                }}
              >
                Show{" "}
                {discoveryLoading
                  ? "Loading"
                  : discoveryError
                    ? "Unavailable"
                    : matching.length}{" "}
                professional
                {matching.length === 1 ? "" : "s"}
                <ArrowRight size={16} />
              </button>
              <div className="finder-tip">
                <Sparkles />
                <h4>A problem, but no service in mind?</h4>
                <p>
                  The guided finder helps match a household issue to the right
                  service category.
                </p>
                <Link to="/finder">
                  Try the service finder <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </aside>
          <div className="services-results" ref={resultsRef}>
            {selectedCategory && (
              <article className="services-guide card">
                <div className="services-guide-top">
                  <span className="eyebrow">
                    A LITTLE ABOUT {selectedCategory.name.toUpperCase()}
                  </span>
                  <span className="services-guide-price">
                    Category guide: from {money(selectedCategory.price)}
                  </span>
                </div>
                <h2>Know the job before you book.</h2>
                <p>
                  {String(
                    selectedCategory.description ||
                      "Confirm the job details with your professional",
                  ).replace(/[.!?]$/, "")}
                  . Each professional lists their own skills and starting visit
                  price.
                </p>
                <div className="services-common-jobs">
                  {(
                    guide?.jobs ||
                    (selectedCategory.description
                      ? [selectedCategory.description]
                      : [])
                  ).map((job) => (
                    <span key={job}>
                      <Check size={14} />
                      {job}
                    </span>
                  ))}
                </div>
                <div className="services-prepare">
                  <CalendarDays size={18} />
                  <div>
                    <strong>Helpful details for your request</strong>
                    <p>
                      {guide?.prepare ||
                        "Describe the job, provide your complete address and agree on the scope and any additional materials with your professional."}
                    </p>
                  </div>
                </div>
              </article>
            )}
            {!discoveryLoading &&
              !discoveryError &&
              categories.length > 0 &&
              category &&
              !selectedCategory && (
                <div className="services-unlisted card">
                  <h2>This service is no longer listed.</h2>
                  <p>
                    Browse an enabled category or contact support about the work
                    you need.
                  </p>
                  <button
                    className="btn light small"
                    onClick={() => update("category", "")}
                  >
                    Browse all services
                  </button>
                </div>
              )}
            <div className="listing-toolbar">
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label="Search professionals"
                  placeholder="Search service, skill, name or area…"
                  value={query}
                  maxLength={100}
                  onChange={(e) => update("query", e.target.value)}
                />
                {query && (
                  <button
                    className="icon-button services-clear-search"
                    aria-label="Clear search"
                    onClick={() => update("query", "")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <select
                aria-label="Sort professionals"
                value={sort}
                onChange={(e) => update("sort", e.target.value)}
              >
                <option value="rating">Highest rated</option>
                <option value="price">Lowest starting price</option>
                <option value="experience">Most experience</option>
              </select>
            </div>
            {chips.length > 0 && (
              <div
                className="services-active-filters"
                aria-label="Active search filters"
              >
                {chips.map((chip) => (
                  <button
                    key={chip.key}
                    aria-label={`Remove ${chip.label} filter`}
                    onClick={() => update(chip.key, "")}
                  >
                    <span>{chip.label}</span>
                    <X size={13} />
                  </button>
                ))}
                <button className="services-clear-all" onClick={clear}>
                  Clear all
                </button>
              </div>
            )}
            {["ready", "no-results", "empty-city"].includes(listingState) && (
              <div className="services-results-heading">
                <div role="status" aria-live="polite">
                  <h2>
                    {matching.length} professional
                    {matching.length === 1 ? "" : "s"}
                    {city ? ` in ${city}` : " found"}
                  </h2>
                  <p>
                    {matching.length
                      ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, matching.length)}. Read skills and reviews before choosing.`
                      : "Try adjusting a filter or exploring a different service."}
                  </p>
                </div>
                {compared > 0 && (
                  <Link className="btn light small" to="/compare">
                    <Scale size={16} />
                    Compare {compared}
                  </Link>
                )}
              </div>
            )}
            {listingState !== "ready" ? (
              <DiscoveryNotice resultCount={matching.length} onClear={clear} />
            ) : (
              <div className="provider-grid listing-grid">
                {visible.map((p) => (
                  <ProviderCard key={p._id} provider={p} showDetails />
                ))}
              </div>
            )}
            {listingState === "ready" && matching.length > PAGE_SIZE && (
              <nav
                className="services-pagination"
                aria-label="Results pagination"
              >
                <button
                  className="btn light small"
                  disabled={page === 1}
                  onClick={() => goToPage(page - 1)}
                >
                  <ArrowLeft size={15} />
                  Previous
                </button>
                <div>
                  {pageCount <= 7 ? (
                    Array.from({ length: pageCount }, (_, i) => i + 1).map(
                      (n) => (
                        <button
                          key={n}
                          className={n === page ? "active" : ""}
                          aria-label={`Page ${n}`}
                          aria-current={n === page ? "page" : undefined}
                          onClick={() => goToPage(n)}
                        >
                          {n}
                        </button>
                      ),
                    )
                  ) : (
                    <span>
                      Page {page} of {pageCount}
                    </span>
                  )}
                </div>
                <button
                  className="btn light small"
                  disabled={page === pageCount}
                  onClick={() => goToPage(page + 1)}
                >
                  Next
                  <ArrowRight size={15} />
                </button>
              </nav>
            )}
            <div className="services-decision-note">
              <ShieldCheck size={19} />
              <p>
                Profile approval is reviewed by the platform administrator.
                Reviews are from completed bookings. Choose an available slot on
                the profile; a request needs provider acceptance.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="container services-help-banner">
        <div>
          <span className="eyebrow">MAKE THE NEXT STEP SIMPLE</span>
          <h2>Found someone who fits?</h2>
          <p>
            Open their profile, check the work details and choose an available
            appointment. Your visit code stays in your customer dashboard until
            you are ready to begin.
          </p>
        </div>
        <Link className="btn light" to="/finder">
          Still deciding? Try the finder <Sparkles size={17} />
        </Link>
      </section>
    </div>
  );
}
