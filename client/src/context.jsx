import { clearDraftReference } from "../../shared/assistant-client-state.js";
import { canonicalCity } from "../../shared/cities.js";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { api, sessionClient, authEvents } from "./api";
import {
  openSessionChannel,
  bindSessionLifecycle,
} from "../../shared/session-client.js";
import { clearExternalIdentity } from "../../shared/external-auth.js";
import { SessionControls } from "./components/SessionControls";
const Context = createContext();
export function AppProvider({ children }) {
  const [user, rawSetUser] = useState(null),
    [loading, setLoading] = useState(true),
    [providers, setProviders] = useState([]),
    [categories, setCategories] = useState([]),
    [discoveryLoading, setDiscoveryLoading] = useState(true),
    [discoveryError, setDiscoveryError] = useState(""),
    [config, setConfig] = useState({
      bookingEnabled: true,
      providerRegistration: true,
    }),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [comparison, setComparison] = useState(() => {
    try {
      const ids = JSON.parse(sessionStorage.getItem("gs_compare") || "[]");
      return Array.isArray(ids)
        ? ids.filter((x) => typeof x === "string").slice(0, 3)
        : [];
    } catch {
      return [];
    }
  });
  const [selectedCity, rawSetCity] = useState("");
  const [facultyDemo, rawSetFacultyDemo] = useState(false);
  const facultyRef = useRef(false);
  const setFacultyDemo = useCallback((value) => {
    facultyRef.current = value === true;
    cityRequest.current++;
    setProviders([]);
    setComparison([]);
    setDiscoveryLoading(true);
    rawSetFacultyDemo(value === true);
  }, []);
  const cityRef = useRef(""),
    cityRequest = useRef(0),
    defaultRef = useRef("");
  const setSelectedCity = useCallback((value) => {
    const city = canonicalCity(value);
    if (city === cityRef.current) return;
    cityRef.current = city;
    cityRequest.current++;
    setProviders([]);
    setDiscoveryLoading(true);
    setDiscoveryError("");
    setComparison([]);
    rawSetCity(city);
    // Guest continuation is a minimal expiring public selection. The assistant
    // revalidates it against the signed-in customer city after authentication.
  }, []);
  useEffect(() => {
    const key = user ? user._id + ":" + (user.city || "") : "";
    if (key !== defaultRef.current) {
      const linkedCity =
        !defaultRef.current && window.location.pathname === "/services"
          ? canonicalCity(
              new URLSearchParams(window.location.search).get("city"),
            )
          : "";
      defaultRef.current = key;
      setSelectedCity(linkedCity || user?.city || "");
    }
  }, [user?._id, user?.city, setSelectedCity]);
  const refresh = useCallback(async () => {
    const serial = ++cityRequest.current;
    const city = cityRef.current;
    setDiscoveryLoading(true);
    setDiscoveryError("");
    try {
      const [p, c, g] = await Promise.all([
        api(
          `/providers?city=${encodeURIComponent(city)}${facultyRef.current ? "&facultyDemo=1" : ""}`,
        ),
        api("/categories"),
        api("/config"),
      ]);
      if (serial !== cityRequest.current) return;
      if (!Array.isArray(p) || !Array.isArray(c) || !g || typeof g !== "object")
        throw new Error(
          "Service discovery returned an unreadable response. Retry listings.",
        );
      setProviders(p);
      setCategories(c);
      setConfig(g);
      setError("");
    } catch (e) {
      if (serial !== cityRequest.current) return;
      setProviders([]);
      setCategories([]);
      setDiscoveryError(e.message || "Service discovery is unavailable.");
    } finally {
      if (serial === cityRequest.current) setDiscoveryLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!loading && !sessionClient.locked) refresh();
  }, [selectedCity, facultyDemo, refresh, loading]);
  const userRef = useRef(null),
    channelRef = useRef(null),
    checkRef = useRef(0),
    reauthRef = useRef(null),
    logoutRef = useRef(false);
  const [session, setSession] = useState(null),
    [epoch, setEpoch] = useState(0),
    [reauth, setReauth] = useState(false),
    [logoutFailed, setLogoutFailed] = useState(false);
  const clearPrivate = useCallback(() => {
    clearExternalIdentity().catch(() => {});
    userRef.current = null;
    rawSetUser(null);
    setToast("");
    setEpoch((e) => e + 1);
    reauthRef.current?.reject(
      new Error("Session changed. The action was cancelled."),
    );
    reauthRef.current = null;
    setReauth(false);
  }, []);
  const checkIdentity = useCallback(
    async (hard = false) => {
      if (logoutRef.current) return;
      const serial = ++checkRef.current,
        previous = sessionClient.context;
      document.documentElement.classList.add("gs-session-checking");
      try {
        const account = await api("/auth/me", {
          recheck: true,
          noReauth: true,
        });
        if (serial !== checkRef.current) return;
        if (!sessionClient.context || !sessionClient.meta)
          throw new Error(
            "Restart the API to enable revocable sessions, then retry connection.",
          );
        if (hard) {
          window.location.reload();
          return;
        }
        sessionClient.locked = false;
        userRef.current = account;
        rawSetUser(account);
        setSession(sessionClient.meta);
        setError("");
        return true;
      } catch (e) {
        if (
          serial !== checkRef.current ||
          e.code === "STALE_RESPONSE" ||
          e.name === "AbortError"
        )
          return;
        if (e.code === "SESSION_CONTEXT_CHANGED" || hard) {
          window.location.reload();
          return;
        }
        if (e.status === 401) {
          if (previous) {
            sessionClient.invalidate("expired");
            clearPrivate();
            channelRef.current?.send();
          }
          await api("/auth/logout", {
            method: "POST",
            recheck: true,
            noReauth: true,
          }).catch((error) => {
            if (error.code === "SESSION_CONTEXT_CHANGED")
              window.location.reload();
          });
          if (serial !== checkRef.current) return;
          if (previous) {
            window.location.reload();
            return;
          }
          sessionClient.locked = false;
          userRef.current = null;
          rawSetUser(null);
        } else {
          sessionClient.locked = true;
          clearPrivate();
          setError(
            e.message ||
              "Session could not be checked. Private screens are locked. Retry connection.",
          );
          return;
        }
      } finally {
        if (serial === checkRef.current) {
          setLoading(false);
          if (!sessionClient.locked)
            document.documentElement.classList.remove("gs-session-checking");
        }
      }
    },
    [clearPrivate],
  );
  const setUser = useCallback(
    (value) => {
      if (sessionClient.locked) return;
      const next = typeof value === "function" ? value(userRef.current) : value;
      if (!next) {
        sessionClient.invalidate("signed-out");
        channelRef.current?.send();
        window.location.reload();
        return;
      }
      if (!userRef.current) {
        setLoading(true);
        channelRef.current?.send();
        checkIdentity();
        return;
      }
      if (
        next._id !== userRef.current._id ||
        next.role !== userRef.current.role
      ) {
        sessionClient.invalidate();
        checkIdentity(true);
        return;
      }
      userRef.current = next;
      rawSetUser(next);
    },
    [checkIdentity],
  );
  useEffect(() => {
    const invalidated = () => {
      document.documentElement.classList.add("gs-session-checking");
      clearPrivate();
    };
    const metadata = (e) => setSession(e.detail);
    const recheck = () => checkIdentity(true);
    const forbidden = () => {
      if (!sessionClient.locked) checkIdentity();
    };
    authEvents.addEventListener("invalidated", invalidated);
    authEvents.addEventListener("metadata", metadata);
    authEvents.addEventListener("recheck", recheck);
    authEvents.addEventListener("forbidden", forbidden);
    channelRef.current = openSessionChannel(() => {
      sessionClient.invalidate();
      checkIdentity(true);
    });
    sessionClient.reauthenticate = () => {
      if (reauthRef.current)
        return Promise.reject(
          new Error(
            "Finish the current security check, then retry this action.",
          ),
        );
      return new Promise((resolve, reject) => {
        reauthRef.current = { resolve, reject };
        setReauth(true);
      });
    };
    const cleanupLifecycle = bindSessionLifecycle({
      window,
      document,
      revalidate: () => {
        if (!sessionClient.locked) checkIdentity();
      },
      suspend: () => {
        document.documentElement.classList.add("gs-session-checking");
        sessionClient.epoch++;
        for (const c of sessionClient.controllers) c.abort();
      },
    });
    checkIdentity();
    return () => {
      channelRef.current?.close();
      sessionClient.reauthenticate = null;
      authEvents.removeEventListener("invalidated", invalidated);
      authEvents.removeEventListener("metadata", metadata);
      authEvents.removeEventListener("recheck", recheck);
      authEvents.removeEventListener("forbidden", forbidden);
      cleanupLifecycle();
    };
  }, [checkIdentity, clearPrivate, refresh]);
  const finishReauth = useCallback((ok) => {
    const pending = reauthRef.current;
    reauthRef.current = null;
    setReauth(false);
    ok
      ? pending?.resolve()
      : pending?.reject(
          new Error("Security check cancelled. No action was retried."),
        );
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    sessionStorage.setItem("gs_compare", JSON.stringify(comparison));
  }, [comparison]);
  const toggleCompare = (id) => {
    setComparison((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      if (current.length >= 3) {
        setToast("Compare up to three professionals at a time.");
        return current;
      }
      return [...current, id];
    });
  };
  const logout = async () => {
    clearDraftReference(sessionStorage);
    try {
      sessionStorage.removeItem("gs_assistant_public_selection");
    } catch {}
    logoutRef.current = true;
    sessionClient.invalidate("logout");
    const firebaseCleanup = clearExternalIdentity();
    clearPrivate();
    try {
      await api("/auth/logout", { method: "POST" });
      await firebaseCleanup;
      channelRef.current?.send();
      window.location.reload();
    } catch {
      setLogoutFailed(true);
      setLoading(false);
      setToast(
        "Logout could not be confirmed. Private screens are locked. Retry sign out.",
      );
    }
  };
  return (
    <Context.Provider
      value={{
        user,
        setUser,
        loading,
        selectedCity,
        setSelectedCity,
        facultyDemo,
        setFacultyDemo,
        providers: providers.filter(
          (p) => canonicalCity(p.city) === selectedCity,
        ),
        categories,
        discoveryLoading,
        discoveryError,
        config,
        error,
        refresh,
        toast,
        setToast,
        comparison,
        toggleCompare,
        setComparison,
        logout,
        session,
        finishReauth,
        checkIdentity,
      }}
    >
      <div key={epoch} className="gs-session-root">
        {children}
      </div>
      <SessionControls reauth={reauth} logoutFailed={logoutFailed} />
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
