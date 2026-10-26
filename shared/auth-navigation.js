// Pure navigation policy shared with regression tests. All permissions still
// live on protected server APIs; a return path cannot change an account's role.
const roles = ["customer", "provider", "admin"];
export function safeReturnPath(requested) {
  if (
    typeof requested !== "string" ||
    requested.length > 2048 ||
    !requested.startsWith("/") ||
    requested.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(requested) ||
    /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(requested)
  )
    return undefined;
  try {
    const url = new URL(requested, "https://gharseva.invalid");
    if (url.origin !== "https://gharseva.invalid") return undefined;
    const path = url.pathname.replace(/\/+$/, "");
    if (
      !/^\/dashboard\/(customer|provider|admin)$/.test(path) &&
      !/^\/booking\/[a-f0-9]{24}$/i.test(path) &&
      !["/assistant", "/finder"].includes(path)
    )
      return undefined;
    return path + url.search + url.hash;
  } catch {
    return undefined;
  }
}
export function authDestination(user, requested) {
  if (!roles.includes(user?.role)) return "/login";
  const dashboard = `/dashboard/${user.role}`,
    safe = safeReturnPath(requested);
  if (!safe) return dashboard;
  const path = safe.split(/[?#]/)[0];
  if (
    path === dashboard ||
    (user.role === "customer" &&
      (/^\/booking\//.test(path) || ["/assistant", "/finder"].includes(path)))
  )
    return safe;
  return dashboard;
}
export function loginAliasState(state) {
  const from = safeReturnPath(state?.from);
  return from ? { from } : undefined;
}
