import { useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { api, sessionClient, authEvents } from "../api";
import { Modal } from "./UI";
import { LoginCode } from "./LoginCode";
import "../pages/Login.css";
import "./SessionControls.css";
function useSecurityDialog(panel) {
  useEffect(() => {
    const dialog = panel.current?.closest('[role="dialog"]'),
      previous = document.activeElement;
    panel.current?.querySelector("input,button")?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const a = [
        ...dialog.querySelectorAll(
          "button:not([disabled]),input:not([disabled])",
        ),
      ].filter((e) => e.getClientRects().length);
      if (e.shiftKey && document.activeElement === a[0]) {
        e.preventDefault();
        a.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === a.at(-1)) {
        e.preventDefault();
        a[0]?.focus();
      }
    };
    dialog?.addEventListener("keydown", trap);
    return () => {
      dialog?.removeEventListener("keydown", trap);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
}
function Reauthentication() {
  const { finishReauth } = useApp(),
    [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false),
    [pending, setPending] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const panel = useRef(null),
    lock = useRef(false);
  useSecurityDialog(panel);
  const cancel = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await api("/auth/reauth/pending", { method: "DELETE", noReauth: true });
    } catch {
    } finally {
      finishReauth(false);
    }
  };
  const back = async () => {
    await api("/auth/reauth/pending", { method: "DELETE", noReauth: true });
    setPending(null);
  };
  return (
    <Modal
      title="Confirm administrator access"
      onClose={() => {
        if (!busy) cancel();
      }}
    >
      <div ref={panel} className="gs-session-security">
        <p>
          Confirm your password and registered-email code. This authorises
          sensitive admin actions for a short period in this session.
        </p>
        {error && (
          <p role="alert" className="gs-signin__error">
            {error}
          </p>
        )}
        {pending ? (
          <LoginCode
            challenge={pending}
            endpoint="/auth/reauth"
            submitLabel="Verify & continue"
            backLabel="Back to password"
            onBack={back}
            onVerified={() => finishReauth(true)}
          />
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                const p = await api("/auth/reauth", {
                  method: "POST",
                  noReauth: true,
                  body: { password },
                });
                setPassword("");
                setPending(p);
              } catch (e) {
                setError(e.message);
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <label>
              Administrator password
              <div className="gs-session-password">
                <input
                  required
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="text-link"
                  aria-pressed={visible}
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <button className="btn full" disabled={busy}>
              {busy ? "Sending code..." : "Continue to email code"}
            </button>
          </form>
        )}
        <button className="text-link" disabled={busy} onClick={cancel}>
          Cancel action
        </button>
      </div>
    </Modal>
  );
}
export function SessionControls({ reauth, logoutFailed }) {
  const { user, session, logout } = useApp(),
    [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    last = useRef(0);
  const [dismissedDeadline, setDismissedDeadline] = useState(null);
  const admin = user?.role === "admin",
    deadline =
      user && session
        ? Math.min(
            new Date(session.expiresAt).getTime(),
            admin ? new Date(session.idleExpiresAt).getTime() : Infinity,
          )
        : Infinity;
  const stay = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/auth/session/activity", { method: "POST", body: {} });
      last.current = Date.now();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!user) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const activity = (e) => {
      if (
        !admin ||
        !e.isTrusted ||
        document.visibilityState !== "visible" ||
        !document.hasFocus() ||
        Date.now() - last.current < 45000 ||
        sessionClient.locked
      )
        return;
      last.current = Date.now();
      api("/auth/session/activity", { method: "POST", body: {} }).catch(
        () => {},
      );
    };
    window.addEventListener("pointerdown", activity, { passive: true });
    window.addEventListener("keydown", activity, { passive: true });
    return () => {
      clearInterval(tick);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
    };
  }, [admin, !!user]);
  useEffect(() => {
    if (!user) return;
    const check = setInterval(() => {
      if (!sessionClient.locked)
        api("/auth/session", { noReauth: true }).catch(() => {});
    }, 30000);
    return () => clearInterval(check);
  }, [!!user]);
  useEffect(() => {
    if (user && now >= deadline && !sessionClient.locked) {
      sessionClient.invalidate("expired");
      authEvents.dispatchEvent(new CustomEvent("recheck"));
    }
  }, [!!user, deadline, now]);
  if (logoutFailed)
    return (
      <div className="gs-session-retry" role="alert">
        Logout could not be confirmed. Private screens are locked.{" "}
        <button className="btn small" onClick={logout}>
          Retry sign out
        </button>
        <button className="text-link" onClick={() => window.location.reload()}>
          Reload account check
        </button>
      </div>
    );
  if (reauth) return <Reauthentication />;
  if (
    admin &&
    deadline - now <= (session?.warningSeconds || 90) * 1000 &&
    deadline > now &&
    deadline !== dismissedDeadline
  )
    return (
      <IdleWarning
        session={session}
        deadline={deadline}
        now={now}
        error={error}
        busy={busy}
        onStay={stay}
        onLogout={logout}
        onDismiss={() => setDismissedDeadline(deadline)}
      />
    );
  return null;
}

function IdleWarning({
  session,
  deadline,
  now,
  error,
  busy,
  onStay,
  onLogout,
  onDismiss,
}) {
  const panel = useRef(null);
  useSecurityDialog(panel);
  return (
    <Modal title="Administrator session ending" onClose={onDismiss}>
      <div ref={panel} className="gs-session-security">
        <p role="status">
          Your session expires in{" "}
          {Math.max(0, Math.ceil((deadline - now) / 1000))} seconds without
          activity.
        </p>
        <p>
          The absolute sign-in deadline is{" "}
          {new Date(session.expiresAt).toLocaleTimeString()}. Staying signed in
          cannot extend it.
        </p>
        {error && <p role="alert">{error}</p>}
        <button className="btn full" disabled={busy} onClick={onStay}>
          {busy ? "Checking..." : "Stay signed in"}
        </button>
        <button className="text-link" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </Modal>
  );
}
