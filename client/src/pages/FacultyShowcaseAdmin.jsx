import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { ErrorBox } from "../components/UI";
export function FacultyShowcaseAdmin() {
  const [enabled, setEnabled] = useState(true),
    [preview, setPreview] = useState(null),
    [phrase, setPhrase] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  async function inspect() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setPreview(null);
    setPhrase("");
    setNotice("");
    try {
      setPreview(
        await api(`/admin/faculty-showcase?enabled=${enabled ? "1" : "0"}`),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    setPreview(null);
    setPhrase("");
  }, [enabled]);
  async function apply() {
    if (lock.current || !preview || phrase !== preview.confirmation) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api("/admin/faculty-showcase", {
        method: "POST",
        body: {
          enabled,
          revision: preview.revision,
          fingerprint: preview.fingerprint,
          confirmation: phrase,
        },
      });
      setNotice(
        result.enabled
          ? "Faculty showcase enabled. Profiles remain pending and cannot be booked."
          : "Faculty showcase disabled.",
      );
      setPreview(null);
      setPhrase("");
    } catch (e) {
      setError(e.message);
      setPreview(null);
      setPhrase("");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="card settings-card">
      <h2>Faculty Demo Showcase</h2>
      <p>
        Display only the 20 imported fictional Ahmedabad profiles. This does not
        approve identity, enable bookings or collect payments.
      </p>
      <ErrorBox message={error} />
      <p role="status">{busy ? "Checking showcase…" : notice}</p>
      <label>
        Operation{" "}
        <select
          value={enabled ? "enable" : "disable"}
          disabled={busy}
          onChange={(e) => setEnabled(e.target.value === "enable")}
        >
          <option value="enable">Enable faculty showcase</option>
          <option value="disable">Disable faculty showcase</option>
        </select>
      </label>
      <button className="btn light" disabled={busy} onClick={inspect}>
        Read-only preview
      </button>
      {preview && (
        <div>
          <p>
            Current: {preview.enabled ? "enabled" : "disabled"}. Matched:{" "}
            {preview.eligibleCount}/{preview.expectedCount}. Database writes:{" "}
            {preview.databaseWrites}.
          </p>
          <ul>
            {Object.entries(preview.categoryCounts).map(([slug, count]) => (
              <li key={slug}>
                {slug}: {count} displayable fictional profiles
              </li>
            ))}
          </ul>
          {!!preview.issues.length && (
            <p role="alert">
              Missing, ambiguous or mismatched accounts require review. No
              account will be changed.
            </p>
          )}
          <label>
            Type <strong>{preview.confirmation}</strong>
            <input
              aria-label="Showcase operation confirmation"
              value={phrase}
              disabled={busy}
              onChange={(e) => setPhrase(e.target.value)}
            />
          </label>
          <button
            className="btn"
            disabled={
              busy ||
              phrase !== preview.confirmation ||
              (enabled && !preview.canEnable)
            }
            onClick={apply}
          >
            Apply showcase visibility only
          </button>
        </div>
      )}
    </section>
  );
}
