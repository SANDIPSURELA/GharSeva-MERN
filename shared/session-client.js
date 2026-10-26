// Session context is a non-authenticating nonce kept only in memory. Cookies
// remain HttpOnly. A locked page cannot send a new protected mutation.
export class SessionClient {
  constructor(fetcher, notify = () => {}) {
    this.fetcher = fetcher;
    this.notify = notify;
    this.context = null;
    this.meta = null;
    this.epoch = 0;
    this.locked = false;
    this.controllers = new Set();
    this.reauthenticate = null;
  }
  invalidate(reason = "changed") {
    this.locked = true;
    this.epoch++;
    for (const c of this.controllers) c.abort();
    this.controllers.clear();
    this.notify("invalidated", reason);
  }
  async request(path, options = {}) {
    const { recheck = false, noReauth = false, ...request } = options;
    if (this.locked && !recheck && path !== "/auth/logout")
      throw Object.assign(
        new Error("Your browser session changed. Recheck before continuing."),
        { code: "STALE_SESSION" },
      );
    const epoch = this.epoch,
      context = this.context,
      controller = new AbortController();
    this.controllers.add(controller);
    const isForm =
      typeof FormData !== "undefined" && request.body instanceof FormData;
    let response;
    try {
      response = await this.fetcher(`/api${path}`, {
        ...request,
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "X-GharSeva": "1",
          ...(request.body && !isForm
            ? { "Content-Type": "application/json" }
            : {}),
          ...request.headers,
          ...(context && !recheck ? { "X-GharSeva-Context": context } : {}),
        },
        body: request.body
          ? isForm
            ? request.body
            : JSON.stringify(request.body)
          : undefined,
      });
      const data = await response.json().catch(() => ({
        message:
          "Unexpected server response. Check that the backend is running.",
      }));
      if (epoch !== this.epoch)
        throw Object.assign(
          new Error("Discarded a response from an earlier session."),
          { code: "STALE_RESPONSE" },
        );
      let meta;
      try {
        meta = JSON.parse(response.headers.get("X-GharSeva-Session") || "null");
      } catch {}
      if (meta?.context) {
        if (context && meta.context !== context) {
          this.invalidate();
          if (!recheck) this.notify("recheck");
          throw Object.assign(
            new Error("The browser account changed. Reload before continuing."),
            { code: "SESSION_CONTEXT_CHANGED" },
          );
        }
        if (
          context ||
          recheck ||
          /^\/auth\/(login\/verify|external|register)/.test(path)
        ) {
          this.context = meta.context;
          this.meta = meta;
          this.notify("metadata", meta);
        }
      }
      if (!response.ok) {
        if (data.code === "SESSION_CONTEXT_CHANGED") {
          this.invalidate();
          if (!recheck) this.notify("recheck");
        } else if (
          response.status === 401 &&
          !recheck &&
          (data.code === "SESSION_EXPIRED" ||
            data.code === "LEGACY_SESSION" ||
            !/^\/auth\/(login|reauth|recover|verify)/.test(path))
        ) {
          this.invalidate("expired");
          this.notify("recheck");
        } else if (
          data.code === "REAUTH_REQUIRED" &&
          !noReauth &&
          this.reauthenticate
        ) {
          await this.reauthenticate();
          if (this.epoch !== epoch || this.context !== context || this.locked)
            throw new Error("Session changed. The action was not retried.");
          return this.request(path, { ...options, noReauth: true });
        } else if (
          response.status === 403 &&
          !recheck &&
          !path.startsWith("/auth/")
        )
          this.notify("forbidden");
        throw Object.assign(new Error(data.message || "Request failed."), {
          status: response.status,
          code: data.code,
        });
      }
      return data;
    } finally {
      this.controllers.delete(controller);
    }
  }
}
export function openSessionChannel(
  receive,
  {
    Broadcast = globalThis.BroadcastChannel,
    storage,
    events = globalThis,
  } = {},
) {
  if (storage === undefined)
    try {
      storage = globalThis.localStorage;
    } catch {}
  const seen = new Set();
  let channel;
  try {
    if (Broadcast) channel = new Broadcast("gharseva-session");
  } catch {}
  const accept = (data) => {
    if (
      data?.type !== "invalidate" ||
      typeof data.nonce !== "string" ||
      seen.has(data.nonce)
    )
      return;
    seen.add(data.nonce);
    if (seen.size > 64) seen.delete(seen.values().next().value);
    receive();
  };
  if (channel) channel.onmessage = (e) => accept(e.data);
  const listener = (e) => {
    if (e.key === "gs_session_signal") {
      try {
        accept(JSON.parse(e.newValue));
      } catch {}
    }
  };
  events.addEventListener?.("storage", listener);
  return {
    send() {
      const data = {
        type: "invalidate",
        nonce: Math.random().toString(36).slice(2),
      };
      channel?.postMessage(data);
      try {
        storage?.setItem("gs_session_signal", JSON.stringify(data));
        storage?.removeItem("gs_session_signal");
      } catch {}
    },
    close() {
      channel?.close();
      events.removeEventListener?.("storage", listener);
    },
  };
}
export function bindSessionLifecycle({
  window: win,
  document: doc,
  revalidate,
  suspend,
}) {
  const focus = () => {
    if (doc.visibilityState === "visible") revalidate();
  };
  const show = (e) => {
    if (e.persisted) revalidate();
  };
  win.addEventListener("focus", focus);
  doc.addEventListener("visibilitychange", focus);
  win.addEventListener("pagehide", suspend);
  win.addEventListener("pageshow", show);
  return () => {
    win.removeEventListener("focus", focus);
    doc.removeEventListener("visibilitychange", focus);
    win.removeEventListener("pagehide", suspend);
    win.removeEventListener("pageshow", show);
  };
}
