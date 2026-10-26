import { printDemoAccounts } from "./demo-account-guide.js";
if (process.argv.slice(2).some((arg) => arg !== "--write"))
  throw Error("Use demo:accounts or demo:accounts -- --write.");
printDemoAccounts();
if (process.argv.includes("--write")) await import("./write-demo-guide.js");
