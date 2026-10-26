import mongoose from "mongoose";

// Parse with the actual MongoDB driver: URL() rejects valid replica-set authorities.
export function paymentMigrationOptions(args, uri) {
  const confirmations = args.filter((a) => a.startsWith("--confirm-db="));
  if (
    args.some(
      (a) =>
        !["--apply", "--dry-run"].includes(a) && !a.startsWith("--confirm-db="),
    ) ||
    new Set(args).size !== args.length ||
    confirmations.length > 1 ||
    (args.includes("--apply") && args.includes("--dry-run"))
  )
    throw Error(
      "Use --dry-run (default), or --apply --confirm-db=EXACT_DATABASE_NAME.",
    );
  if (!uri) throw Error("Configure the existing MONGODB_URI in server/.env.");
  let database;
  try {
    // Require an explicit path, rather than silently accepting the driver's test default.
    const authorityAndPath = uri.split("://")[1]?.split("?")[0];
    if (!authorityAndPath?.includes("/") || !authorityAndPath.split("/")[1])
      throw Error();
    const client = new mongoose.mongo.MongoClient(uri);
    database = client.options.dbName;
    if (!database || ["admin", "local", "config"].includes(database))
      throw Error();
  } catch {
    throw Error(
      "MONGODB_URI must contain a valid, explicit application database name. Credentials are not displayed.",
    );
  }
  const apply = args.includes("--apply"),
    confirmedDatabase = confirmations[0]?.slice("--confirm-db=".length);
  if (apply && confirmedDatabase !== database)
    throw Error(
      "Apply requires --confirm-db=EXACT_DATABASE_NAME matching the URI database. No connection or write was attempted.",
    );
  if (!apply && confirmedDatabase !== undefined)
    throw Error("Database confirmation is only used with --apply.");
  return { apply, database, confirmedDatabase };
}
export function requireConfirmedPaymentDatabase(actual, confirmed) {
  if (!actual || actual !== confirmed)
    throw Error(
      "Payment migration database confirmation is missing or does not match the connected database. No changes made.",
    );
}
