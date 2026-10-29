import { useApp } from "../context";
export function FacultyDemoToggle() {
  const { facultyDemo, setFacultyDemo, config } = useApp();
  return (
    <div className="card" style={{ padding: "1rem", marginBlock: "1rem" }}>
      <label>
        <input
          type="checkbox"
          checked={facultyDemo}
          disabled={!config.facultyDemoAvailable && !facultyDemo}
          onChange={(e) => setFacultyDemo(e.target.checked)}
        />{" "}
        Show Faculty Demo Providers
      </label>
      <p role="status">
        {!config.facultyDemoAvailable
          ? "Faculty showcase has not been enabled by an administrator. Normal approved listings are shown."
          : facultyDemo
            ? "Faculty showcase: fictional profiles, not identity verified. Bookings and payments are disabled for these profiles."
            : "Optional fictional profiles for faculty review. Normal listings remain available."}
      </p>
    </div>
  );
}
