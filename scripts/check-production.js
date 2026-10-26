import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { inspectEnvironment } from "../server/src/deployment.js";
dotenv.config({
  path: fileURLToPath(new URL("../server/.env", import.meta.url)),
});
const report = inspectEnvironment({ ...process.env, NODE_ENV: "production" });
for (const error of report.errors) console.error(`FAIL: ${error}`);
for (const warning of report.warnings) console.warn(`SETUP: ${warning}`);
if (report.errors.length) process.exitCode = 1;
else
  console.log(
    "Production configuration checks passed. This does not test database access, message delivery or gateway credentials.",
  );
