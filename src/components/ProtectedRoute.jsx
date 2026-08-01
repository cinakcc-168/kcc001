import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const {
    session,
    profile,
    access,
    error
  } = useAuth();
  const location = useLocation();

  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  // Never render the application with an authenticated session but no loaded
  // POS profile/access. Previously this state looked like every permission was
  // denied and hid the whole sidebar, which was misleading.
  if (!profile || !access) {
    return (
      <div className="loading">
        <div>
          <strong>{error ? "Unable to load the POS account." : "Loading POS account…"}</strong>
          {error ? <p>{error}</p> : null}
          {error ? (
            <button type="button" onClick={() => window.location.reload()}>
              Retry
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return children;
}
