import { useState } from "react";
import { useApp } from "../context";
import { api } from "../api";
import { supportedCities } from "../../../shared/cities.js";
export function CitySelector() {
  const { user, loading, selectedCity, setSelectedCity, setUser } = useApp();
  const [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (loading || (user && !["customer", "provider"].includes(user.role)))
    return null;
  const required = user && !user.city;
  if (user?.role === "provider" && !required) return null;
  const save = async () => {
    if (!selectedCity) return;
    setBusy(true);
    setError("");
    try {
      const account = await api("/auth/me/city", {
        method: "PATCH",
        body: { city: selectedCity },
      });
      setUser(account);
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      id="service-city"
      className="container city-selector"
      aria-label="Service city"
    >
      <strong>
        {required
          ? "Select your city once to continue"
          : "Service city: " + (selectedCity || "Choose a city")}
      </strong>
      {!required && (
        <button className="text-link" onClick={() => setEditing(!editing)}>
          Change city
        </button>
      )}
      {(editing || required || !selectedCity) && (
        <label>
          City{" "}
          <select
            aria-label="Selected service city"
            value={selectedCity}
            disabled={busy}
            onChange={(e) => setSelectedCity(e.target.value)}
          >
            <option value="">Select city</option>
            {supportedCities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      {user && selectedCity && (required || selectedCity !== user.city) && (
        <button className="btn small" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save as my default city"}
        </button>
      )}
      {!required && user?.city && (
        <small>
          Saved default: {user.city}. Browsing another city only changes this
          visit until you save.
        </small>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
