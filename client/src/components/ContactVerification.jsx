import { useEffect, useRef, useState } from "react";
import {
  Mail,
  Phone,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import { api } from "../api";
import { Link } from "react-router-dom";
import { verificationAvailability } from "../../../shared/verification-options.js";
import "./Registration.css";

export { externalToken } from "../../../shared/external-auth.js";
import {
  prepareExternalAuth,
  externalSignInMessage,
} from "../../../shared/external-auth.js";
import { signInExternal } from "../external-identity";

export function ContactVerification({
  purpose = "register",
  onVerified,
  identity,
  onReset,
  account,
  portal,
  showSocial = true,
  fixedChannel,
  onBusyChange,
}) {
  const [options, setOptions] = useState(null),
    [channel, setChannel] = useState(fixedChannel || "email"),
    [contact, setContact] = useState(""),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0);
  const lock = useRef(false),
    codeRef = useRef(null),
    errorRef = useRef(null);
  useEffect(() => {
    let active = true;
    api("/auth/options")
      .then((o) => {
        if (active) {
          setOptions(o);
          const { channels } = verificationAvailability(o, {
            purpose,
            showSocial,
            fixedChannel,
          });
          if (!fixedChannel && channels.length) setChannel(channels[0]);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!seconds) return;
    const t = setTimeout(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (options?.google || options?.apple)
      prepareExternalAuth(options).catch(() => {});
  }, [options]);
  const act = async (fn) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(externalSignInMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  const send = () =>
    act(async () => {
      const result = await api("/auth/code/request", {
        method: "POST",
        body: {
          channel,
          contact: account ? account[channel] : contact,
          purpose,
          ...(portal ? { portal } : {}),
        },
      });
      setChallenge(result);
      setCode("");
      setSeconds(result.retryAfter);
      setTimeout(() => codeRef.current?.focus(), 0);
    });
  if (identity)
    return (
      <div className="gs-verify__confirmed">
        <CheckCircle2 size={21} aria-hidden="true" />
        <div>
          <strong>
            {identity.mode === "demo"
              ? "Contact checked in classroom demo"
              : "Contact verified"}
          </strong>
          <span>{identity.contact}</span>
        </div>
        {onReset && (
          <button type="button" onClick={onReset}>
            Change
          </button>
        )}
      </div>
    );
  const methods = verificationAvailability(options, {
    purpose,
    showSocial,
    fixedChannel,
  });
  if ((options && !methods.available) || (!options && error))
    return (
      <div className="gs-verify gs-verify__notice" role="status">
        <p>
          Verification is temporarily unavailable. Please contact support for
          help.
        </p>
        <Link className="btn light" to="/contact">
          Contact support
        </Link>
      </div>
    );
  return (
    <div
      className="gs-verify"
      aria-label={
        purpose === "register"
          ? "Verify your registration contact"
          : purpose === "recover"
            ? "Verify your password recovery contact"
            : "Sign in or verify with a code"
      }
    >
      {options?.demo && (
        <p className="gs-verify__demo">
          <strong>Classroom demo</strong> Codes appear here. No email or text
          message is sent.
        </p>
      )}
      {methods.social.length > 0 && (
        <>
          <div className="gs-verify__social">
            {["google", "apple"].map((provider) => (
              <button
                key={provider}
                type="button"
                disabled={busy || !options?.[provider]}
                title={
                  options?.[provider]
                    ? `Continue with ${provider}`
                    : "Available after the project owner connects this sign-in provider"
                }
                onClick={() =>
                  act(async () => {
                    const result = await signInExternal(options, provider, {
                      action: purpose,
                      ...(portal ? { portal } : {}),
                    });
                    onVerified(
                      result.recovery || result.identity || result.user,
                    );
                  })
                }
              >
                <span
                  className={provider === "google" ? "gs-verify__google" : ""}
                  aria-hidden="true"
                >
                  {provider === "google" ? (
                    "G"
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width="17"
                      height="17"
                      fill="currentColor"
                    >
                      <path d="M16.4 2c.1 1.5-.5 2.6-1.2 3.4-.8.9-2 1.5-3.2 1.4-.1-1.4.5-2.6 1.3-3.4.8-.8 2-1.4 3.1-1.4ZM20.6 17.8c-.5 1.1-.8 1.6-1.4 2.5-.8 1.2-1.9 2.7-3.3 2.7-1.2 0-1.5-.8-3.2-.8s-2 .8-3.2.8c-1.4 0-2.4-1.4-3.3-2.6C3.8 17 3 11.9 5.1 9.1c1.1-1.4 2.7-2.2 4.2-2.2 1.4 0 2.3.8 3.4.8 1 0 1.7-.8 3.4-.8 1.3 0 2.8.7 3.9 2-3.4 1.9-2.8 6.8.6 8.9Z" />
                    </svg>
                  )}
                </span>
                {provider === "google" ? "Google" : "Apple"}
                {options && !options[provider] && <small>Setup needed</small>}
              </button>
            ))}
          </div>
          {methods.channels.length > 0 && (
            <div className="gs-verify__divider">
              <span>
                {purpose === "register"
                  ? "or verify your contact"
                  : "or use a one-time code"}
              </span>
            </div>
          )}
        </>
      )}
      {!fixedChannel && methods.channels.length > 0 && (
        <div
          className="gs-verify__tabs"
          role="group"
          aria-label="Verification method"
        >
          {[
            ["email", Mail, "Email"],
            ["mobile", Phone, "Mobile"],
          ].map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={channel === key}
              disabled={busy || !options?.[key]}
              onClick={() => {
                setChannel(key);
                setChallenge(null);
                setCode("");
                setError("");
              }}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
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
      {!options && !error && <p role="status">Loading sign-in options…</p>}

      {options?.[channel] && (
        <div className="gs-verify__contact">
          <label htmlFor={`gs-verify-contact-${purpose}`}>
            {channel === "email" ? "Email address" : "Indian mobile number"}
          </label>
          <input
            id={`gs-verify-contact-${purpose}`}
            name={channel === "email" ? "email" : "tel"}
            type={channel === "email" ? "email" : "tel"}
            autoComplete={channel === "email" ? "email" : "tel"}
            value={account ? account[channel] : contact}
            readOnly={Boolean(account)}
            onChange={(e) => {
              setContact(e.target.value);
              setChallenge(null);
              setCode("");
            }}
            placeholder={
              channel === "email" ? "you@example.com" : "+91 mobile number"
            }
            disabled={busy}
            maxLength={120}
          />
          <button
            className="btn light"
            type="button"
            disabled={
              busy ||
              !options?.[channel] ||
              seconds > 0 ||
              !(account ? account[channel] : contact).trim()
            }
            onClick={send}
          >
            {busy
              ? "Please wait…"
              : seconds
                ? `Resend in ${seconds}s`
                : challenge
                  ? "Resend code"
                  : "Send code"}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {challenge && (
        <div className="gs-verify__code">
          {challenge.demoCode && (
            <p className="gs-verify__test-code" role="status">
              Demo code: <strong>{challenge.demoCode}</strong>
              <span>For classroom testing only.</span>
            </p>
          )}
          <label htmlFor={`gs-verify-code-${purpose}`}>Six-digit code</label>
          <input
            id={`gs-verify-code-${purpose}`}
            ref={codeRef}
            name="one-time-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="Enter your code"
            maxLength={6}
            disabled={busy}
          />
          <button
            className="gs-signin__submit"
            type="button"
            disabled={busy || code.length !== 6}
            onClick={() =>
              act(async () => {
                const result = await api("/auth/code/check", {
                  method: "POST",
                  body: {
                    challengeId: challenge.challengeId,
                    code,
                    ...(portal ? { portal } : {}),
                  },
                });
                onVerified(result.recovery || result.identity || result.user);
              })
            }
          >
            {busy ? (
              <LoaderCircle
                size={17}
                className="gs-signin__spinner"
                aria-hidden="true"
              />
            ) : (
              <ShieldCheck size={17} aria-hidden="true" />
            )}
            {purpose === "login"
              ? "Verify & sign in"
              : purpose === "recover"
                ? "Verify & continue"
                : "Verify contact"}
          </button>
          <p className="gs-register__hint">
            Expires in 5 minutes. Never share a sign-in code.
          </p>
        </div>
      )}
    </div>
  );
}

export function SocialSignIn({
  onVerified,
  onOnboarding,
  disabled,
  onBusyChange,
}) {
  const [options, setOptions] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    errorRef = useRef(null),
    mounted = useRef(true);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    api("/auth/options")
      .then((o) => {
        if (active) setOptions(o);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (options?.google || options?.apple)
      prepareExternalAuth(options).catch(() => {});
  }, [options]);
  const authenticate = async (provider) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const result = await signInExternal(options, provider, {
        action: "login",
      });
      if (!mounted.current) return;
      if (result.onboarding) onOnboarding?.(result.identity);
      else onVerified(result.user);
    } catch (e) {
      setError(externalSignInMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return (
    <div
      className="gs-login-social"
      aria-label="External sign-in methods"
      aria-busy={busy}
    >
      <div className="gs-verify__social">
        {["google", "apple"].map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={busy || disabled || !options?.[provider]}
            title={
              options?.[provider]
                ? `Continue with ${provider}`
                : "Available after the project owner connects this sign-in provider"
            }
            onClick={() => authenticate(provider)}
          >
            <span
              className={provider === "google" ? "gs-verify__google" : ""}
              aria-hidden="true"
            >
              {provider === "google" ? (
                "G"
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  width="17"
                  height="17"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M16.4 2c.1 1.5-.5 2.6-1.2 3.4-.8.9-2 1.5-3.2 1.4-.1-1.4.5-2.6 1.3-3.4.8-.8 2-1.4 3.1-1.4ZM20.6 17.8c-.5 1.1-.8 1.6-1.4 2.5-.8 1.2-1.9 2.7-3.3 2.7-1.2 0-1.5-.8-3.2-.8s-2 .8-3.2.8c-1.4 0-2.4-1.4-3.3-2.6C3.8 17 3 11.9 5.1 9.1c1.1-1.4 2.7-2.2 4.2-2.2 1.4 0 2.3.8 3.4.8 1 0 1.7-.8 3.4-.8 1.3 0 2.8.7 3.9 2-3.4 1.9-2.8 6.8.6 8.9Z" />
                </svg>
              )}
            </span>
            {provider === "google" ? "Google" : "Apple"}
            {options && !options[provider] && <small>Setup needed</small>}
          </button>
        ))}
      </div>
      {!options && !error && (
        <p className="gs-register__hint" role="status">
          Checking available sign-in methods…
        </p>
      )}
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
    </div>
  );
}
