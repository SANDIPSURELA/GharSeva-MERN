import { CitySelector } from "./components/CitySelector";
import { InvitationRegistration } from "./pages/AccountInvitations";
import { Routes, Route, useLocation } from "react-router-dom";
import { useApp } from "./context";
import { Header, Footer, CompareDock, ErrorBox } from "./components/UI";
import { Compare, About, Contact, Policy, NotFound } from "./pages/Public";
import { ServiceAssistant } from "./pages/ServiceAssistant";
import { Home } from "./pages/Home";
import { Services } from "./pages/Services";
import { ProviderDetails } from "./pages/ProviderDetails";
import { Protect } from "./pages/Auth";
import { Login, LoginAlias } from "./pages/Login";
import { PasswordRecovery } from "./pages/PasswordRecovery";
import { Registration } from "./pages/CustomerRegister";
import { Booking } from "./pages/Booking";
import { Dashboard } from "./pages/Dashboard";
export default function App() {
  const { error, refresh, toast, checkIdentity, user, loading } = useApp();
  const { pathname } = useLocation();
  const normalizedPath = pathname.toLowerCase().replace(/\/+$/, "");
  const hasCompactFooter =
    [
      "/login",
      "/customer/login",
      "/provider/login",
      "/admin/login",
      "/forgot-password",
    ].includes(normalizedPath) ||
    ["/register", "/invite"].includes(normalizedPath);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header />
      <CitySelector />
      {error && (
        <div className="container backend-banner">
          <ErrorBox message={error} />
          <button
            className="text-link"
            onClick={async () => {
              if (await checkIdentity()) refresh();
            }}
          >
            Retry connection
          </button>
        </div>
      )}
      <main id="main-content">
        {!loading &&
        user &&
        ["customer", "provider"].includes(user.role) &&
        !user.city ? (
          <div className="container section">
            <h1>Choose your service city</h1>
            <p>
              Use the city selector above and save your default to continue.
            </p>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/services" element={<Services />} />
            <Route path="/finder" element={<ServiceAssistant />} />
            <Route path="/assistant" element={<ServiceAssistant />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/providers/:id" element={<ProviderDetails />} />
            <Route
              path="/booking/:id"
              element={
                <Protect role="customer">
                  <Booking />
                </Protect>
              }
            />
            <Route path="/login" element={<Login />} />
            <Route path="/customer/login" element={<LoginAlias />} />
            <Route path="/provider/login" element={<LoginAlias />} />
            <Route path="/forgot-password" element={<PasswordRecovery />} />
            <Route path="/admin/login" element={<LoginAlias />} />
            <Route path="/register" element={<Registration />} />
            <Route path="/invite" element={<InvitationRegistration />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Policy />} />
            <Route path="/privacy" element={<Policy privacy />} />
            {["customer", "provider", "admin"].map((role) => (
              <Route
                key={role}
                path={`/dashboard/${role}`}
                element={
                  <Protect role={role}>
                    <Dashboard />
                  </Protect>
                }
              />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </main>
      {!hasCompactFooter && <Footer />}
      {!hasCompactFooter && <CompareDock />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
