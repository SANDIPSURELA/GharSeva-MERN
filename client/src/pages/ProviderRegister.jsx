import { supportedCities } from "../../../shared/cities.js";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Save,
  ShieldCheck,
  Wrench,
  LoaderCircle,
} from "lucide-react";
import { useApp } from "../context";
import { api } from "../api";
import { Loading } from "../components/UI";
import { ContactVerification } from "../components/ContactVerification";
import "./Login.css";
import "./ProviderRegister.css";
const steps = ["Your details", "Your services", "Documents", "Review"];
const initial = {
  name: "",
  email: "",
  mobile: "",
  city: "",
  categories: [],
  area: "",
  bio: "",
  experience: "0",
  price: "299",
  password: "",
  appleRelayConsent: false,
};
export function ProviderRegister({ invitation = null }) {
  const { user, loading, setUser, categories, config } = useApp();
  const navigate = useNavigate();
  const [identity, setIdentity] = useState(null),
    [checking, setChecking] = useState(true),
    [form, setForm] = useState(initial),
    [step, setStep] = useState(1),
    [saveConsent, setSaveConsent] = useState(false),
    [followUp, setFollowUp] = useState(false),
    [documentFile, setDocumentFile] = useState(null),
    [terms, setTerms] = useState(false),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saveStatus, setSaveStatus] = useState(""),
    [draftReady, setDraftReady] = useState(false),
    [saveTick, setSaveTick] = useState(0);
  const revision = useRef(0),
    saving = useRef(null),
    queued = useRef(false),
    submitting = useRef(false),
    conflict = useRef(false),
    heading = useRef(null),
    errorRef = useRef(null);
  useEffect(() => {
    document.title = "Apply as a professional | GharSeva";
    return () => {
      document.title = "GharSeva — A little help. A happier home.";
    };
  }, []);
  useEffect(() => {
    let active = true;
    api("/auth/registration-session")
      .then((proof) => {
        if (active && proof) {
          if (invitation)
            return api("/invitations/proof", {
              method: "POST",
              body: { token: invitation.token },
            }).then((p) => {
              if (active) setIdentity(p);
            });
          setIdentity(proof);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!identity) return;
    let active = true;
    setDraftReady(false);
    revision.current = 0;
    conflict.current = false;
    setForm({
      ...initial,
      city: invitation?.city || initial.city,
      [identity.channel]: identity.contact,
      name: identity.name || invitation?.name || "",
    });
    api("/registration/application")
      .then((a) => {
        if (!active) return;
        if (a) {
          setForm({
            ...initial,
            ...a.data,
            [identity.channel]: identity.contact,
            password: "",
          });
          setStep(Math.min(3, a.step || 1));
          setSaveConsent(a.saveConsent);
          setFollowUp(a.followUpConsent);
          revision.current = a.revision;
          setSaveStatus(
            "Saved application restored. Re-enter a password and select your document before submitting.",
          );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
  }, [identity]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (identity && draftReady) heading.current?.focus();
  }, [step]);
  const payload = () => {
    const { password, ...data } = form;
    return {
      data,
      step,
      revision: revision.current,
      saveConsent: true,
      followUpConsent: followUp,
    };
  };
  const saveDraft = async () => {
    if (saving.current) {
      queued.current = true;
      return saving.current;
    }
    if (!saveConsent || !draftReady || conflict.current || submitting.current)
      return;
    setSaveStatus("Saving your progress…");
    const task = api("/registration/application", {
      method: "PUT",
      body: payload(),
    });
    saving.current = task;
    try {
      const saved = await task;
      revision.current = saved.revision;
      setSaveStatus(
        "Progress saved. Passwords and selected files are never saved in a draft.",
      );
    } catch (e) {
      if (e.status === 409) conflict.current = true;
      setSaveStatus(`Not saved: ${e.message}`);
    } finally {
      saving.current = null;
      if (queued.current) {
        queued.current = false;
        setSaveTick((t) => t + 1);
      }
    }
  };
  useEffect(() => {
    if (!saveConsent || !draftReady || busy || conflict.current) return;
    const t = setTimeout(saveDraft, 1100);
    return () => clearTimeout(t);
  }, [form, step, saveConsent, followUp, draftReady, saveTick, busy]);
  const change = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError("");
  };
  const stopSaving = async () => {
    setSaveConsent(false);
    queued.current = false;
    try {
      await saving.current?.catch(() => {});
      await api("/registration/application", { method: "DELETE" });
      revision.current = 0;
      conflict.current = false;
      setSaveStatus(
        "Saved draft deleted. Your current entries remain on this page only.",
      );
    } catch (e) {
      setError(e.message);
    }
  };
  const reset = async () => {
    try {
      await saving.current?.catch(() => {});
      await api("/auth/registration-session", { method: "DELETE" });
      setIdentity(null);
      setForm(initial);
      setSaveConsent(false);
      setFollowUp(false);
      setStep(1);
      setDraftReady(false);
      setSaveStatus("");
      setError("");
      setDocumentFile(null);
      setTerms(false);
    } catch (e) {
      setError(e.message);
    }
  };
  const validateStep = (number) => {
    if (number === 1) {
      if (form.name.trim().length < 3)
        return "Enter your full name (at least 3 characters).";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
        return "Enter a valid email address.";
      if (!/^[6-9]\d{9}$/.test(form.mobile.replace(/\D/g, "")))
        return "Enter a 10-digit Indian mobile number.";
      if (form.city.trim().length < 2)
        return "Enter the city where you offer services.";
      if (
        !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/.test(form.password) ||
        new TextEncoder().encode(form.password).length > 72
      )
        return "Choose an 8–72 character password with uppercase, lowercase and a number.";
    }
    if (number === 2) {
      if (!form.categories.length)
        return "Choose at least one service category.";
      if (form.area.trim().length < 3) return "Enter your service area.";
      if (form.bio.trim().length < 30)
        return "Describe your work in at least 30 characters.";
      if (
        !Number.isFinite(Number(form.price)) ||
        Number(form.price) < 100 ||
        Number(form.price) > 50000
      )
        return "Enter a starting visit price from ₹100 to ₹50,000.";
      if (
        !Number.isFinite(Number(form.experience)) ||
        Number(form.experience) < 0 ||
        Number(form.experience) > 50
      )
        return "Enter experience from 0 to 50 years.";
    }
    if (number === 3) {
      if (!documentFile)
        return "Choose a supporting PDF or image for administrator review.";
      if (
        identity.provider === "apple.com" &&
        /@(?:privaterelay\.appleid\.com|private\.icloud\.com)$/.test(
          identity.contact,
        ) &&
        !form.appleRelayConsent
      )
        return "Please allow association of your Apple relay identity with these contact details.";
      if (!terms) return "Please agree to the terms and privacy policy.";
    }
    return "";
  };
  const next = () => {
    const problem = validateStep(step);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setStep((s) => s + 1);
  };
  const submit = async () => {
    if (submitting.current) return;
    for (let s = 1; s <= 3; s++) {
      const problem = validateStep(s);
      if (problem) {
        setStep(s);
        setError(problem);
        return;
      }
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await saving.current?.catch(() => {});
      const data = new FormData();
      data.append(
        "data",
        JSON.stringify({
          ...form,
          role: "provider",
          terms: true,
          category: form.categories[0],
          skills: ["General service"],
          verifiedRegistration: true,
          identityWorkflow: true,
          ...(invitation ? { invitationToken: invitation.token } : {}),
          followUpConsent: followUp,
        }),
      );
      data.append("document", documentFile);
      const account = await api("/auth/register", {
        method: "POST",
        body: data,
      });
      setUser(account);
      navigate("/dashboard/provider?section=verification", { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const field = (key, label, options = {}) => (
    <div className="gs-apply__field">
      <label htmlFor={`gs-apply-${key}`}>{label}</label>
      <input
        id={`gs-apply-${key}`}
        name={key}
        value={form[key]}
        onChange={(e) => change(key, e.target.value)}
        disabled={busy}
        readOnly={identity?.channel === key}
        {...options}
      />
    </div>
  );
  if (loading) return <Loading />;
  if (user) return <Navigate to={`/dashboard/${user.role}`} replace />;
  return (
    <div className="gs-signin gs-apply">
      <div className="gs-signin__layout">
        <div className="gs-signin__topline">
          <Link to="/" className="gs-signin__back">
            <ArrowLeft size={15} aria-hidden="true" /> Back to home
          </Link>
          <Link to="/register">
            Looking for a service? Create a customer account
          </Link>
        </div>
        <section
          className="gs-signin__content"
          aria-label="Professional application"
        >
          <aside className="gs-signin__story">
            <div className="gs-signin__eyebrow">
              <span /> GOOD WORK STARTS WITH YOU
            </div>
            <h2>
              Your skills.
              <br />
              <span>A new beginning.</span>
            </h2>
            <p className="gs-signin__intro">
              Bring your experience to homes that need a helping hand. Apply as
              an individual professional and choose the services you offer.
            </p>
            <div className="gs-signin__photo">
              <img
                src="/images/professional.jpg"
                alt="A home service professional at work"
                width="1200"
                height="800"
              />
              <div className="gs-signin__photo-label">
                <span className="gs-signin__photo-icon">
                  <Wrench size={17} aria-hidden="true" />
                </span>
                <div>
                  <strong>Make room for your next opportunity.</strong>
                  <span>
                    Your profile is listed after administrator approval.
                  </span>
                </div>
              </div>
            </div>
            <ul className="gs-apply__benefits">
              <li>
                <CheckCircle2 size={17} aria-hidden="true" /> Offer several
                service categories
              </li>
              <li>
                <Save size={17} aria-hidden="true" /> Save progress when you
                choose
              </li>
              <li>
                <ShieldCheck size={17} aria-hidden="true" /> Review documents
                before submitting
              </li>
            </ul>
            <p className="gs-apply__aside-note">
              For individual professionals. Supporting documents are privately
              reviewed by the project administrator; uploading a file is not
              Aadhaar authentication.
            </p>
          </aside>
          <div className="gs-signin__card">
            <div className="gs-signin__card-heading">
              <span className="gs-signin__welcome-icon">
                <Wrench size={20} aria-hidden="true" />
              </span>
              <span className="gs-signin__card-caption">
                BECOME A GHARSEVA PROFESSIONAL
              </span>
            </div>
            {invitation && (
              <p className="gs-apply__aside-note">
                Invited as a professional for {invitation.maskedContact}. Verify
                that exact contact. Your services and identity evidence still
                require administrator review.
              </p>
            )}
            <h1>
              {invitation
                ? "Your professional invitation."
                : "Put your skills to work."}
            </h1>
            <p className="gs-signin__subtitle">
              A few details today. A profile ready for review.
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
            {!config.providerRegistration ? (
              <p className="gs-verify__notice">
                Professional applications are temporarily paused. Please check
                back later.
              </p>
            ) : (
              <>
                {checking ? (
                  <p role="status">Checking your application session…</p>
                ) : (
                  <ContactVerification
                    portal="provider"
                    identity={identity}
                    onVerified={async (proof) => {
                      if (invitation) {
                        try {
                          proof = await api("/invitations/proof", {
                            method: "POST",
                            body: { token: invitation.token },
                          });
                        } catch (e) {
                          setError(e.message);
                          return;
                        }
                      }
                      if (proof.role) {
                        setUser(proof);
                        navigate(`/dashboard/${proof.role}`, { replace: true });
                      } else setIdentity(proof);
                    }}
                    onReset={reset}
                  />
                )}
                {!identity && (
                  <p className="gs-register__verified-note">
                    Verify your email or mobile to start. Use the same contact
                    to resume a saved application. You will set a GharSeva
                    password after verification, including when you choose
                    Google or Apple.
                  </p>
                )}
                {identity && !draftReady && (
                  <p role="status">Looking for your saved application…</p>
                )}
                {identity && draftReady && (
                  <>
                    <ol
                      className="gs-apply__progress"
                      aria-label="Application progress"
                    >
                      {steps.map((label, i) => (
                        <li
                          key={label}
                          aria-current={step === i + 1 ? "step" : undefined}
                        >
                          <span>
                            {step > i + 1 ? (
                              <Check size={13} aria-hidden="true" />
                            ) : (
                              i + 1
                            )}
                          </span>
                          <small>{label}</small>
                        </li>
                      ))}
                    </ol>
                    <div className="gs-apply__save-choice">
                      <label>
                        <input
                          type="checkbox"
                          checked={saveConsent}
                          disabled={busy}
                          onChange={(e) =>
                            e.target.checked
                              ? setSaveConsent(true)
                              : stopSaving()
                          }
                        />
                        <span>
                          <strong>Save my application progress</strong>
                          <small>
                            Keep these details for up to 30 days so I can return
                            later. Administrators can see saved application
                            progress. Passwords and files stay out of drafts.
                          </small>
                        </span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={followUp}
                          disabled={busy}
                          onChange={(e) => setFollowUp(e.target.checked)}
                        />
                        <span>
                          Allow staff to contact my verified{" "}
                          {identity.channel === "email"
                            ? "email address"
                            : "mobile number"}{" "}
                          if I need help finishing. Optional.
                        </span>
                      </label>
                      {saveStatus && <p role="status">{saveStatus}</p>}
                      {conflict.current && (
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => window.location.reload()}
                        >
                          Reload saved application
                        </button>
                      )}
                    </div>
                    <h2
                      className="gs-apply__step-title"
                      ref={heading}
                      tabIndex={-1}
                    >
                      {step}. {steps[step - 1]}
                    </h2>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        step === 4 ? submit() : next();
                      }}
                      noValidate
                      aria-busy={busy}
                    >
                      {step === 1 && (
                        <>
                          <div className="gs-apply__grid">
                            {field("name", "Full name", {
                              autoComplete: "name",
                              maxLength: 80,
                            })}
                            <div className="gs-apply__field">
                              <label htmlFor="gs-apply-city">
                                Service city
                              </label>
                              <select
                                id="gs-apply-city"
                                required
                                value={form.city}
                                disabled={busy}
                                onChange={(e) => change("city", e.target.value)}
                              >
                                <option value="">Select your city</option>
                                {supportedCities.map((city) => (
                                  <option key={city}>{city}</option>
                                ))}
                              </select>
                            </div>
                            {field("email", "Email address", {
                              type: "email",
                              autoComplete: "email",
                              maxLength: 120,
                            })}
                            {field("mobile", "Indian mobile number", {
                              type: "tel",
                              inputMode: "tel",
                              autoComplete: "tel-national",
                              maxLength: 10,
                            })}
                          </div>
                          <div className="gs-apply__field">
                            <label htmlFor="gs-apply-password">
                              Create a GharSeva password
                            </label>
                            <div className="gs-signin__input-wrap">
                              <input
                                id="gs-apply-password"
                                name="password"
                                type={visible ? "text" : "password"}
                                autoComplete="new-password"
                                value={form.password}
                                onChange={(e) =>
                                  change("password", e.target.value)
                                }
                                minLength={8}
                                maxLength={72}
                                disabled={busy}
                                aria-describedby="gs-apply-password-hint"
                              />
                              <button
                                type="button"
                                className="gs-signin__visibility"
                                aria-label={
                                  visible ? "Hide password" : "Show password"
                                }
                                onClick={() => setVisible((v) => !v)}
                                disabled={busy}
                              >
                                {visible ? (
                                  <EyeOff size={18} />
                                ) : (
                                  <Eye size={18} />
                                )}
                              </button>
                            </div>
                            <span
                              id="gs-apply-password-hint"
                              className="gs-register__hint"
                            >
                              8–72 characters with uppercase, lowercase and a
                              number. Your browser can suggest a password.
                            </span>
                          </div>
                        </>
                      )}
                      {step === 2 && (
                        <>
                          <fieldset className="gs-apply__categories">
                            <legend>
                              Which services do you offer?{" "}
                              <span>Choose up to 8</span>
                            </legend>
                            <div>
                              {categories.map((c) => (
                                <label key={c.slug}>
                                  <input
                                    type="checkbox"
                                    checked={form.categories.includes(c.slug)}
                                    disabled={
                                      busy ||
                                      (!form.categories.includes(c.slug) &&
                                        form.categories.length >= 8)
                                    }
                                    onChange={() =>
                                      change(
                                        "categories",
                                        form.categories.includes(c.slug)
                                          ? form.categories.filter(
                                              (s) => s !== c.slug,
                                            )
                                          : [...form.categories, c.slug],
                                      )
                                    }
                                  />
                                  {c.name}
                                </label>
                              ))}
                            </div>
                            {!categories.length && (
                              <p>
                                No service categories are available. Please
                                contact support.
                              </p>
                            )}
                          </fieldset>
                          <div className="gs-apply__grid">
                            {field("experience", "Years of experience", {
                              type: "number",
                              min: 0,
                              max: 50,
                            })}
                            {field("price", "Starting visit price (₹)", {
                              type: "number",
                              min: 100,
                              max: 50000,
                            })}
                          </div>
                          {field("area", "Neighbourhoods you serve", {
                            placeholder:
                              "For example: Satellite and nearby areas",
                            maxLength: 100,
                          })}
                          <div className="gs-apply__field">
                            <label htmlFor="gs-apply-bio">
                              Tell customers about your work
                            </label>
                            <textarea
                              id="gs-apply-bio"
                              value={form.bio}
                              onChange={(e) => change("bio", e.target.value)}
                              maxLength={500}
                              minLength={30}
                              rows={4}
                              disabled={busy}
                            />
                            <span className="gs-register__hint">
                              {form.bio.length}/500 characters · At least 30
                              characters. Your first chosen category is your
                              main service; the starting visit price applies to
                              all selected services.
                            </span>
                          </div>
                        </>
                      )}
                      {step === 3 && (
                        <>
                          <div className="gs-apply__upload">
                            <FileText size={27} aria-hidden="true" />
                            <strong>A supporting document for review</strong>
                            <p>
                              Upload a qualification, work certificate or
                              another suitable supporting document. Use
                              fictional documents for classroom demonstrations.
                              Do not upload a full Aadhaar number for this demo.
                            </p>
                            <label htmlFor="gs-apply-document">
                              Choose PDF, JPG, PNG or WebP · Maximum 3 MB
                            </label>
                            <input
                              id="gs-apply-document"
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,.webp"
                              disabled={busy}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f && f.size > 3 * 1024 * 1024) {
                                  setError("Choose a file of 3 MB or less.");
                                  e.target.value = "";
                                  setDocumentFile(null);
                                } else {
                                  setDocumentFile(f || null);
                                  setError("");
                                }
                              }}
                            />
                            {documentFile && (
                              <span>
                                {documentFile.name} ·{" "}
                                {Math.ceil(documentFile.size / 1024)} KB
                              </span>
                            )}
                          </div>
                          <p className="gs-apply__aside-note">
                            After creating your account, complete the private
                            identity review step with front/back images. Your
                            listing stays pending until an administrator reviews
                            it. Supporting documents are uploaded only with your
                            final submission and are accessible to you and
                            administrators. A saved draft does not include a
                            selected file.
                          </p>
                          {identity.provider === "apple.com" &&
                            /@(?:privaterelay\.appleid\.com|private\.icloud\.com)$/.test(
                              identity.contact,
                            ) && (
                              <label className="gs-apply__terms">
                                <input
                                  type="checkbox"
                                  checked={form.appleRelayConsent}
                                  onChange={(e) =>
                                    change(
                                      "appleRelayConsent",
                                      e.target.checked,
                                    )
                                  }
                                />
                                <span>
                                  I agree to associate my Apple private relay
                                  identity with the name and mobile details I
                                  provide for GharSeva.
                                </span>
                              </label>
                            )}
                          <label className="gs-apply__terms">
                            <input
                              type="checkbox"
                              checked={terms}
                              onChange={(e) => setTerms(e.target.checked)}
                              disabled={busy}
                            />
                            <span>
                              I agree to the{" "}
                              <Link
                                to="/terms"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Terms of service
                              </Link>{" "}
                              and{" "}
                              <Link
                                to="/privacy"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Privacy policy
                              </Link>
                              , and confirm these details describe my own work.
                            </span>
                          </label>
                        </>
                      )}
                      {step === 4 && (
                        <>
                          <div className="gs-apply__review">
                            <div>
                              <small>Applicant</small>
                              <strong>{form.name}</strong>
                              <span>
                                {form.email} · {form.mobile}
                              </span>
                            </div>
                            <div>
                              <small>Services & location</small>
                              <strong>
                                {form.categories
                                  .map(
                                    (s) =>
                                      categories.find((c) => c.slug === s)
                                        ?.name || s,
                                  )
                                  .join(", ")}
                              </strong>
                              <span>
                                {form.area}, {form.city}
                              </span>
                            </div>
                            <div>
                              <small>Experience & starting visit price</small>
                              <strong>
                                {form.experience} years · ₹{form.price} / visit
                              </strong>
                            </div>
                            <div>
                              <small>Supporting document</small>
                              <strong>
                                {documentFile?.name ||
                                  "Select your document again"}
                              </strong>
                            </div>
                            <div>
                              <small>Your choices</small>
                              <span>
                                Saved progress: {saveConsent ? "Yes" : "No"} ·
                                Staff follow-up:{" "}
                                {followUp ? "Allowed" : "Not allowed"}
                              </span>
                            </div>
                          </div>
                          <p className="gs-apply__aside-note">
                            Your application will be pending after submission.
                            An administrator reviews your details and document
                            before your services appear in search.
                          </p>
                        </>
                      )}
                      <div className="gs-apply__actions">
                        {step > 1 && (
                          <button
                            className="btn light"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setStep((s) => s - 1);
                              setError("");
                            }}
                          >
                            <ArrowLeft size={16} />
                            Back
                          </button>
                        )}
                        <button
                          className="gs-signin__submit"
                          disabled={busy || Boolean(conflict.current)}
                          type="submit"
                        >
                          {busy ? (
                            <>
                              <LoaderCircle
                                size={17}
                                className="gs-signin__spinner"
                              />
                              Submitting…
                            </>
                          ) : (
                            <>
                              {step === 4
                                ? "Submit my application"
                                : "Continue"}
                              <ArrowRight size={17} />
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </>
            )}
            <div className="gs-signin__join">
              Already applied?{" "}
              <Link to="/provider/login">
                Sign in to your account <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
        <footer className="gs-signin__footer">
          <span>© {new Date().getFullYear()} GharSeva</span>
          <nav aria-label="Application page links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/contact">Support</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
