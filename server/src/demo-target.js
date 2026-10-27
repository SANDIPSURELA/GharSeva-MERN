import mongoose from "mongoose";
import { paymentMigrationOptions } from "./payment-migration-target.js";
import { demoDelivery } from "./identity-services.js";
export function demoExpansionTarget(args, uri) {
  const target = paymentMigrationOptions(args, uri);
  if (process.env.NODE_ENV === "production")
    throw Error("Demo expansion is forbidden in production.");
  if (target.apply) {
    const options = new mongoose.mongo.MongoClient(uri).options;
    if (
      options.srvHost ||
      !options.hosts?.length ||
      options.hosts.some(
        (host) => !["127.0.0.1", "::1", "localhost"].includes(host.host),
      ) ||
      !/^gharseva_(demo|test)_[a-zA-Z0-9_-]+$/.test(target.database)
    )
      throw Error(
        "Demo writes require a loopback-only isolated gharseva_demo_* or gharseva_test_* database. Shared/hosted data is forbidden.",
      );
    if (!demoDelivery())
      throw Error(
        "Demo apply requires AUTH_DELIVERY_MODE=test and GHARSEVA_DEMO=true in non-production only.",
      );
  }
  return target;
}
