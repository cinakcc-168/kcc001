import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function LoginPage() {
  const { session, signIn, error } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  async function submit(event) {
    event.preventDefault();

    try {
      setBusy(true);
      setMessage("");
      await signIn(email, password);
    } catch (signInError) {
      setMessage(signInError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-language-row">
        <LanguageSwitcher />
      </div>

      <form className="card" onSubmit={submit}>
        <div className="logo">T</div>
        <p className="eyebrow">
          {t("SECURE STAFF LOGIN")}
        </p>
        <h1>{t("Welcome to Tiny POS")}</h1>
        <p className="muted">
          {t(
            "Sign in with the owner account from the new Supabase project."
          )}
        </p>

        {(message || error) && (
          <div className="error">
            {t(message || error)}
          </div>
        )}

        <label>
          <span>{t("Email")}</span>
          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
            autoComplete="email"
          />
        </label>

        <label>
          <span>{t("Password")}</span>
          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            required
            autoComplete="current-password"
          />
        </label>

        <button disabled={busy}>
          {busy
            ? t("Signing in…")
            : t("Log in")}
        </button>
      </form>
    </main>
  );
}
