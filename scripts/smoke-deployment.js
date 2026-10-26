import assert from "node:assert/strict";
const target = process.argv[2];
try {
  const url = new URL(target);
  if (
    url.username ||
    url.password ||
    url.origin !== target ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new Error("Pass one origin without a trailing slash or credentials.");
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("Use HTTPS for a hosted deployment.");
  const get = async (path) =>
    fetch(`${url.origin}${path}`, {
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
  for (const path of ["/api/health/live", "/api/health"]) {
    const r = await get(path);
    assert.equal(r.status, 200, `${path}: service is not ready`);
    assert.equal((await r.json()).ok, true, `${path}: unhealthy response`);
    assert.match(r.headers.get("cache-control") || "", /no-store/);
  }
  for (const path of ["/", "/login", "/register", "/admin/login"]) {
    const r = await get(path);
    assert.equal(r.status, 200, `${path}: page unavailable`);
    assert.match(r.headers.get("content-type") || "", /text\/html/);
    assert.ok(r.headers.get("content-security-policy"), "Missing CSP");
    if (url.protocol === "https:")
      assert.ok(r.headers.get("strict-transport-security"), "Missing HSTS");
    const html = await r.text();
    assert.match(html, /id="root"/, "React root missing");
    const asset = html.match(/src="(\/assets\/[^"?]+\.js)"/)?.[1];
    assert.ok(asset, "Built JavaScript asset missing");
    const js = await get(asset);
    assert.equal(js.status, 200, "JavaScript asset unavailable");
    assert.match(js.headers.get("content-type") || "", /javascript/);
  }
  for (const path of [
    "/api/nonexistent-deploy-check",
    "/assets/nonexistent-deploy-check.js",
  ]) {
    const r = await get(path);
    assert.equal(r.status, 404, "Missing resource must not return the SPA");
  }
  const privatePage = await get("/api/auth/me");
  assert.equal(
    privatePage.status,
    401,
    "An anonymous session must not expose an account",
  );
  console.log(
    "Deployment smoke check passed: database readiness, page refresh routes, built assets, headers and anonymous session boundary. No records were created or changed.",
  );
} catch (e) {
  console.error(`Deployment check failed: ${e.message}`);
  console.error(
    "Usage: npm run deploy:smoke -- https://YOUR-SERVICE.onrender.com",
  );
  process.exitCode = 1;
}
