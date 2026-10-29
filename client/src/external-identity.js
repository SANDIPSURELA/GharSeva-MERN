import { api, sessionClient } from "./api";
import { exchangeExternalIdentity } from "../../shared/external-auth.js";
export function signInExternal(options, provider, details) {
  const epoch = sessionClient.epoch,
    context = sessionClient.context;
  return exchangeExternalIdentity({
    options,
    provider,
    details,
    request: api,
    active: () =>
      !sessionClient.locked &&
      epoch === sessionClient.epoch &&
      context === sessionClient.context,
  });
}
