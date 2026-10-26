import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../context";
import { api } from "../api";
import { Loading } from "../components/UI";
import { ContactVerification } from "../components/ContactVerification";
import "./Login.css";
export function PasswordRecovery() {
  const { user, loading } = useApp();
  const [params] = useSearchParams();
  const portal = ["customer", "provider"].includes(params.get("role"))
    ? params.get("role")
    : undefined;
  const loginHref = "/login";
  const [proof, setProof] = useState(null),
    [checking, setChecking] = useState(true),
    [values, setValues] = useState({ password: "", confirm: "" }),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [complete, setComplete] = useState(false);
  const lock = useRef(false),
    passwordRef = useRef(null),
    errorRef = useRef(null);
  useEffect(() => {
    document.title = "Reset your password | GharSeva";
    let active = true;
    api("/auth/password/recovery")
      .then((p) => {
        if (active) setProof(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      document.title = "GharSeva — A little help. A happier home.";
    };
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const reset = async (event) => {
    event.preventDefault();
    if (lock.current) return;
    if (
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/.test(values.password) ||
      new TextEncoder().encode(values.password).length > 72
    ) {
      setError("Use 8–72 characters with uppercase, lowercase and a number.");
      passwordRef.current?.focus();
      return;
    }
    if (values.password !== values.confirm) {
      setError("Your passwords do not match. Please enter them again.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/auth/password/reset", {
        method: "POST",
        body: { newPassword: values.password, confirmPassword: values.confirm },
      });
      setValues({ password: "", confirm: "" });
      setProof(null);
      setComplete(true);
    } catch (e) {
      setError(e.message);
      if (e.status === 401) setProof(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (loading) return <Loading />;
  if (user) return <Navigate to={`/dashboard/${user.role}`} replace />;
  return (
    <div className="gs-signin gs-recovery">
      <div className="gs-signin__layout">
        <div className="gs-signin__topline">
          <Link to={loginHref} className="gs-signin__back">
            <ArrowLeft size={15} />
            Back to sign in
          </Link>
          <span>A little help. A happier home.</span>
        </div>
        <section className="gs-signin__content" aria-label="Password recovery">
          <div className="gs-signin__story">
            <div className="gs-signin__eyebrow">
              <span /> LET’S GET YOU BACK IN
            </div>
            <h2>
              A fresh password.
              <br />
              <span>A familiar welcome.</span>
            </h2>
            <p className="gs-signin__intro">
              Verify a contact you previously confirmed in your account, choose
              a new password and return to the things that matter.
            </p>
            <div className="gs-signin__photo">
              <img
                src="/images/home.jpg"
                alt="A welcoming home with a peaceful garden"
                width="1400"
                height="933"
              />
              <div className="gs-signin__photo-label">
                <span className="gs-signin__photo-icon">
                  <ShieldCheck size={17} />
                </span>
                <div>
                  <strong>Your account, in your hands.</strong>
                  <span>A code for you. A password only you know.</span>
                </div>
              </div>
            </div>
          </div>
          <div className="gs-signin__card">
            <div className="gs-signin__card-heading">
              <span className="gs-signin__welcome-icon">
                <KeyRound size={21} />
              </span>
              <span className="gs-signin__card-caption">
                {portal === "provider" ? "PROFESSIONAL" : "CUSTOMER"} ACCOUNT
                RECOVERY
              </span>
            </div>
            <h1>
              {complete
                ? "You’re ready to return."
                : proof
                  ? "Choose a new password."
                  : "Forgot your password?"}
            </h1>
            <p className="gs-signin__subtitle">
              {complete
                ? "Your password has been changed."
                : proof
                  ? "Use a strong password you haven’t used elsewhere."
                  : "We’ll help you get back to your GharSeva account."}
            </p>
            {error && (
              <div
                className="gs-signin__error"
                role="alert"
                tabIndex={-1}
                ref={errorRef}
              >
                {error}
              </div>
            )}
            {checking ? (
              <p role="status">Checking your recovery session…</p>
            ) : complete ? (
              <div className="gs-recovery__done">
                <CheckCircle2 size={40} />
                <h2>Password updated.</h2>
                <p>
                  Previous GharSeva sessions have ended. Sign in with your new
                  password.
                </p>
                <Link to={loginHref} className="gs-signin__submit">
                  Back to sign in
                  <ArrowRight size={17} />
                </Link>
              </div>
            ) : proof ? (
              <>
                <div className="gs-verify__confirmed">
                  <ShieldCheck size={21} />
                  <div>
                    <strong>
                      {proof.mode === "demo"
                        ? "Classroom recovery proof confirmed"
                        : "Recovery contact confirmed"}
                    </strong>
                    <span>Choose your new password within 10 minutes.</span>
                  </div>
                </div>
                <form onSubmit={reset} noValidate aria-busy={busy}>
                  {[
                    ["password", "New password"],
                    ["confirm", "Confirm new password"],
                  ].map(([key, label]) => (
                    <div className="gs-signin__field" key={key}>
                      <label htmlFor={`gs-reset-${key}`}>{label}</label>
                      <div className="gs-signin__input-wrap">
                        <LockKeyhole size={18} />
                        <input
                          id={`gs-reset-${key}`}
                          ref={key === "password" ? passwordRef : undefined}
                          type={visible ? "text" : "password"}
                          name={
                            key === "password"
                              ? "new-password"
                              : "confirm-password"
                          }
                          autoComplete="new-password"
                          value={values[key]}
                          onChange={(e) => {
                            setValues((v) => ({ ...v, [key]: e.target.value }));
                            setError("");
                          }}
                          minLength={8}
                          maxLength={72}
                          disabled={busy}
                          required
                          aria-describedby="gs-reset-rules"
                        />
                        {key === "password" && (
                          <button
                            className="gs-signin__visibility"
                            type="button"
                            aria-label={
                              visible ? "Hide passwords" : "Show passwords"
                            }
                            aria-pressed={visible}
                            disabled={busy}
                            onClick={() => setVisible((v) => !v)}
                          >
                            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <p id="gs-reset-rules" className="gs-recovery__notice">
                    8–72 characters with uppercase, lowercase and a number. Your
                    browser or password manager can suggest a password.
                  </p>
                  <button
                    className="gs-signin__submit"
                    type="submit"
                    disabled={busy}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle
                          size={17}
                          className="gs-signin__spinner"
                        />
                        Updating password…
                      </>
                    ) : (
                      <>
                        Update my password
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>
                <button
                  type="button"
                  className="gs-signin__code-toggle"
                  style={{ marginTop: 16 }}
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await api("/auth/password/recovery", {
                        method: "DELETE",
                      });
                      setProof(null);
                      setValues({ password: "", confirm: "" });
                      setError("");
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Verify a contact again
                </button>
              </>
            ) : (
              <>
                <p className="gs-recovery__notice">
                  Use an email or mobile number previously verified in your
                  account. Requests show the same message whether or not the
                  contact is eligible.
                </p>
                <ContactVerification
                  key={portal}
                  purpose="recover"
                  portal={portal}
                  showSocial={false}
                  onVerified={setProof}
                />
                <p className="gs-recovery__notice">
                  If you never verified a contact, cannot receive a code or need
                  help with an administrator account,{" "}
                  <Link to="/contact">contact support</Link>. You can also
                  return to Google or Apple sign-in if you previously linked it.
                </p>
              </>
            )}
          </div>
        </section>
        <footer className="gs-signin__footer">
          <span>© {new Date().getFullYear()} GharSeva</span>
          <nav aria-label="Recovery page links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/contact">Support</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
