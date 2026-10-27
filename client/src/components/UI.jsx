import {
  ArrowRight,
  Star,
  MapPin,
  Check,
  Heart,
  Scale,
  Clock,
  ShieldCheck,
  LoaderCircle,
  House,
  Menu,
  X,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useApp } from "../context";
import { api, money, label } from "../api";
import { resolveWorkImages } from "../../../shared/work-images.js";
import { WorkPhoto } from "./WorkPhoto";
export function Brand() {
  return (
    <Link className="brand" to="/">
      <span className="brand-icon">
        <House size={21} />
      </span>
      Ghar<span>Seva</span>
      <i />
    </Link>
  );
}
export function Header() {
  const { user, logout, setToast } = useApp();
  const [open, setOpen] = useState(false);
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav
          aria-label="Main navigation"
          className={open ? "main-nav open" : "main-nav"}
        >
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/services">Find services</NavLink>
          <NavLink to="/finder">
            Service assistant <span className="new-tag">NEW</span>
          </NavLink>
          <NavLink to="/about">About us</NavLink>
          <NavLink to="/contact">Contact</NavLink>
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <Link className="btn small" to={`/dashboard/${user.role}`}>
                <LayoutDashboard size={16} />
                My dashboard
              </Link>
              <button
                className="icon-button"
                title="Log out"
                aria-label="Log out"
                onClick={async () => {
                  try {
                    await logout();
                    navigate("/");
                  } catch (e) {
                    setToast(e.message);
                  }
                }}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link className="login-text" to="/login">
                Log in
              </Link>
              <Link className="btn small" to="/register">
                Get started <ArrowRight size={16} />
              </Link>
            </>
          )}
          <button
            className="icon-button menu-toggle"
            aria-expanded={open}
            aria-label="Toggle menu"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <Brand />
          <p>
            A little help.
            <br />A happier home.
          </p>
          <span className="footer-caption">
            A college home services platform.
          </span>
        </div>
        <div>
          <h4>Explore</h4>
          <Link to="/services">Find a professional</Link>
          <Link to="/finder">Guided service finder</Link>
          <Link to="/compare">Compare providers</Link>
        </div>
        <div>
          <h4>For professionals</h4>
          <Link to="/register?role=provider">Join GharSeva</Link>
          <Link to="/provider/login">Provider login</Link>
          <Link to="/about">How it works</Link>
        </div>
        <div>
          <h4>We're here to help</h4>
          <Link to="/contact">Contact & support</Link>
          <Link to="/terms">Terms of use</Link>
          <Link to="/privacy">Privacy notice</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} GharSeva. Built for better everyday
          living.
        </span>
        <span>Sample provider profiles and photos are for demonstration.</span>
      </div>
    </footer>
  );
}
export function Status({ value }) {
  return (
    <span className={`status status-${value?.toLowerCase()}`}>
      {label(value)}
    </span>
  );
}
export function ErrorBox({ message }) {
  return message ? (
    <div className="error-box" role="alert">
      {message}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="empty-state">
      <LoaderCircle className="spin" size={30} />
      <h3>Getting things ready…</h3>
    </div>
  );
}
export function Empty({
  title = "Nothing here yet",
  text = "Your activity will appear here.",
  action,
}) {
  return (
    <div className="empty-state">
      <House size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Stars({ rating = 0, count }) {
  return (
    <span className="stars">
      <Star size={14} fill={rating ? "currentColor" : "none"} />
      <strong>{rating ? rating.toFixed(1) : "New"}</strong>
      {count !== undefined && (
        <span>
          ({count} {count === 1 ? "review" : "reviews"})
        </span>
      )}
    </span>
  );
}
export function Avatar({ person, size = "normal" }) {
  return (
    <span className={`avatar ${size}`}>
      {person?.photo || person?.profile?.photo ? (
        <img src={person.photo || person.profile.photo} alt={person.name} />
      ) : (
        person?.name
          ?.split(" ")
          .map((x) => x[0])
          .join("")
          .slice(0, 2) || "GS"
      )}
    </span>
  );
}
export function PageHead({ eyebrow, title, text, children }) {
  return (
    <section className="page-head">
      <div className="container">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
        {children}
      </div>
    </section>
  );
}
export function ProviderCard({ provider, showDetails = false }) {
  const { user, setUser, setToast, comparison, toggleCompare } = useApp();
  const navigate = useNavigate();
  const photo = resolveWorkImages(provider)[0];
  const fav = user?.favourites?.includes(provider._id);
  return (
    <article className="provider-card">
      <div className="provider-cover">
        <WorkPhoto photo={photo} showCaption />
        <button
          className={fav ? "icon-button heart active" : "icon-button heart"}
          aria-label={`${fav ? "Remove from" : "Add to"} favourites`}
          onClick={async () => {
            if (!user) {
              navigate("/login");
              return;
            }
            if (user.role !== "customer") {
              setToast("Favourites are available in customer accounts.");
              return;
            }
            try {
              setUser(
                await api(`/favourites/${provider._id}`, { method: "POST" }),
              );
            } catch (e) {
              setToast(e.message);
            }
          }}
        >
          <Heart size={18} fill={fav ? "currentColor" : "none"} />
        </button>
        <span className={`availability ${provider.available ? "" : "busy"}`}>
          <i />
          {provider.available ? "Accepting bookings" : "Currently unavailable"}
        </span>
      </div>
      <div className="provider-body">
        <div className="provider-person">
          <Avatar person={provider} />
          <div>
            <h3>{provider.name}</h3>
            {provider.demoProviderId && <small>Fictional demo profile</small>}
            <p>
              {provider.categoryNames?.join(" · ") || provider.categoryName}
            </p>
          </div>
          <ShieldCheck
            className="teal"
            size={20}
            role="img"
            aria-label={
              provider.demoProviderId
                ? "Approved classroom fixture, not a verified real-world professional"
                : "Profile reviewed by administrator"
            }
          />
        </div>
        <div className="provider-rating">
          <Stars rating={provider.rating} count={provider.reviews} />
          <span>{provider.experience} years exp.</span>
        </div>
        <p className="location">
          <MapPin size={14} />
          {provider.area}
        </p>
        {showDetails && (
          <div className="provider-details">
            <p className="provider-summary">{provider.bio}</p>
            <div
              className="provider-skill-preview"
              aria-label="Professional skills"
            >
              {provider.skills?.slice(0, 3).map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>
            <p className="provider-platform-history">
              <Check size={13} />
              {provider.completed
                ? `${provider.completed} completed ${provider.completed === 1 ? "service" : "services"} on GharSeva`
                : "No completed services on GharSeva yet"}
            </p>
          </div>
        )}
        <div className="provider-price">
          <div>
            <small>Starting from</small>
            <strong>
              {money(provider.price)}
              <span>/ visit</span>
            </strong>
          </div>
          <Link
            className="btn small light"
            to={`/providers/${provider._id}`}
            aria-label={`View ${provider.name}'s profile`}
          >
            View profile <ArrowRight size={14} />
          </Link>
        </div>
        <button
          className={
            comparison.includes(provider._id)
              ? "compare-button selected"
              : "compare-button"
          }
          onClick={() => toggleCompare(provider._id)}
        >
          {comparison.includes(provider._id) ? (
            <Check size={14} />
          ) : (
            <Scale size={14} />
          )}{" "}
          {comparison.includes(provider._id)
            ? "Added to comparison"
            : "Compare professional"}
        </button>
      </div>
    </article>
  );
}
export function CompareDock() {
  const { comparison, providers, setComparison } = useApp();
  const { pathname } = useLocation();
  const count = providers.filter((p) => comparison.includes(p._id)).length;
  return count > 0 &&
    !pathname.startsWith("/dashboard") &&
    !pathname.startsWith("/booking") &&
    !pathname.startsWith("/assistant") &&
    !pathname.startsWith("/finder") ? (
    <div className="compare-dock">
      <Scale size={19} />
      <span>
        <strong>
          {count} professional{count > 1 ? "s" : ""}
        </strong>{" "}
        selected
      </span>
      <Link className="btn small" to="/compare">
        Compare <ArrowRight size={15} />
      </Link>
      <button
        className="icon-button"
        aria-label="Clear comparison"
        onClick={() => setComparison([])}
      >
        <X size={17} />
      </button>
    </div>
  ) : null;
}
export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const listener = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", listener);
    };
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Field({ label: caption, children, wide = false }) {
  return (
    <label className={wide ? "field wide" : "field"}>
      <span>{caption}</span>
      {children}
    </label>
  );
}
