import { supportedCities, canonicalCity } from "../../../shared/cities.js";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  Heart,
  House,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Phone,
  UserRound,
  Wrench,
} from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { Loading } from "../components/UI";
import { authDestination } from "./Auth";
import { ProviderRegister } from "./ProviderRegister";
import { ContactVerification } from "../components/ContactVerification";
import "./Login.css";
import "./CustomerRegister.css";

// Keep customer onboarding and professional applications on their dedicated routes.
export function Registration() {
  const [params] = useSearchParams();
  return params.get("role") === "provider" ? (
    <ProviderRegister />
  ) : (
    <CustomerRegister />
  );
}

const passwordRules = [
  {
    label: "8–72 characters",
    test: (value) => value.length >= 8 && value.length <= 72,
  },
  {
    label: "Upper & lowercase",
    test: (value) => /[A-Z]/.test(value) && /[a-z]/.test(value),
  },
  { label: "At least one number", test: (value) => /\d/.test(value) },
];

export function CustomerRegister({ invitation = null }) {
  const { user, loading, setUser, config } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: invitation?.name || "",
    city: canonicalCity(invitation?.city) || "",
    email: "",
    mobile: "",
    password: "",
    terms: false,
    appleRelayConsent: false,
  });
  const [identity, setIdentity] = useState(null);
  const [checkingIdentity, setCheckingIdentity] = useState(true);
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const fields = useRef({});
  const errorRef = useRef(null);
  const requestLock = useRef(false);

  useEffect(() => {
    document.title = "Create your account | GharSeva";
    return () => {
      document.title = "GharSeva — A little help. A happier home.";
    };
  }, []);
  useEffect(() => {
    if (serverError) errorRef.current?.focus();
  }, [serverError]);

  const verified = async (proof) => {
    if (invitation) {
      try {
        proof = await api("/invitations/proof", {
          method: "POST",
          body: { token: invitation.token },
        });
      } catch (e) {
        setServerError(e.message);
        return;
      }
    }
    if (proof.role) {
      setUser(proof);
      navigate(authDestination(proof, location.state?.from), { replace: true });
      return;
    }
    setIdentity(proof);
    setForm((current) => ({
      ...current,
      [proof.channel]: proof.contact,
      name: current.name || proof.name || "",
    }));
  };
  useEffect(() => {
    let active = true;
    api("/auth/registration-session")
      .then((proof) => {
        if (active && proof) verified(proof);
      })
      .catch((error) => {
        if (active) setServerError(error.message);
      })
      .finally(() => {
        if (active) setCheckingIdentity(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const resetIdentity = async () => {
    try {
      await api("/auth/registration-session", { method: "DELETE" });
      setIdentity(null);
      setErrors({});
    } catch (error) {
      setServerError(error.message);
    }
  };
  const change = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setServerError("");
  };
  if (loading) return <Loading />;
  if (user)
    return (
      <Navigate to={authDestination(user, location.state?.from)} replace />
    );

  const submit = async (event) => {
    event.preventDefault();
    if (requestLock.current) return;
    if (!identity) {
      setServerError("Verify your email or mobile number first.");
      return;
    }
    const nextErrors = {};
    const digits = form.mobile.replace(/\D/g, "");
    const mobile =
      digits.length === 12 && digits.startsWith("91")
        ? digits.slice(2)
        : digits;
    if (form.name.trim().length < 3)
      nextErrors.name = "Enter your full name (at least 3 characters).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      nextErrors.email = "Enter a valid email address.";
    if (!/^[6-9]\d{9}$/.test(mobile))
      nextErrors.mobile = "Enter a 10-digit Indian mobile number.";
    if (
      !passwordRules.every((rule) => rule.test(form.password)) ||
      /[\r\n]/.test(form.password)
    )
      nextErrors.password =
        "Use 8–72 characters, uppercase, lowercase and a number.";
    else if (new TextEncoder().encode(form.password).length > 72)
      nextErrors.password = "Use a shorter password (up to 72 bytes).";
    if (
      identity?.provider === "apple.com" &&
      /@(?:privaterelay\.appleid\.com|private\.icloud\.com)$/.test(
        identity.contact,
      ) &&
      !form.appleRelayConsent
    )
      nextErrors.terms =
        "Please allow association of your Apple relay identity with these contact details.";
    if (!canonicalCity(form.city))
      nextErrors.city = "Choose your service city.";
    if (!form.terms)
      nextErrors.terms =
        "Please agree to the terms and privacy policy to continue.";
    setErrors(nextErrors);
    setServerError("");
    const first = Object.keys(nextErrors)[0];
    if (first) {
      fields.current[first]?.focus();
      return;
    }
    requestLock.current = true;
    setBusy(true);
    try {
      const account = await api("/auth/register", {
        method: "POST",
        body: {
          name: form.name.trim(),
          city: form.city,
          email: form.email.trim().toLowerCase(),
          mobile,
          password: form.password,
          terms: true,
          role: "customer",
          verifiedRegistration: true,
          ...(invitation ? { invitationToken: invitation.token } : {}),
          appleRelayConsent: form.appleRelayConsent,
        },
      });
      setUser(account);
      navigate(authDestination(account, location.state?.from), {
        replace: true,
      });
    } catch (error) {
      setServerError(error.message);
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  };

  const inputProps = (key) => ({
    id: `gs-register-${key}`,
    ref: (element) => {
      fields.current[key] = element;
    },
    value: form[key],
    onChange: (event) => change(key, event.target.value),
    disabled: busy,
    required: true,
    readOnly: identity?.channel === key,
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby":
      [
        errors[key] && `gs-register-${key}-error`,
        key === "mobile" && "gs-register-mobile-hint",
        key === "password" && "gs-register-password-rules",
        key === "password" && capsLock && "gs-register-caps",
      ]
        .filter(Boolean)
        .join(" ") || undefined,
  });
  const fieldError = (key) =>
    errors[key] && (
      <span
        id={`gs-register-${key}-error`}
        className="gs-signin__field-error"
        role="alert"
      >
        {errors[key]}
      </span>
    );

  return (
    <div className="gs-signin gs-register">
      <div className="gs-signin__layout">
        <div className="gs-signin__topline">
          <Link to="/" className="gs-signin__back">
            <ArrowLeft size={15} aria-hidden="true" /> Back to home
          </Link>
          <span>A little help. A happier home.</span>
        </div>
        <section
          className="gs-signin__content"
          aria-label="Create a GharSeva customer account"
        >
          <div className="gs-signin__story">
            <div className="gs-signin__eyebrow">
              <span /> MORE TIME FOR WHAT MATTERS
            </div>
            <h2>
              Your home deserves
              <br />
              <span>a little help.</span>
            </h2>
            <p className="gs-signin__intro">
              A dripping tap. A busy week. A home that needs a fresh start. Find
              a professional and make everyday life a little easier.
            </p>
            <div className="gs-signin__photo">
              <img
                src="/images/home.jpg"
                alt="A peaceful modern home surrounded by a green garden"
                width="1400"
                height="933"
                fetchPriority="high"
              />
              <div className="gs-signin__photo-label">
                <span className="gs-signin__photo-icon">
                  <Heart size={17} aria-hidden="true" />
                </span>
                <div>
                  <strong>A happier home starts here.</strong>
                  <span>Good help, whenever life needs it.</span>
                </div>
              </div>
            </div>
            <ol className="gs-register__steps" aria-label="How GharSeva works">
              <li>
                <span>
                  <Wrench size={17} aria-hidden="true" />
                </span>
                <div>
                  <strong>Find your help</strong>
                  <p>Explore services and professional profiles.</p>
                </div>
              </li>
              <li>
                <span>
                  <CalendarCheck2 size={17} aria-hidden="true" />
                </span>
                <div>
                  <strong>Make it fit your day</strong>
                  <p>Choose an available time that works for you.</p>
                </div>
              </li>
              <li>
                <span>
                  <House size={17} aria-hidden="true" />
                </span>
                <div>
                  <strong>Keep everything together</strong>
                  <p>Follow your bookings from your dashboard.</p>
                </div>
              </li>
            </ol>
          </div>

          <div className="gs-signin__card">
            <div className="gs-signin__card-heading">
              <span className="gs-signin__welcome-icon">
                <UserRound size={21} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="gs-signin__card-caption">
                YOUR EVERYDAY, MADE EASIER
              </span>
            </div>
            <h1>
              {invitation
                ? "Your invitation. Your account."
                : "Make yourself at home."}
            </h1>
            <p className="gs-signin__subtitle">
              Create your customer account. A little less on your to-do list
              starts here.
            </p>

            {invitation && (
              <p className="gs-register__verified-note">
                Customer invitation for {invitation.maskedContact}. Verify that
                exact{" "}
                {invitation.channel === "email"
                  ? "email address"
                  : "mobile number"}
                ; you choose your own password.
              </p>
            )}
            {serverError && !identity && (
              <div className="gs-signin__error" role="alert">
                {serverError}
              </div>
            )}
            {checkingIdentity ? (
              <p role="status" className="gs-register__verified-note">
                Checking your registration session…
              </p>
            ) : (
              <ContactVerification
                purpose="register"
                portal="customer"
                fixedChannel={invitation?.channel}
                showSocial={!invitation}
                identity={identity}
                onVerified={verified}
                onReset={resetIdentity}
              />
            )}
            {!identity && (
              <p className="gs-register__verified-note">
                First, verify one contact. Then add your name, contact details
                and password. Your details are saved only when you create your
                account.
              </p>
            )}
            {identity && (
              <form onSubmit={submit} noValidate aria-busy={busy}>
                {serverError && (
                  <div
                    className="gs-signin__error"
                    role="alert"
                    tabIndex={-1}
                    ref={errorRef}
                  >
                    <CircleAlert size={18} aria-hidden="true" />
                    <span>{serverError}</span>
                  </div>
                )}
                <div className="gs-signin__field">
                  <label htmlFor="gs-register-name">Full name</label>
                  <div className="gs-signin__input-wrap">
                    <UserRound size={18} aria-hidden="true" />
                    <input
                      {...inputProps("name")}
                      name="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Your full name"
                      minLength={3}
                      maxLength={80}
                    />
                  </div>
                  {fieldError("name")}
                </div>
                <div className="gs-signin__field">
                  <label htmlFor="gs-register-email">Email address</label>
                  <div className="gs-signin__input-wrap">
                    <Mail size={18} aria-hidden="true" />
                    <input
                      {...inputProps("email")}
                      name="email"
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="you@example.com"
                      maxLength={120}
                    />
                  </div>
                  {fieldError("email")}
                </div>
                <div className="gs-signin__field">
                  <label htmlFor="gs-register-mobile">Mobile number</label>
                  <div className="gs-signin__input-wrap gs-register__phone">
                    <span aria-hidden="true">+91</span>
                    <input
                      {...inputProps("mobile")}
                      name="tel"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="10-digit mobile number"
                      maxLength={20}
                    />
                  </div>
                  <span
                    className="gs-register__hint"
                    id="gs-register-mobile-hint"
                  >
                    You can sign in with your email or mobile number.
                  </span>
                  {fieldError("mobile")}
                </div>
                <div className="gs-signin__field gs-register__password-field">
                  <label htmlFor="gs-register-password">
                    Create a password
                  </label>
                  <div className="gs-signin__input-wrap">
                    <LockKeyhole size={18} aria-hidden="true" />
                    <input
                      {...inputProps("password")}
                      name="password"
                      type={visible ? "text" : "password"}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Choose a strong password"
                      minLength={8}
                      maxLength={72}
                      onKeyUp={(event) =>
                        setCapsLock(event.getModifierState("CapsLock"))
                      }
                      onKeyDown={(event) =>
                        setCapsLock(event.getModifierState("CapsLock"))
                      }
                      onBlur={() => setCapsLock(false)}
                    />
                    <button
                      className="gs-signin__visibility"
                      type="button"
                      onClick={() => setVisible((current) => !current)}
                      aria-label={visible ? "Hide password" : "Show password"}
                      aria-controls="gs-register-password"
                      aria-pressed={visible}
                      disabled={busy}
                    >
                      {visible ? (
                        <EyeOff size={18} aria-hidden="true" />
                      ) : (
                        <Eye size={18} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  <ul
                    className="gs-register__rules"
                    id="gs-register-password-rules"
                    aria-label="Password requirements"
                  >
                    {passwordRules.map((rule) => (
                      <li
                        key={rule.label}
                        className={rule.test(form.password) ? "is-met" : ""}
                      >
                        <Check size={12} aria-hidden="true" />
                        {rule.label}
                        {rule.test(form.password) && (
                          <span className="sr-only"> — met</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {capsLock && (
                    <span
                      id="gs-register-caps"
                      className="gs-signin__caps"
                      role="status"
                    >
                      Caps Lock is on.
                    </span>
                  )}
                  {fieldError("password")}
                </div>
                {identity.provider === "apple.com" &&
                  /@(?:privaterelay\.appleid\.com|private\.icloud\.com)$/.test(
                    identity.contact,
                  ) && (
                    <div className="gs-register__consent">
                      <div>
                        <input
                          id="gs-apple-consent"
                          type="checkbox"
                          checked={form.appleRelayConsent}
                          onChange={(e) =>
                            change("appleRelayConsent", e.target.checked)
                          }
                        />
                        <label htmlFor="gs-apple-consent">
                          I agree to associate my Apple private relay identity
                          with the name and mobile details I provide for
                          GharSeva.
                        </label>
                      </div>
                    </div>
                  )}
                <div className="gs-register__consent">
                  <div>
                    <input
                      id="gs-register-terms"
                      name="terms"
                      type="checkbox"
                      ref={(element) => {
                        fields.current.terms = element;
                      }}
                      checked={form.terms}
                      onChange={(event) =>
                        change("terms", event.target.checked)
                      }
                      required
                      disabled={busy}
                      aria-invalid={Boolean(errors.terms)}
                      aria-describedby={
                        errors.terms ? "gs-register-terms-error" : undefined
                      }
                    />
                    <label htmlFor="gs-register-terms">
                      I agree to GharSeva’s{" "}
                      <Link
                        to="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Terms of service
                        <span className="sr-only"> (opens in a new tab)</span>
                      </Link>{" "}
                      and{" "}
                      <Link
                        to="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Privacy policy
                        <span className="sr-only"> (opens in a new tab)</span>
                      </Link>
                      .
                    </label>
                  </div>
                  {fieldError("terms")}
                </div>
                <div className="gs-signin__field">
                  <label htmlFor="gs-register-city">Service city</label>
                  <select {...inputProps("city")}>
                    <option value="">Select your city</option>
                    {supportedCities.map((city) => (
                      <option key={city}>{city}</option>
                    ))}
                  </select>
                  {fieldError("city")}
                </div>
                <button
                  className="gs-signin__submit"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? (
                    <>
                      <LoaderCircle
                        size={18}
                        className="gs-signin__spinner"
                        aria-hidden="true"
                      />{" "}
                      Creating your account…
                    </>
                  ) : (
                    <>
                      Create my account
                      <ArrowRight size={18} aria-hidden="true" />
                    </>
                  )}
                </button>
                <p className="gs-register__after-submit">
                  Add your service address when you book.
                </p>
              </form>
            )}
            <div className="gs-signin__join">
              Already feel at home?{" "}
              <Link to="/login" state={{ from: location.state?.from }}>
                Sign in <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            {config.providerRegistration && (
              <Link
                className="gs-signin__professional"
                to="/register?role=provider"
              >
                <span className="gs-signin__professional-icon">
                  <Wrench size={18} aria-hidden="true" />
                </span>
                <span>
                  <strong>Here to offer your skills?</strong>
                  <small>Apply as a service professional</small>
                </span>
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            )}
          </div>
        </section>
        <footer className="gs-signin__footer">
          <span>© {new Date().getFullYear()} GharSeva</span>
          <nav aria-label="Registration page links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/contact">Support</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
