import { sessionFetch } from "./session-fixture.js";
// Test fixture only: exercise both HTTP steps. Cooldown cleanup avoids sleeping
// across independent fixture sign-ins; raw policy tests do not use this helper.
import { createHash } from "node:crypto";
import { User, ContactThrottle } from "../src/models.js";

export async function fixtureLogin(base, credentials, headers = {}) {
  const user = await User.findOne(
    credentials.identifier.includes("@")
      ? { email: credentials.identifier.toLowerCase() }
      : {
          mobile: credentials.identifier
            .replace(/\D/g, "")
            .replace(/^91(?=\d{10}$)/, ""),
        },
  );
  if (user)
    await ContactThrottle.deleteOne({
      _id:
        "password-login:" +
        createHash("sha256").update(String(user._id)).digest("hex"),
    });
  const first = await sessionFetch(base + "/auth/login", {
    method: "POST",
    headers: {
      "X-GharSeva": "1",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(credentials),
  });
  const data = await first.json();
  if (first.status !== 202)
    return { status: first.status, data, cookies: [], jar: new Map() };
  const pending = first.headers
    .getSetCookie()
    .find((c) => c.startsWith("gharseva_pending_login="))
    ?.split(";")[0];
  const verified = await sessionFetch(base + "/auth/login/verify", {
    method: "POST",
    headers: {
      "X-GharSeva": "1",
      "Content-Type": "application/json",
      ...headers,
      Cookie: pending,
    },
    body: JSON.stringify({ code: data.demoCode }),
  });
  const cookies = verified.headers.getSetCookie();
  const cookie = cookies
    .find((c) => c.startsWith("gharseva_session="))
    ?.split(";")[0];
  const jar = new Map(cookie ? [cookie.split("=")] : []);
  return {
    status: verified.status,
    data: await verified.json(),
    cookie,
    cookies,
    jar,
  };
}
