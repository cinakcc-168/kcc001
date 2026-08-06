import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
    supabase,
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
  const switchFrame = useRef(0);
  const switchTimer = useRef(0);

  useEffect(() => {
    setLanguageState(preferred);
  }, [preferred]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.language = language;

    window.localStorage.setItem(
      GUEST_LANGUAGE_KEY,
      language
    );

    // Notify the DOM translation bridge only after React has committed the
    // new language. Dispatching before the commit can translate the current
    // page back with the previous language until the next navigation.
    window.dispatchEvent(new CustomEvent("tiny-pos-language-change", {
      detail: { language }
    }));
  }, [language]);

  useEffect(() => () => {
    window.cancelAnimationFrame(switchFrame.current);
    window.clearTimeout(switchTimer.current);
  }, []);

  const setLanguage = useCallback(
    (nextLanguage) => {
      const normalized = normalizeLanguage(
        nextLanguage
      );

      if (normalized === language) return;

      const root = document.documentElement;
      window.cancelAnimationFrame(switchFrame.current);
      window.clearTimeout(switchTimer.current);
      root.classList.remove("language-switch-complete");
      root.classList.add("language-switching");

      // Let the fade-out paint first, then commit the translated UI. This
      // keeps the current route in place and gives EN/KH a smooth transition.
      switchFrame.current = window.requestAnimationFrame(() => {
        setLanguageState(normalized);
        window.localStorage.setItem(
          GUEST_LANGUAGE_KEY,
          normalized
        );

        if (supabase && session?.user?.id) {
          void supabase
            .from("user_preferences")
            .update({ language: normalized })
            .eq("user_id", session.user.id);
        }

        window.requestAnimationFrame(() => {
          root.classList.remove("language-switching");
          root.classList.add("language-switch-complete");
          switchTimer.current = window.setTimeout(() => {
            root.classList.remove("language-switch-complete");
          }, 300);
        });
      });
    },
    [language, session?.user?.id, supabase]
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
