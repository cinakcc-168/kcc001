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
    <label
      className={`language-switcher ${compact ? "compact" : ""} ${className}`.trim()}
      data-i18n-skip
    >
      <Languages size={18} aria-hidden="true" />
      {!compact && (
        <span>{t("Language")}</span>
      )}

      <select
        value={language}
        onChange={(event) =>
          setLanguage(event.target.value)
        }
        aria-label={t("Language")}
      >
        <option value="en">
          English
        </option>
        <option value="km">
          ខ្មែរ
        </option>
      </select>
    </label>
  );
}
