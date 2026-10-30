import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  Link2,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { api, label } from "../api";
import { useApp } from "../context";
import { CustomerRegister } from "./CustomerRegister";
import { ProviderRegister } from "./ProviderRegister";
import "./AccountInvitations.css";
const when = (v) =>
  new Date(v).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const labels = {
  PENDING: "Awaiting recipient",
  EXPIRED: "Expired",
  ACCEPTING: "Being accepted",
  ACCEPTED: "Account created",
  REVOKED: "Revoked",
};
export function AccountInvitations() {
  const [form, setForm] = useState({
      role: "customer",
      channel: "email",
      contact: "",
      name: "",
      city: "Ahmedabad",
    }),
    [data, setData] = useState(null),
    [options, setOptions] = useState(null),
    [state, setState] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [created, setCreated] = useState(null),
    [revoke, setRevoke] = useState(null);
  const lock = useRef(false),
    request = useRef(0);
  const load = useCallback(async () => {
    const n = ++request.current;
    try {
      const d = await api(
        `/admin/invitations?${new URLSearchParams({ state, q: query, page: String(page) })}`,
      );
      if (n === request.current) setData(d);
    } catch (e) {
      if (n === request.current) setError(e.message);
    }
  }, [state, query, page]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    api("/auth/options")
      .then(setOptions)
      .catch(() => {});
  }, []);
  const act = async (fn) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const showLink = (r) => {
    setCreated({
      invitation: r.invitation,
      url: `${window.location.origin}/invite#invite=${r.token}`,
    });
    setNotice(
      "Invitation created. No message was sent. Share the private link with the intended recipient.",
    );
  };
  const change = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({
      ...f,
      [name]: value,
      ...(name === "channel" ? { contact: "" } : {}),
    }));
  };
  return (
    <section className="gs-invites">
      <div className="gs-invites__hero">
        <div>
          <span className="eyebrow">A GOOD START, FOR EVERY ROLE</span>
          <h2>
            Invite someone in.
            <br />
            <em>Let them make it their own.</em>
          </h2>
          <p>
            Create a customer or professional invitation. The recipient verifies
            their contact, chooses a password and completes their own
            onboarding.
          </p>
        </div>
        <span className="gs-invites__hero-icon">
          <UserPlus size={37} />
        </span>
      </div>
      <div className="gs-invites__principles">
        <span>
          <ShieldCheck size={17} /> Fixed role, verified contact
        </span>
        <span>
          <Clock size={17} /> Private link · 48 hours
        </span>
        <span>
          <Wrench size={17} /> Provider review stays in place
        </span>
      </div>
      {error && (
        <p className="gs-invites__error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="gs-invites__notice" role="status">
          {notice}
        </p>
      )}
      {created && (
        <div className="gs-invites__share">
          <button
            type="button"
            className="gs-invites__close"
            aria-label="Dismiss private invitation link"
            onClick={() => setCreated(null)}
          >
            <X size={17} />
          </button>
          <span className="eyebrow">
            SHARE PRIVATELY · SHOWN THIS TIME ONLY
          </span>
          <h3>
            {created.invitation.name || "Your recipient"}’s{" "}
            {created.invitation.role} invitation
          </h3>
          <p>
            For {created.invitation.contact}. Expires{" "}
            {when(created.invitation.expiresAt)}. This is an invitation link,
            not a password. The intended contact still needs verification.
          </p>
          <label htmlFor="gs-private-invite-link">
            Private invitation link
          </label>
          <div>
            <input
              id="gs-private-invite-link"
              readOnly
              value={created.url}
              autoComplete="off"
            />
            <button
              className="btn small"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(created.url);
                  setNotice(
                    "Private link copied. Share it only with the intended recipient.",
                  );
                } catch {
                  setNotice(
                    "Copy is unavailable here. Select and copy the link from the field.",
                  );
                }
              }}
            >
              <Copy size={14} /> Copy link
            </button>
          </div>
          <small>
            Dismiss this panel when finished. Later, Replace link creates a new
            link and invalidates the old one.
          </small>
        </div>
      )}
      <div className="gs-invites__layout">
        <form
          className="gs-invites__form"
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              const r = await api("/admin/invitations", {
                method: "POST",
                body: form,
              });
              showLink(r);
              setForm((f) => ({ ...f, name: "", contact: "" }));
            });
          }}
        >
          <span className="gs-invites__form-icon">
            <Plus size={21} />
          </span>
          <h3>Create an account invitation</h3>
          <p>
            No active account is created until the recipient completes
            registration.
          </p>
          <div
            className="gs-invites__roles"
            role="group"
            aria-label="Invitation account role"
          >
            {[
              ["customer", UserRound, "Customer", "Book services"],
              ["provider", Wrench, "Professional", "Offer services"],
            ].map(([value, Icon, title, description]) => (
              <button
                key={value}
                type="button"
                aria-pressed={form.role === value}
                disabled={busy}
                className={form.role === value ? "is-selected" : ""}
                onClick={() => setForm((f) => ({ ...f, role: value }))}
              >
                <Icon size={19} />
                <strong>{title}</strong>
                <small>{description}</small>
              </button>
            ))}
          </div>
          <label>
            Recipient name (optional)
            <input
              name="name"
              value={form.name}
              onChange={change}
              minLength={3}
              maxLength={80}
              disabled={busy}
              autoComplete="off"
              placeholder="Name for the invitation"
            />
          </label>
          <div className="gs-invites__form-row">
            <label>
              Contact type
              <select
                name="channel"
                value={form.channel}
                onChange={change}
                disabled={busy}
              >
                <option value="email">Email address</option>
                <option value="mobile">Indian mobile</option>
              </select>
            </label>
            <label>
              City
              <input
                name="city"
                value={form.city}
                onChange={change}
                required
                maxLength={70}
                minLength={2}
                disabled={busy}
              />
            </label>
          </div>
          <label>
            {form.channel === "email" ? "Recipient email" : "Recipient mobile"}
            <input
              name="contact"
              type={form.channel === "email" ? "email" : "tel"}
              value={form.contact}
              onChange={change}
              required
              maxLength={120}
              disabled={busy}
              placeholder={
                form.channel === "email"
                  ? "recipient@example.com"
                  : "+91 10-digit mobile number"
              }
              autoComplete="off"
            />
          </label>
          {options && !options[form.channel] && (
            <p className="gs-invites__setup">
              {form.channel === "email" ? "Email" : "SMS"} verification is
              awaiting setup. You can prepare the invitation, but its recipient
              cannot finish until delivery is configured.
            </p>
          )}
          <div className="gs-invites__explain">
            <ShieldCheck size={17} />
            <p>
              {form.role === "provider"
                ? "The professional supplies service details and verifies their email. Administrator listing approval is required; documents are optional."
                : "The customer supplies their contact details and chooses their own password. Existing accounts are never overwritten."}
            </p>
          </div>
          <button type="submit" className="btn full" disabled={busy}>
            {busy ? "Please wait…" : "Create private invitation"}
            <ArrowRight size={16} />
          </button>
          <small className="gs-invites__delivery">
            Manual sharing only. Creating an invitation sends no email or SMS.
          </small>
        </form>
        <div className="gs-invites__records">
          <div className="gs-invites__records-head">
            <div>
              <span className="eyebrow">FOLLOW THEIR NEXT STEP</span>
              <h3>Invitations</h3>
            </div>
            <button
              type="button"
              className="text-link"
              onClick={load}
              disabled={busy}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <div className="gs-invites__filters">
            <input
              aria-label="Search invitations"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search name or contact…"
            />
            <select
              aria-label="Filter invitation status"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {Object.entries(labels).map(([value, title]) => (
                <option key={value} value={value}>
                  {title}
                </option>
              ))}
            </select>
          </div>
          {!data ? (
            <p role="status">Loading invitations…</p>
          ) : (
            <>
              <p className="gs-invites__count">
                {data.total} records · Page {data.page} of {data.pages}
              </p>
              <div className="gs-invites__list">
                {data.items.map((a) => (
                  <article key={a._id}>
                    <div className="gs-invites__row-title">
                      <span>
                        {a.role === "provider" ? (
                          <Wrench size={18} />
                        ) : (
                          <UserRound size={18} />
                        )}
                      </span>
                      <div>
                        <h4>{a.name || a.contact}</h4>
                        <p>
                          {a.name ? a.contact : label(a.role)} · {a.city}
                        </p>
                      </div>
                      <strong
                        className={`gs-invites__status gs-invites__status--${a.status.toLowerCase()}`}
                      >
                        {labels[a.status]}
                      </strong>
                    </div>
                    <p className="gs-invites__row-meta">
                      {a.role === "provider" ? "Professional" : "Customer"} ·
                      Expires {when(a.expiresAt)}
                    </p>
                    {a.status === "ACCEPTED" && (
                      <p className="gs-invites__accepted">
                        <CheckCircle2 size={13} /> Recipient completed
                        registration.{" "}
                        {a.role === "provider"
                          ? "Listing approval remains separate."
                          : "The account is available in Customers."}
                      </p>
                    )}
                    <details className="gs-invites__history">
                      <summary>Invitation history</summary>
                      <ol>
                        {a.history?.map((h, i) => (
                          <li key={i}>
                            <b>{label(h.action)}</b>
                            <small>{when(h.at)}</small>
                          </li>
                        ))}
                      </ol>
                    </details>
                    {!["ACCEPTED", "ACCEPTING", "REVOKED"].includes(
                      a.status,
                    ) && (
                      <div className="gs-invites__row-actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            act(async () =>
                              showLink(
                                await api(`/admin/invitations/${a._id}`, {
                                  method: "PATCH",
                                  body: {
                                    action: "REPLACE_LINK",
                                    revision: a.revision,
                                  },
                                }),
                              ),
                            )
                          }
                        >
                          <Link2 size={13} /> Replace link
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setRevoke(a._id)}
                        >
                          Revoke invitation
                        </button>
                      </div>
                    )}
                    {revoke === a._id && (
                      <div className="gs-invites__confirm">
                        <p>
                          Revoke this unused invitation? Its link will stop
                          working.
                        </p>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            act(async () => {
                              await api(`/admin/invitations/${a._id}`, {
                                method: "PATCH",
                                body: {
                                  action: "REVOKE",
                                  revision: a.revision,
                                },
                              });
                              setRevoke(null);
                              setCreated((c) =>
                                c?.invitation._id === a._id ? null : c,
                              );
                              setNotice(
                                "Invitation revoked. No account was changed.",
                              );
                            })
                          }
                        >
                          Confirm revoke
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevoke(null)}
                          disabled={busy}
                        >
                          Keep invitation
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              {!data.items.length && (
                <div className="gs-invites__empty">
                  <Users size={30} />
                  <h3>A thoughtful first step.</h3>
                  <p>
                    Create an invitation to help someone join GharSeva. Their
                    progress will appear here.
                  </p>
                </div>
              )}
              <div className="gs-invites__pagination">
                <button
                  className="text-link"
                  disabled={page <= 1 || busy}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="text-link"
                  disabled={page >= data.pages || busy}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
export function InvitationRegistration() {
  const location = useLocation(),
    { user, logout, loading } = useApp();
  const [token, setToken] = useState(
      () => new URLSearchParams(location.hash.slice(1)).get("invite") || "",
    ),
    [invitation, setInvitation] = useState(null),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(true);
  useEffect(() => {
    const incoming = new URLSearchParams(window.location.hash.slice(1)).get(
      "invite",
    );
    if (incoming) {
      setToken(incoming);
      window.history.replaceState(
        window.history.state,
        "",
        location.pathname + location.search,
      );
    }
  }, [location.hash, location.pathname, location.search]);
  useEffect(() => {
    let active = true;
    setChecking(true);
    setInvitation(null);
    setError("");
    if (!token) {
      setError(
        "Open the complete private link supplied by the administrator. Reloading a page after its link was cleared requires reopening that original link.",
      );
      setChecking(false);
      return;
    }
    api("/invitations/preview", { method: "POST", body: { token } })
      .then((v) => {
        if (active) setInvitation({ ...v, token });
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
  }, [token]);
  if (checking || loading)
    return (
      <div className="gs-invite-entry">
        <p role="status">Checking your invitation…</p>
      </div>
    );
  if (error)
    return (
      <div className="gs-invite-entry">
        <span className="gs-invite-entry__icon">
          <Mail size={31} />
        </span>
        <h1>Let’s find your invitation.</h1>
        <p role="alert">{error}</p>
        <p>
          Ask the administrator for a current link. Existing accounts can sign
          in normally.
        </p>
        <Link className="btn" to="/login">
          Go to sign in <ArrowRight size={15} />
        </Link>
      </div>
    );
  if (user)
    return (
      <div className="gs-invite-entry">
        <ShieldCheck size={34} />
        <h1>You’re already signed in.</h1>
        <p>
          This invitation is for a new {invitation.role} account. Use the
          intended recipient’s browser profile, or sign out here before
          continuing. Your existing account will keep its role.
        </p>
        <button className="btn" type="button" onClick={logout}>
          Sign out to continue
        </button>
      </div>
    );
  if (!invitation.verificationReady || !invitation.providerRegistration)
    return (
      <div className="gs-invite-entry">
        <Clock size={34} />
        <h1>Your invitation is waiting.</h1>
        <p>
          {!invitation.providerRegistration
            ? "Professional registration is temporarily paused."
            : `${invitation.channel === "email" ? "Email" : "SMS"} verification still needs to be configured by the project owner.`}{" "}
          Contact the administrator before this invitation expires on{" "}
          {when(invitation.expiresAt)}.
        </p>
        <Link className="btn light" to="/contact">
          Contact support
        </Link>
      </div>
    );
  return invitation.role === "provider" ? (
    <ProviderRegister key={token} invitation={invitation} />
  ) : (
    <CustomerRegister key={token} invitation={invitation} />
  );
}
