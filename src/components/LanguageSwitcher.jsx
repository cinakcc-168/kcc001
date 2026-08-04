import { Languages } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export default function LanguageSwitcher({
  compact = false,
  className = ""
}) {
  const {
    language,
    setLanguage,
    t
  } = useLanguage();

  return (
    <div
      className={`language-switcher ${compact ? "compact" : ""} ${className}`.trim()}
      data-i18n-skip
      role="group"
      aria-label={t("Language")}
    >
      {!compact && (
        <span className="language-switcher-label">
          <Languages size={18} aria-hidden="true" />
          {t("Language")}
        </span>
      )}

      <div className="language-toggle" aria-label={t("Choose language") }>
        <button
          type="button"
          className={language === "en" ? "active" : ""}
          onClick={() => setLanguage("en")}
          aria-pressed={language === "en"}
        >
          EN
        </button>
        <button
          type="button"
          className={language === "km" ? "active" : ""}
          onClick={() => setLanguage("km")}
          aria-pressed={language === "km"}
        >
          KH
        </button>
      </div>
    </div>
  );
}
