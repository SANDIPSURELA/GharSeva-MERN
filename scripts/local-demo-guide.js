import services from "../seed-data/services.js";
import { demoProviders, demoPeople } from "../seed-data/demo-accounts.js";
import { mkdir, appendFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
export const localGuidePath = fileURLToPath(
  new URL("../.test-tmp/demo-accounts.local.md", import.meta.url),
);
export const newDemoPasswords = () =>
  Object.fromEntries(
    ["customer", "provider", "admin"].map((role) => [
      role,
      process.env["SEED_" + role.toUpperCase() + "_PASSWORD"] ||
        "Demo7!" + randomBytes(18).toString("base64url"),
    ]),
  );
export function demoDefinitions({ testOnlyContacts = false } = {}) {
  return [
    ...demoPeople,
    ...demoProviders.map((p) => ({ ...p, role: "provider" })),
  ].map((p) =>
    testOnlyContacts
      ? {
          ...p,
          email: p.id + "@example.test",
          ...(p.id.startsWith("ahm-")
            ? {
                bio:
                  "Fictional classroom " +
                  services
                    .find((c) => c.id === p.serviceId)
                    .name.toLowerCase() +
                  " profile. " +
                  services.find((c) => c.id === p.serviceId).description +
                  ". Agree on scope and any additional materials before work.",
                skills: [
                  services.find((c) => c.id === p.serviceId).name,
                  "Residential visits",
                  "Scope agreed before work",
                ],
              }
            : {}),
        }
      : p,
  );
}
export async function writeLocalDemoGuide(
  report,
  passwords,
  { database, testOnlyContacts = false, fixture = false } = {},
) {
  const guidePath = fixture
    ? fileURLToPath(
        new URL(
          "../.test-tmp/catalog-fixture-accounts.local.md",
          import.meta.url,
        ),
      )
    : localGuidePath;
  const created = report.filter(
    (r) => r.action === "ADD ACCOUNT" && r.created === true,
  );
  if (!created.length) return null;
  await mkdir(fileURLToPath(new URL("../.test-tmp/", import.meta.url)), {
    recursive: true,
  });
  let exists = true;
  try {
    await access(guidePath);
  } catch {
    exists = false;
  }
  const definitions = demoDefinitions({ testOnlyContacts });
  const intro =
    "# Private local classroom demo accounts\n\nIgnored local file. Fictional accounts only. Generated passwords are stored here, not printed in logs or committed. Existing account passwords are never read/reset. The normal password then OTP flow still applies. Classroom codes are allowed only in explicit non-production demo mode; hosted email OTP requires an operator-controlled stored inbox. example.test addresses cannot receive real mail.\n";
  const rows = created
    .map((r) => {
      const p = definitions.find((p) => p.id === r.id);
      return (
        "| " +
        [
          p.role,
          p.email,
          p.city,
          p.serviceId || "—",
          passwords[p.role],
          process.env["SEED_" + p.role.toUpperCase() + "_PASSWORD"]
            ? "SEED_" + p.role.toUpperCase() + "_PASSWORD at creation"
            : "Generated for this isolated run",
        ].join(" | ") +
        " |"
      );
    })
    .join("\n");
  await appendFile(
    guidePath,
    (exists ? "" : intro) +
      "\n## Created " +
      new Date().toISOString() +
      "\n\nDatabase: " +
      (fixture
        ? "IN-MEMORY TEST FIXTURE ONLY (not a running MongoDB or browser login): "
        : "") +
      database +
      "\n\n| Role | Login email | City | Categories | Local password | Password source |\n| --- | --- | --- | --- | --- | --- |\n" +
      rows +
      "\n",
    { mode: 0o600 },
  );
  return guidePath;
}
