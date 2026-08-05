import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { useAuth } from "./AuthContext";
import {
  createTranslator,
  normalizeLanguage
} from "../i18n/translations";

const LanguageContext = createContext(null);
const GUEST_LANGUAGE_KEY = "tiny-pos-language";

function browserLanguage() {
  if (typeof window === "undefined") return "en";

  const saved = window.localStorage.getItem(
    GUEST_LANGUAGE_KEY
  );

  if (saved) return normalizeLanguage(saved);

  return normalizeLanguage(
    window.navigator.language
  );
}

export function LanguageProvider({ children }) {
  const {
    session,
    preferences,
    shop
  } = useAuth();

  const preferred = normalizeLanguage(
    preferences?.language
    || shop?.default_language
    || browserLanguage()
  );

  const [language, setLanguageState] =
    useState(preferred);

  useEffect(() => {
    setLanguageState(preferred);
  }, [preferred]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;

    window.localStorage.setItem(
      GUEST_LANGUAGE_KEY,
      language
    );
  }, [language]);

  const setLanguage = useCallback(
    (nextLanguage) => {
      const normalized = normalizeLanguage(
        nextLanguage
      );

      document.documentElement.classList.add("language-switching");
      setLanguageState(normalized);
      window.localStorage.setItem(
        GUEST_LANGUAGE_KEY,
        normalized
      );
      window.dispatchEvent(new CustomEvent("tiny-pos-language-change", {
        detail: { language: normalized }
      }));
      window.setTimeout(() => {
        document.documentElement.classList.remove("language-switching");
      }, 260);
    },
    []
  );

  const t = useMemo(
    () => createTranslator(language),
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      authenticated: Boolean(session)
    }),
    [
      language,
      setLanguage,
      t,
      session
    ]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const value = useContext(LanguageContext);

  if (!value) {
    throw new Error(
      "useLanguage must be used inside LanguageProvider."
    );
  }

  return value;
}
