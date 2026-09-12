import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import Modal from "./Modal";
import { useLanguage } from "../context/LanguageContext";

export default function PasswordResetModal({
  member,
  busy,
  onClose,
  onReset
}) {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setPassword("");
    setConfirmPassword("");
    setError("");
  }, [member]);

  if (!member) return null;

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("The new password must contain at least 8 characters."));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("The password confirmation does not match."));
      return;
    }

    await onReset(password);
  }

  return (
    <Modal title={`${t("Reset password")} · ${member.full_name}`} onClose={onClose}>
      <form className="password-reset-form" onSubmit={submit}>
        <p className="muted">
          {t("Enter a temporary password and share it privately with this staff member.")}
        </p>

        <label>
          <span>{t("New temporary password")}</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("At least 8 characters")}
          />
        </label>

        <label>
          <span>{t("Confirm password")}</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder={t("Repeat the password")}
          />
        </label>

        {error && <div className="notice error">{t(error)}</div>}

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            {t("Cancel")}
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            <KeyRound size={18} />
            {busy ? t("Resetting...") : t("Reset password")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
