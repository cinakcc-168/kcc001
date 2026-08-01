import { useState } from "react";
import { Navigate } from "react-router-dom";
import { LockKeyhole, Mail, ShieldCheck, ShoppingCart, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function LoginPage() {
  const { session, signIn, error, shop } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/dashboard" replace />;

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
    <main className="login login-modern">
      <div className="login-language-row"><LanguageSwitcher /></div>

      <section className="login-shell">
        <div className="login-visual" aria-hidden="true">
          <div className="login-visual-brand">
            {shop?.shop_logo_url ? (
              <img src={shop.shop_logo_url} alt="" />
            ) : (
              <span><ShoppingCart size={28} /></span>
            )}
            <strong data-i18n-skip>{shop?.shop_name || "Tiny POS"}</strong>
          </div>
          <div className="login-visual-copy">
            <p className="eyebrow">SMART RETAIL WORKSPACE</p>
            <h1>{t("Sell faster. Know your stock. Run every branch clearly.")}</h1>
            <p>{t("Sales, purchasing, inventory, customers, reports and Telegram in one secure workspace.")}</p>
          </div>
          <div className="login-feature-pills">
            <span><Sparkles size={17} /> {t("Fast checkout")}</span>
            <span><ShieldCheck size={17} /> {t("Role-based access")}</span>
          </div>
        </div>

        <form className="login-card" onSubmit={submit}>
          <div className="login-card-mark">T</div>
          <div>
            <p className="eyebrow">{t("SECURE STAFF LOGIN")}</p>
            <h2>{t("Welcome back")}</h2>
            <p className="muted">{t("Sign in to continue to Tiny POS.")}</p>
          </div>

          {(message || error) && <div className="notice error">{t(message || error)}</div>}

          <label className="login-field">
            <span>{t("Email")}</span>
            <div><Mail size={19} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="name@example.com" autoFocus /></div>
          </label>

          <label className="login-field">
            <span>{t("Password")}</span>
            <div><LockKeyhole size={19} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" placeholder="••••••••" /></div>
          </label>

          <button className="primary-button login-submit" disabled={busy}>
            {busy ? t("Signing in…") : t("Log in")}
          </button>

          <small className="login-security-note"><ShieldCheck size={15} /> {t("Protected by Supabase authentication and role permissions.")}</small>
        </form>
      </section>
    </main>
  );
}
