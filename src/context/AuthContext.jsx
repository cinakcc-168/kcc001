import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { getSupabase } from "../lib/supabase";
import {
  accessAllows,
  accessAllowsAny,
  fallbackAccessForRole,
  loadMyAccess
} from "../lib/permissions";
import {
  clearOfflineAuthSnapshot,
  loadOfflineAuthSnapshot,
  saveOfflineAuthSnapshot
} from "../lib/offlineCheckout";

const AuthContext = createContext(null);

function applyPreferences(preferences) {
  const root = document.documentElement;
  const theme = preferences?.theme || "system";
  const accent = preferences?.accent_color || "#2563eb";

  root.dataset.theme = theme;
  root.dataset.forceTheme = theme === "system" ? "" : theme;
  root.style.setProperty("--accent", accent);
}

export function AuthProvider({ children }) {
  const [supabase, setSupabase] = useState();
  const [session, setSession] = useState();
  const [profile, setProfile] = useState();
  const [preferences, setPreferences] = useState();
  const [shop, setShop] = useState();
  const [access, setAccess] = useState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function clearAccount() {
    setProfile();
    setPreferences();
    setShop();
    setAccess();
    applyPreferences(null);
  }

  async function loadAccount(client, activeSession, recordLogin = false) {
    if (!activeSession) {
      await clearAccount();
      return;
    }

    const userId = activeSession.user.id;

    const { data: profileData, error: profileError } = await client
      .from("profiles")
      .select("*,organizations(*),branches(*)")
      .eq("id", userId)
      .single();

    if (profileError || !profileData) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const cached = loadOfflineAuthSnapshot(userId);
        if (cached?.profile) {
          setProfile({ ...cached.profile, offline_mode: true });
          setPreferences(cached.preferences);
          setShop(cached.shop);
          setAccess(cached.access || fallbackAccessForRole(cached.profile.role));
          applyPreferences(cached.preferences);
          return;
        }
      }
      throw new Error(profileError?.message || "POS profile not found.");
    }

    if (!profileData.is_active) {
      await client.auth.signOut();
      throw new Error("This POS account is inactive. Contact the owner.");
    }

    const [
      {
        data: preferenceData,
        error: preferenceError
      },
      {
        data: shopData,
        error: shopError
      },
      accessData
    ] = await Promise.all([
      client
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId)
        .single(),

      client
        .from("app_settings")
        .select("*")
        .eq(
          "organization_id",
          profileData.organization_id
        )
        .single(),

      loadMyAccess(
        client,
        profileData.role
      )
    ]);

    if (preferenceError) throw preferenceError;
    if (shopError) throw shopError;

    setProfile(profileData);
    setPreferences(preferenceData);
    setShop(shopData);
    const nextAccess =
      accessData
      || fallbackAccessForRole(
        profileData.role
      );

    setAccess(nextAccess);
    applyPreferences(preferenceData);
    saveOfflineAuthSnapshot(
      activeSession,
      profileData,
      preferenceData,
      shopData,
      nextAccess
    );

    if (recordLogin) {
      try {
        await client.rpc("record_pos_login");
      } catch {
        // Login tracking must never block the POS from opening.
      }
    }
  }

  useEffect(() => {
    let subscription;
    let mounted = true;

    (async () => {
      try {
        const client = await getSupabase();
        if (!mounted) return;

        setSupabase(client);

        const {
          data: { session: currentSession },
          error: sessionError
        } = await client.auth.getSession();

        if (sessionError) throw sessionError;
        if (!mounted) return;

        setSession(currentSession);
        await loadAccount(client, currentSession, Boolean(currentSession));

        const authListener = client.auth.onAuthStateChange(
          async (event, nextSession) => {
            if (!mounted) return;

            setSession(nextSession);

            try {
              await loadAccount(
                client,
                nextSession,
                event === "SIGNED_IN"
              );
              setError("");
            } catch (authError) {
              setError(authError.message);
            }
          }
        );

        subscription = authListener.data.subscription;
      } catch (initializeError) {
        if (mounted) setError(initializeError.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function refreshAccess() {
    if (!supabase || !profile?.role) {
      return null;
    }

    const nextAccess =
      await loadMyAccess(
        supabase,
        profile.role
      );

    setAccess(nextAccess);
    return nextAccess;
  }

  function can(permissionKey) {
    return accessAllows(
      access
      || fallbackAccessForRole(
        profile?.role
      ),
      permissionKey
    );
  }

  function canAny(permissionKeys) {
    return accessAllowsAny(
      access
      || fallbackAccessForRole(
        profile?.role
      ),
      permissionKeys
    );
  }

  async function signIn(email, password) {
    if (!supabase) throw new Error("Supabase is still loading.");

    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

    if (signInError) throw signInError;

    setSession(data.session);
    await loadAccount(supabase, data.session, true);
    return data;
  }

  async function signOut() {
    if (!supabase) return;
    clearOfflineAuthSnapshot(session?.user?.id);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  }

  async function savePreferences(values) {
    const payload = {
      language: values.language,
      theme: values.theme,
      accent_color: values.accent_color,
      compact_mode: Boolean(values.compact_mode),
      sound_enabled: Boolean(values.sound_enabled),
      scanner_vibration: Boolean(values.scanner_vibration)
    };

    const { data, error: updateError } = await supabase
      .from("user_preferences")
      .update(payload)
      .eq("user_id", session.user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    setPreferences(data);
    applyPreferences(data);
    return data;
  }

  const value = useMemo(
    () => ({
      supabase,
      session,
      profile,
      preferences,
      shop,
      access,
      approvalLimits:
        access?.limits || {},
      loading,
      error,
      can,
      canAny,
      refreshAccess,
      signIn,
      signOut,
      savePreferences
    }),
    [
      supabase,
      session,
      profile,
      preferences,
      shop,
      access,
      loading,
      error
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
