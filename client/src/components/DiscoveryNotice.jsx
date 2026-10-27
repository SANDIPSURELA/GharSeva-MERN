import { Link } from "react-router-dom";
import { useApp } from "../context";
import { discoveryState } from "../../../shared/discovery-state.js";
import { Empty } from "./UI";
export function DiscoveryNotice({ scope = "providers", resultCount, onClear }) {
  const {
    discoveryLoading,
    discoveryError,
    error,
    categories,
    providers,
    selectedCity,
    refresh,
  } = useApp();
  const kind = discoveryState({
    loading: discoveryLoading,
    error: discoveryError || error,
    categories,
    providers,
    city: selectedCity,
    resultCount,
    scope,
  });
  if (kind === "ready") return null;
  const copy = {
    loading: [
      "Loading services and professionals",
      "Please wait while we check the current catalog.",
    ],
    error: [
      "We couldn't load services",
      "The service request failed. Retry before choosing a professional.",
    ],
    "empty-catalog": [
      "No services are currently enabled",
      "Contact support about the service you need.",
    ],
    "select-city": [
      "Choose a city to see professionals",
      "Use the city selector above to find services in your area.",
    ],
    "empty-city": [
      "No professionals are listed in this city",
      "Try another supported city or ask support about this service.",
    ],
    "no-results": [
      "No professionals match these filters",
      "Clear filters, widen your budget or choose another service.",
    ],
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} aria-live="polite">
      <Empty
        title={copy[0]}
        text={copy[1]}
        action={
          kind === "loading" ? null : kind === "error" ? (
            <button type="button" className="btn light" onClick={refresh}>
              Retry listings
            </button>
          ) : kind === "no-results" && onClear ? (
            <button type="button" className="btn light" onClick={onClear}>
              Clear filters
            </button>
          ) : kind === "select-city" ? (
            <a className="btn light" href="#service-city">
              Choose city
            </a>
          ) : (
            <Link className="btn light" to="/contact">
              Contact support
            </Link>
          )
        }
      />
    </div>
  );
}
