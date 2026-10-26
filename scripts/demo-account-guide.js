import { demoProviders, demoPeople } from "../seed-data/demo-accounts.js";
import services from "../seed-data/services.js";
export const temporaryPasswords = {
  customer: "Customer123",
  provider: "Provider123",
  admin: "Admin12345",
};
export const accountRows = () =>
  [
    ...demoPeople,
    ...demoProviders.map((p) => ({ ...p, role: "provider" })),
  ].map((p) => ({
    Name: p.name,
    Service: p.serviceId
      ? services.find((s) => s.id === p.serviceId).name
      : p.role,
    City: p.city,
    Email: p.email,
    Mobile: p.mobile,
    "Temporary demo password": temporaryPasswords[p.role],
  }));
export function printDemoAccounts() {
  console.log(
    "TEMPORARY CLASSROOM ACCOUNTS (npm.cmd run demo). Email OR mobile, then password + displayed email OTP.",
  );
  console.table(accountRows());
  console.log(
    "Persistent database: passwords are those chosen at account creation (SEED_*_PASSWORD for new expansion accounts). They may have changed. This list does not read hashes, recover or reset passwords. All profiles are fictional.",
  );
}
