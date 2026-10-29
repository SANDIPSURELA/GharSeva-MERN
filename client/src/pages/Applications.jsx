import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Clock,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { api, label } from "../api";
import { signInExternal } from "../external-identity";
import { externalSignInMessage } from "../../../shared/external-auth.js";
import { useApp } from "../context";
import { ContactVerification } from "../components/ContactVerification";
import "./Applications.css";
const states = [
  ["", "All requests"],
  ["SUBMITTED", "Pending review"],
  ["DRAFT", "Incomplete"],
  ["INACTIVE", "Inactive drafts"],
  ["NEEDS_CORRECTION", "Needs correction"],
  ["APPROVED", "Approved"],
  ["REJECTED", "Rejected"],
];
export function Applications() {
  const currentRequest = useRef(0);
  const [data, setData] = useState(null),
    [state, setState] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notes, setNotes] = useState({});
  const load = useCallback(async () => {
    const request = ++currentRequest.current;
    try {
      const params = new URLSearchParams({
        state,
        q: query,
        page: String(page),
      });
      const result = await api(`/admin/applications?${params}`);
      if (request === currentRequest.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (request === currentRequest.current) setError(e.message);
    }
  }, [state, query, page]);
  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      if (active) load();
    }, 200);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);
    return () => {
      active = false;
      clearTimeout(t);
      clearInterval(poll);
    };
  }, [load]);
  const review = async (a, action) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/applications/${a._id}`, {
        method: "PATCH",
        body: { action, note: notes[a._id] || "", revision: a.revision },
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="gs-applications"
      aria-label="Professional registration requests"
    >
      <div className="gs-applications__heading">
        <div>
          <span className="eyebrow">PROFESSIONAL ONBOARDING</span>
          <h2>Every application. One clear view.</h2>
          <p>
            Review submitted requests and see where opted-in applicants need
            help.
          </p>
        </div>
        <button
          className="btn light small"
          type="button"
          onClick={load}
          disabled={busy}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
      <div className="gs-applications__filters">
        <div className="gs-applications__search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Search applications by name"
            placeholder="Search applicant name…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label="Application status"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          {states.map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div className="gs-signin__error" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <p role="status">Loading applications…</p>
      ) : (
        <>
          <p className="gs-applications__count">
            {data.total} matching applications · Page {data.page} of{" "}
            {data.pages}
          </p>
          <div className="gs-applications__list">
            {data.items.map((a) => (
              <article key={a._id} className="gs-applications__card">
                <div className="gs-applications__top">
                  <span className="gs-applications__avatar">
                    <ClipboardList size={21} />
                  </span>
                  <div>
                    <h3>{a.data.name || "Details not entered yet"}</h3>
                    <p>
                      {a.data.city || "City not entered"} · GS-
                      {a._id.slice(-6).toUpperCase()}
                    </p>
                  </div>
                  <span
                    className={`gs-applications__status gs-applications__status--${a.state.toLowerCase()}`}
                  >
                    {a.inactive ? "Inactive draft" : label(a.state)}
                  </span>
                </div>
                <div className="gs-applications__facts">
                  <div>
                    <small>Services</small>
                    <strong>
                      {a.data.categories?.map(label).join(", ") ||
                        "Not selected"}
                    </strong>
                  </div>
                  <div>
                    <small>Verified contact / proof</small>
                    <strong>
                      {a.contact} ·{" "}
                      {a.mode === "demo"
                        ? "Classroom demo"
                        : a.mode === "live"
                          ? "Live proof"
                          : "Not verified"}
                    </strong>
                  </div>
                  <div>
                    <small>Last activity</small>
                    <strong>
                      {new Date(a.lastActivityAt).toLocaleString("en-IN")}
                    </strong>
                  </div>
                  <div>
                    <small>Progress / permission</small>
                    <strong>
                      {a.incomplete ? `Step ${a.step} of 4` : "Submitted"} ·{" "}
                      {a.followUpConsent
                        ? "Follow-up allowed"
                        : "No follow-up permission"}
                    </strong>
                  </div>
                </div>
                {a.user?._id && (
                  <Link
                    className="gs-id__return"
                    to={`/dashboard/admin?section=verification&provider=${a.user._id}`}
                  >
                    Review private identity evidence <ArrowRight size={14} />
                  </Link>
                )}
                {a.data.bio && (
                  <p className="gs-applications__bio">{a.data.bio}</p>
                )}
                {a.incomplete && (
                  <p className="gs-applications__notice">
                    <Clock size={15} />
                    {a.inactive
                      ? "No saved activity for at least 24 hours. This is an inactivity flag, not a rejection."
                      : "This is a saved incomplete form, not a registered provider account."}{" "}
                    {a.followUpConsent
                      ? "Staff may use the verified contact for application help."
                      : "Contact details are masked; do not contact this applicant."}
                  </p>
                )}
                <details className="gs-applications__checks">
                  <summary>
                    Completeness checks · {a.checks.length} items to review
                  </summary>
                  <ul>
                    {a.checks.map((check) => (
                      <li key={check}>{check}</li>
                    ))}
                  </ul>
                  <p>
                    These are rule-based checks. They do not authenticate
                    Aadhaar, perform OCR or make approval decisions.
                  </p>
                </details>
                {a.user?.profile?.documents?.length > 0 && (
                  <div className="gs-applications__documents">
                    {a.user.profile.documents.map((id, i) => (
                      <a
                        href={`/api/files/${id}`}
                        key={id}
                        target="_blank"
                        rel="noreferrer"
                        className="btn small light"
                      >
                        <FileText size={14} />
                        Review document {i + 1}
                      </a>
                    ))}
                  </div>
                )}
                {(a.user || a.followUpConsent) && (
                  <div className="gs-applications__decision">
                    <label htmlFor={`review-${a._id}`}>
                      Decision or follow-up note <span>10–500 characters</span>
                    </label>
                    <textarea
                      id={`review-${a._id}`}
                      value={notes[a._id] || ""}
                      maxLength={500}
                      rows={2}
                      placeholder="Record what you checked, what needs correcting or what follow-up occurred."
                      onChange={(e) =>
                        setNotes((n) => ({ ...n, [a._id]: e.target.value }))
                      }
                    />
                    <div>
                      {!a.incomplete && (
                        <>
                          <button
                            className="btn small"
                            disabled={
                              busy ||
                              (notes[a._id] || "").trim().length < 10 ||
                              !a.user?.profile?.documents?.length
                            }
                            onClick={() => review(a, "APPROVED")}
                          >
                            <ShieldCheck size={14} />
                            Approve
                          </button>
                          <button
                            className="btn small light"
                            disabled={
                              busy || (notes[a._id] || "").trim().length < 10
                            }
                            onClick={() => review(a, "NEEDS_CORRECTION")}
                          >
                            Request correction
                          </button>
                          <button
                            className="btn small light"
                            disabled={
                              busy || (notes[a._id] || "").trim().length < 10
                            }
                            onClick={() => review(a, "REJECTED")}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {a.followUpConsent && (
                        <button
                          className="btn small light"
                          disabled={
                            busy || (notes[a._id] || "").trim().length < 10
                          }
                          onClick={() => review(a, "FOLLOW_UP")}
                        >
                          Record follow-up
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {a.history?.length > 0 && (
                  <details className="gs-applications__history">
                    <summary>Application history ({a.history.length})</summary>
                    <ol>
                      {a.history.map((h, i) => (
                        <li key={i}>
                          <strong>{label(h.action)}</strong>
                          <time>{new Date(h.at).toLocaleString("en-IN")}</time>
                          <p>{h.note}</p>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </article>
            ))}
          </div>
          {!data.items.length && (
            <div className="gs-applications__empty">
              <ClipboardList size={29} />
              <h3>No matching applications</h3>
              <p>Saved and submitted applications will appear here.</p>
            </div>
          )}
          <div className="gs-applications__pagination">
            <button
              className="btn small light"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ArrowLeft size={15} />
              Previous
            </button>
            <button
              className="btn small light"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ArrowRight size={15} />
            </button>
          </div>
          {data.earlierRequests.length > 0 && (
            <div className="gs-applications__legacy">
              <h3>
                Earlier pending provider requests ({data.earlierRequests.length}
                )
              </h3>
              <p>
                These accounts predate the new application workflow and retain
                their original documents and approval controls.
              </p>
              <ul>
                {data.earlierRequests.map((p) => (
                  <li key={p._id}>
                    {p.name} · {label(p.profile?.category)}
                  </li>
                ))}
              </ul>
              <Link
                to="/dashboard/admin?section=providers"
                className="text-link"
              >
                Review earlier provider accounts <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
export function ProviderApplicationStatus() {
  const { user } = useApp();
  const [application, setApplication] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    const load = () =>
      api("/provider/application")
        .then(setApplication)
        .catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="gs-applications gs-applications__legacy">
      <span className="eyebrow">YOUR PROFESSIONAL APPLICATION</span>
      <h2>{label(application?.state || user.profile.status)}</h2>
      <p>
        {user.profile.status === "APPROVED"
          ? "Your professional profile is approved."
          : "An administrator reviews your details and supporting document before your services appear in search."}
      </p>
      {error && <p role="alert">{error}</p>}
      <Link
        className="btn light small"
        to="/dashboard/provider?section=profile"
      >
        Edit profile & services
      </Link>{" "}
      <Link
        className="btn light small"
        to="/dashboard/provider?section=documents"
      >
        Documents & resubmission
      </Link>
      <Link
        className="btn light small"
        to="/dashboard/provider?section=verification"
      >
        Identity verification <ShieldCheck size={14} />
      </Link>
      <ol className="gs-applications__provider-history">
        {application?.history?.map((h, i) => (
          <li key={i}>
            <strong>{label(h.action)}</strong>
            <small>{new Date(h.at).toLocaleString("en-IN")}</small>
            <p>{h.note}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
export function ConnectedSignIn() {
  const { user, setUser } = useApp();
  const linkLock = useRef(false);
  const [options, setOptions] = useState(null),
    [password, setPassword] = useState(""),
    [relayConsent, setRelayConsent] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [verifyOpen, setVerifyOpen] = useState(false);
  useEffect(() => {
    api("/auth/options")
      .then(setOptions)
      .catch((e) => setMessage(e.message));
  }, []);
  if (user.role === "admin") return null;
  return (
    <section className="gs-connected">
      <h2>Sign-in methods & contact proof</h2>
      <p>
        Password sign-in includes a code sent to your registered email. After
        signing in, confirm your password to link Google or Apple.
      </p>
      <p>
        Email:{" "}
        {user.verification?.email?.at
          ? user.verification.email.mode === "demo"
            ? "Demo proof"
            : "Verified"
          : "Not verified"}{" "}
        · Mobile:{" "}
        {user.verification?.mobile?.at
          ? user.verification.mobile.mode === "demo"
            ? "Demo proof"
            : "Verified"
          : "Not verified"}
      </p>
      <button
        className="btn light small"
        type="button"
        onClick={() => setVerifyOpen((o) => !o)}
        aria-expanded={verifyOpen}
      >
        Verify a saved contact
      </button>
      {verifyOpen && (
        <ContactVerification
          purpose="verify"
          account={user}
          onVerified={(account) => {
            setUser(account);
            setVerifyOpen(false);
            setMessage("Contact proof saved.");
          }}
        />
      )}
      <div className="gs-apply__field" style={{ marginTop: 20 }}>
        <label htmlFor="gs-link-password">
          Current GharSeva password (for linking)
        </label>
        <input
          id="gs-link-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={relayConsent}
          onChange={(e) => setRelayConsent(e.target.checked)}
          disabled={busy}
        />{" "}
        I consent to linking Apple private relay identities with the contact
        details and other sign-in methods on this account.
      </label>
      <div className="gs-verify__social">
        {["google", "apple"].map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={busy || !password || !options?.[provider]}
            onClick={async () => {
              if (linkLock.current) return;
              linkLock.current = true;
              setBusy(true);
              setMessage("");
              try {
                await signInExternal(options, provider, {
                  action: "link",
                  currentPassword: password,
                  appleRelayConsent: relayConsent,
                });
                setPassword("");
                setMessage(
                  `${label(provider)} sign-in linked to your account.`,
                );
              } catch (e) {
                setMessage(externalSignInMessage(e));
              } finally {
                linkLock.current = false;
                setBusy(false);
              }
            }}
          >
            Link {label(provider)}
            {options && !options[provider] && <small>Setup needed</small>}
          </button>
        ))}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
