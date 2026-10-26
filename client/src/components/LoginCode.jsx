import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";
import { api } from "../api";

export function LoginCode({
  challenge: initial,
  onVerified,
  onBack,
  endpoint = "/auth/login",
  submitLabel = "Verify & sign in",
  backLabel = "Back / change account",
}) {
  const [challenge, setChallenge] = useState(initial);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const codeRef = useRef(null),
    errorRef = useRef(null),
    lock = useRef(false);
  const [nextSend, setNextSend] = useState(
    Date.now() + initial.retryAfter * 1000,
  );
  const seconds = Math.max(0, Math.ceil((nextSend - now) / 1000));
  const expired = now >= new Date(challenge.expiresAt).getTime();
  const proofExpired =
    now >= new Date(challenge.passwordProofExpiresAt).getTime();
  useEffect(() => {
    codeRef.current?.focus();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const act = async (name, fn) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy("");
    }
  };
  return (
    <div className="gs-login-code" aria-busy={Boolean(busy)}>
      <h2>Check your email</h2>
      <p className="gs-login-code__destination">
        Enter the six-digit code sent to{" "}
        <strong>{challenge.destination}</strong>.
      </p>
      {challenge.mode === "demo" && (
        <p className="gs-login-code__demo" role="status">
          <strong>Classroom demo — no email sent.</strong>
          {challenge.demoCode && <span>Demo code: {challenge.demoCode}</span>}
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
      <p id="gs-login-code-expiry" role="status" className="gs-register__hint">
        {proofExpired
          ? "Your sign-in request expired. Go back and enter your password again."
          : expired
            ? "Your code expired. Request another code below."
            : `Your code expires at ${new Date(challenge.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Never share it.`}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          act("verify", async () =>
            onVerified(
              await api(endpoint + "/verify", {
                method: "POST",
                noReauth: true,
                body: { code },
              }),
            ),
          );
        }}
      >
        <div className="gs-signin__field">
          <label htmlFor="gs-login-code">Six-digit code</label>
          <input
            id="gs-login-code"
            className="gs-login-code__input"
            ref={codeRef}
            name="one-time-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            aria-describedby="gs-login-code-expiry"
            disabled={Boolean(busy) || proofExpired}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            onPaste={(event) => {
              const digits = event.clipboardData
                .getData("text")
                .replace(/\D/g, "")
                .slice(0, 6);
              if (digits) {
                event.preventDefault();
                setCode(digits);
              }
            }}
          />
        </div>
        <button
          type="submit"
          className="gs-signin__submit"
          disabled={Boolean(busy) || expired || code.length !== 6}
        >
          {busy === "verify" ? (
            <LoaderCircle
              className="gs-signin__spinner"
              size={18}
              aria-hidden="true"
            />
          ) : (
            <ShieldCheck size={18} aria-hidden="true" />
          )}
          {busy === "verify" ? "Verifying…" : submitLabel}
        </button>
      </form>
      <div className="gs-login-code__actions">
        <button
          type="button"
          disabled={Boolean(busy) || seconds > 0 || proofExpired}
          onClick={() =>
            act("resend", async () => {
              // Drop the previous displayed demo code even if the next delivery fails.
              setChallenge((current) => ({ ...current, demoCode: undefined }));
              setCode("");
              setNextSend(Date.now() + 60000);
              const result = await api(endpoint + "/resend", {
                method: "POST",
                noReauth: true,
                body: {},
              });
              setChallenge(result);
              setNextSend(Date.now() + result.retryAfter * 1000);
              codeRef.current?.focus();
            })
          }
        >
          {busy === "resend"
            ? "Sending…"
            : seconds
              ? `Resend in ${seconds}s`
              : "Resend code"}
        </button>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => act("back", onBack)}
        >
          <ArrowLeft size={15} aria-hidden="true" /> {backLabel}
        </button>
      </div>
    </div>
  );
}
