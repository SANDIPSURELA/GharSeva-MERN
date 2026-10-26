import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { Loading } from "../components/UI";
import {
  authDestination,
  loginAliasState,
} from "../../../shared/auth-navigation.js";
import "./Login.css";
import { LoginCode } from "../components/LoginCode";
import { SocialSignIn } from "../components/ContactVerification";

export function LoginAlias() {
  const location = useLocation();
  return (
    <Navigate to="/login" state={loginAliasState(location.state)} replace />
  );
}
export function Login() {
  const { user, loading, setUser, config } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [capsLock, setCapsLock] = useState(false);
  const [pending, setPending] = useState(null);
  const pendingRef = useRef(false);
  useEffect(
    () => () => {
      if (pendingRef.current)
        api("/auth/login/pending", { method: "DELETE" }).catch(() => {});
    },
    [],
  );
  const identifierRef = useRef(null);
  const passwordRef = useRef(null);
  const errorRef = useRef(null);
  const requestLock = useRef(false);

  useEffect(() => {
    document.title = "Welcome back | GharSeva";
    return () => {
      document.title = "GharSeva — A little help. A happier home.";
    };
  }, []);

  useEffect(() => {
    if (serverError) errorRef.current?.focus();
  }, [serverError]);

  if (loading) return <Loading />;
  if (user)
    return (
      <Navigate to={authDestination(user, location.state?.from)} replace />
    );

  const submit = async (event) => {
    event.preventDefault();
    if (requestLock.current) return;
    const nextErrors = {};
    if (!identifier.trim())
      nextErrors.identifier = "Enter your email or mobile number.";
    else if (identifier.trim().length > 120)
      nextErrors.identifier = "Use up to 120 characters.";
    if (!password) nextErrors.password = "Enter your password.";
    setErrors(nextErrors);
    setServerError("");
    if (Object.keys(nextErrors).length) {
      (nextErrors.identifier ? identifierRef : passwordRef).current?.focus();
      return;
    }

    requestLock.current = true;
    setBusy(true);
    try {
      let accountIdentifier = identifier.trim();
      if (!accountIdentifier.includes("@")) {
        const digits = accountIdentifier.replace(/\D/g, "");
        accountIdentifier =
          digits.length === 12 && digits.startsWith("91")
            ? digits.slice(2)
            : digits;
      }
      const challenge = await api("/auth/login", {
        method: "POST",
        body: {
          identifier: accountIdentifier,
          password,
        },
      });
      if (
        challenge.pending !== true ||
        typeof challenge.destination !== "string"
      ) {
        // A stale API must not turn an old password-only response into a fake OTP step.
        await api("/auth/logout", { method: "POST" }).catch(() => {});
        throw new Error(
          "Sign-in could not start. Please reload and try again, or contact support.",
        );
      }
      setPending(challenge);
      pendingRef.current = true;
      setPassword("");
      setVisible(false);
    } catch (error) {
      setServerError(
        error.message === "Choose a valid sign-in page."
          ? "The API is still running the older login rules. Restart your existing API to load shared sign-in, then try again."
          : error.message,
      );
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="gs-signin">
      <div className="gs-signin__layout">
        <div className="gs-signin__topline">
          <Link to="/" className="gs-signin__back">
            <ArrowLeft size={15} aria-hidden="true" /> Back to home
          </Link>
          <span>A little help. A happier home.</span>
        </div>

        <section className="gs-signin__content" aria-label="GharSeva sign in">
          <div className="gs-signin__story">
            <div className="gs-signin__eyebrow">
              <span /> YOUR GHARSEVA ACCOUNT
            </div>
            <h2>
              A little less to do.
              <br />
              <span>A lot more to enjoy.</span>
            </h2>
            <p className="gs-signin__intro">
              Find help, manage your work and keep your GharSeva day together.
            </p>
            <div className="gs-signin__photo">
              <img
                src="/images/home.jpg"
                alt="A welcoming home with a garden and warmly lit living spaces"
                width="1400"
                height="933"
                fetchPriority="high"
              />
              <div className="gs-signin__photo-label">
                <span className="gs-signin__photo-icon">
                  <Check size={17} aria-hidden="true" />
                </span>
                <div>
                  <strong>Your day. In good hands.</strong>
                  <span>A little help, all in one place.</span>
                </div>
              </div>
            </div>
            <div className="gs-signin__benefits">
              <span>
                <CalendarCheck2 size={17} aria-hidden="true" /> Manage your
                appointments
              </span>
              <span>
                <ShieldCheck size={17} aria-hidden="true" /> Visit-start OTP
              </span>
            </div>
          </div>

          <div className="gs-signin__card">
            <div className="gs-signin__card-heading">
              <span className="gs-signin__welcome-icon">
                <KeyRound size={21} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="gs-signin__card-caption">ACCOUNT SIGN IN</span>
            </div>
            <h1>Welcome back.</h1>
            <p className="gs-signin__subtitle">
              Sign in to your GharSeva account.
            </p>

            {!pending && (
              <>
                <SocialSignIn
                  disabled={busy}
                  onBusyChange={setBusy}
                  onOnboarding={() =>
                    navigate("/register", {
                      state: { from: location.state?.from },
                    })
                  }
                  onVerified={(account) => {
                    setUser(account);
                    navigate(authDestination(account, location.state?.from), {
                      replace: true,
                    });
                  }}
                />
                <div className="gs-verify__divider">
                  <span>or continue with your password</span>
                </div>
              </>
            )}
            {pending ? (
              <LoginCode
                challenge={pending}
                onBack={async () => {
                  await api("/auth/login/pending", { method: "DELETE" });
                  pendingRef.current = false;
                  setPending(null);
                  setServerError("");
                  setTimeout(() => identifierRef.current?.focus(), 0);
                }}
                onVerified={(account) => {
                  pendingRef.current = false;
                  setUser(account);
                  navigate(authDestination(account, location.state?.from), {
                    replace: true,
                  });
                }}
              />
            ) : (
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
                  <label htmlFor="gs-login-identifier">
                    Email or mobile number
                  </label>
                  <div className="gs-signin__input-wrap">
                    <Mail size={18} aria-hidden="true" />
                    <input
                      id="gs-login-identifier"
                      name="username"
                      ref={identifierRef}
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Email or mobile number"
                      value={identifier}
                      disabled={busy}
                      required
                      maxLength={120}
                      aria-invalid={Boolean(errors.identifier)}
                      aria-describedby={
                        errors.identifier
                          ? "gs-login-identifier-error"
                          : undefined
                      }
                      onChange={(event) => {
                        setIdentifier(event.target.value);
                        setErrors((current) => ({
                          ...current,
                          identifier: "",
                        }));
                        setServerError("");
                      }}
                    />
                  </div>
                  {errors.identifier && (
                    <span
                      id="gs-login-identifier-error"
                      className="gs-signin__field-error"
                      role="alert"
                    >
                      {errors.identifier}
                    </span>
                  )}
                </div>

                <div className="gs-signin__field gs-signin__field--password">
                  <div className="gs-signin__label-row">
                    <label htmlFor="gs-login-password">Password</label>
                    <Link
                      className="gs-signin__help-toggle"
                      to="/forgot-password"
                      state={{ from: location.state?.from }}
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="gs-signin__input-wrap">
                    <LockKeyhole size={18} aria-hidden="true" />
                    <input
                      id="gs-login-password"
                      name="password"
                      ref={passwordRef}
                      type={visible ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      disabled={busy}
                      required
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={
                        [
                          errors.password && "gs-login-password-error",
                          capsLock && "gs-login-caps-lock",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      onKeyDown={(event) =>
                        setCapsLock(
                          Boolean(event.getModifierState?.("CapsLock")),
                        )
                      }
                      onKeyUp={(event) =>
                        setCapsLock(
                          Boolean(event.getModifierState?.("CapsLock")),
                        )
                      }
                      onBlur={() => setCapsLock(false)}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setErrors((current) => ({ ...current, password: "" }));
                        setServerError("");
                      }}
                    />
                    <button
                      className="gs-signin__visibility"
                      type="button"
                      disabled={busy}
                      aria-label={visible ? "Hide password" : "Show password"}
                      aria-pressed={visible}
                      onClick={() => setVisible((current) => !current)}
                    >
                      {visible ? (
                        <EyeOff size={18} aria-hidden="true" />
                      ) : (
                        <Eye size={18} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <span
                      id="gs-login-password-error"
                      className="gs-signin__field-error"
                      role="alert"
                    >
                      {errors.password}
                    </span>
                  )}
                  {capsLock && (
                    <span
                      id="gs-login-caps-lock"
                      className="gs-signin__caps"
                      role="status"
                    >
                      Caps Lock is on.
                    </span>
                  )}
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
                      Checking your details…
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight size={18} aria-hidden="true" />
                    </>
                  )}
                </button>
                <p className="gs-signin__secure">
                  <ShieldCheck size={14} aria-hidden="true" /> Your password
                  stays private. Next, verify a code sent to your registered
                  email.
                </p>
              </form>
            )}

            <div className="gs-signin__join">
              New to GharSeva?{" "}
              <Link to="/register" state={{ from: location.state?.from }}>
                Create an account <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            {config.providerRegistration && (
              <Link
                className="gs-signin__professional"
                to="/register?role=provider"
                state={{ from: location.state?.from }}
              >
                <span className="gs-signin__professional-icon">
                  <Wrench size={18} aria-hidden="true" />
                </span>
                <span>
                  <strong>Good at what you do?</strong>
                  <small>Join us as a service professional</small>
                </span>
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            )}
          </div>
        </section>

        <footer className="gs-signin__footer">
          <span>© {new Date().getFullYear()} GharSeva</span>
          <nav aria-label="Sign-in page links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/contact">Support</Link>
            <Link to="/admin/login">Admin shortcut</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
