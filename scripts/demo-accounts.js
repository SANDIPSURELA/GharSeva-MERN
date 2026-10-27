import { existsSync } from "node:fs";
import { demoDefinitions, localGuidePath } from "./local-demo-guide.js";
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--write"))
  throw Error("Use demo:accounts or the legacy --write flag.");
const definitions = demoDefinitions({ testOnlyContacts: true });
console.log(
  "Fictional classroom definitions only, not a query of saved accounts:",
  definitions.length,
);
console.log(
  "Ahmedabad provider definitions:",
  definitions.filter((p) => p.role === "provider" && p.city === "Ahmedabad")
    .length,
);
if (existsSync(localGuidePath))
  console.log(
    "Newly created local account guide (ignored; credentials are not printed):",
    localGuidePath,
  );
else
  console.log(
    "No active local account guide exists. A successful npm.cmd run demo or guarded isolated demo:expand --apply creates it.",
  );
if (args.includes("--write"))
  console.log(
    "Static credential exports are retired. Only successful account creation writes the ignored local guide.",
  );
console.log(
  "Real hosted OTP needs operator-controlled stored inboxes. Reserved example.test fixtures cannot receive real email.",
);
