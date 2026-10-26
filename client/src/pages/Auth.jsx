import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "../context";
import { Loading } from "../components/UI";
import {
  authDestination,
  loginAliasState,
} from "../../../shared/auth-navigation.js";
export { authDestination };
export function Protect({ role, children }) {
  const { user, loading } = useApp(),
    location = useLocation();
  if (loading) return <Loading />;
  if (!user)
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  if (role && user.role !== role)
    return <Navigate to={authDestination(user)} replace />;
  return <div className="gs-private">{children}</div>;
}
// Compatibility for older imports: every login entry uses the current two-step
// page, and registration continues through its existing verified workflow.
export function Auth({ register = false }) {
  const location = useLocation();
  return (
    <Navigate
      to={register ? `/register${location.search}` : "/login"}
      state={loginAliasState(location.state)}
      replace
    />
  );
}
