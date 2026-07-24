import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const TRANSLATIONS = {
  en: {
    connected: 'Connected securely',
    configurationError: 'Configuration error',
    logout: 'Log out',
    checkingSession: 'Checking your session…',
    checkingSessionHelp: 'Tiny POS is connecting securely to Supabase.',
    secureLogin: 'Secure staff login',
    welcome: 'Welcome to Tiny POS',
    loginHelp: 'Sign in with the owner account you created in Supabase.',
    email: 'Email',
    password: 'Password',
    show: 'Show',
    hide: 'Hide',
    login: 'Log in',
    loggingIn: 'Logging in…',
    connectionSuccess: 'Supabase connection successful',
    hello: 'Hello',
    foundationReady: 'Authentication, user profile, branch access, and Row Level Security are working.',
    account: 'Account',
    name: 'Name',
    role: 'Role',
    status: 'Status',
    active: 'Active',
    inactive: 'Inactive',
    shop: 'Shop',
    organization: 'Organization',
    branch: 'Branch',
    baseCurrency: 'Base currency',
    exchangeRate: 'USD → KHR',
    personalPreferences: 'Personal preferences',
    preferencesHelp: 'These settings belong only to your user account. Other staff can choose their own style.',
    language: 'Language',
    theme: 'Theme',
    systemTheme: 'Use device setting',
    lightTheme: 'Light',
    darkTheme: 'Dark',
    accentColor: 'Accent color',
    savePreferences: 'Save preferences',
    saving: 'Saving…',
    saved: 'Saved',
    stepTwoTest: 'Step 2 connection test',
    authWorking: 'Supabase email/password login works',
    profileWorking: 'Owner profile and role loaded through RLS',
    settingsWorking: 'Shop settings loaded from PostgreSQL',
    preferencesWorking: 'Personal theme and language can be saved',
    stepTwo: 'Supabase connection — Step 2',
    invalidCredentials: 'The email or password is incorrect.',
    accountUnavailable: 'Your POS profile could not be loaded. Confirm that Step 1 created a profile for this Auth user.',
    loadFailed: 'Tiny POS could not load your account data.',
    saveFailed: 'Preferences could not be saved.',
    signedOut: 'You have been logged out.',
    configMissing: 'Netlify is missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.'
  },
  km: {
    connected: 'បានភ្ជាប់ដោយសុវត្ថិភាព',
    configurationError: 'កំហុសការកំណត់',
    logout: 'ចាកចេញ',
    checkingSession: 'កំពុងពិនិត្យការចូលប្រើ…',
    checkingSessionHelp: 'Tiny POS កំពុងភ្ជាប់ទៅ Supabase ដោយសុវត្ថិភាព។',
    secureLogin: 'ចូលប្រើសម្រាប់បុគ្គលិក',
    welcome: 'សូមស្វាគមន៍មកកាន់ Tiny POS',
    loginHelp: 'ចូលដោយគណនីម្ចាស់ដែលអ្នកបានបង្កើតនៅក្នុង Supabase។',
    email: 'អ៊ីមែល',
    password: 'ពាក្យសម្ងាត់',
    show: 'បង្ហាញ',
    hide: 'លាក់',
    login: 'ចូលប្រើ',
    loggingIn: 'កំពុងចូល…',
    connectionSuccess: 'បានភ្ជាប់ Supabase ជោគជ័យ',
    hello: 'សួស្តី',
    foundationReady: 'ការចូលប្រើ ប្រវត្តិរូប សាខា និង Row Level Security ដំណើរការត្រឹមត្រូវ។',
    account: 'គណនី',
    name: 'ឈ្មោះ',
    role: 'តួនាទី',
    status: 'ស្ថានភាព',
    active: 'សកម្ម',
    inactive: 'មិនសកម្ម',
    shop: 'ហាង',
    organization: 'អាជីវកម្ម',
    branch: 'សាខា',
    baseCurrency: 'រូបិយប័ណ្ណគោល',
    exchangeRate: 'USD → KHR',
    personalPreferences: 'ការកំណត់ផ្ទាល់ខ្លួន',
    preferencesHelp: 'ការកំណត់ទាំងនេះសម្រាប់គណនីរបស់អ្នកតែប៉ុណ្ណោះ។ បុគ្គលិកផ្សេងអាចជ្រើសរើសរចនាប័ទ្មផ្ទាល់ខ្លួន។',
    language: 'ភាសា',
    theme: 'រូបរាង',
    systemTheme: 'តាមការកំណត់ឧបករណ៍',
    lightTheme: 'ភ្លឺ',
    darkTheme: 'ងងឹត',
    accentColor: 'ពណ៌ចម្បង',
    savePreferences: 'រក្សាទុកការកំណត់',
    saving: 'កំពុងរក្សាទុក…',
    saved: 'បានរក្សាទុក',
    stepTwoTest: 'ការសាកល្បងការភ្ជាប់ ជំហានទី ២',
    authWorking: 'ការចូលដោយអ៊ីមែល និងពាក្យសម្ងាត់ដំណើរការ',
    profileWorking: 'ប្រវត្តិរូបម្ចាស់ និងតួនាទីបានផ្ទុកតាម RLS',
    settingsWorking: 'ការកំណត់ហាងបានផ្ទុកពី PostgreSQL',
    preferencesWorking: 'អាចរក្សាទុករូបរាង និងភាសាផ្ទាល់ខ្លួន',
    stepTwo: 'ការភ្ជាប់ Supabase — ជំហានទី ២',
    invalidCredentials: 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ។',
    accountUnavailable: 'មិនអាចផ្ទុកប្រវត្តិរូប POS បានទេ។ សូមពិនិត្យថា ជំហានទី ១ បានបង្កើត profile សម្រាប់គណនីនេះ។',
    loadFailed: 'Tiny POS មិនអាចផ្ទុកទិន្នន័យគណនីបានទេ។',
    saveFailed: 'មិនអាចរក្សាទុកការកំណត់បានទេ។',
    signedOut: 'អ្នកបានចាកចេញពីគណនី។',
    configMissing: 'Netlify ខ្វះ SUPABASE_URL ឬ SUPABASE_PUBLISHABLE_KEY។'
  }
};

const elements = {
  loadingView: document.querySelector('#loadingView'),
  loginView: document.querySelector('#loginView'),
  dashboardView: document.querySelector('#dashboardView'),
  loginForm: document.querySelector('#loginForm'),
  emailInput: document.querySelector('#emailInput'),
  passwordInput: document.querySelector('#passwordInput'),
  loginButton: document.querySelector('#loginButton'),
  loginMessage: document.querySelector('#loginMessage'),
  logoutButton: document.querySelector('#logoutButton'),
  togglePasswordButton: document.querySelector('#togglePasswordButton'),
  preLoginLanguageButton: document.querySelector('#preLoginLanguageButton'),
  connectionLabel: document.querySelector('#connectionLabel'),
  profileName: document.querySelector('#profileName'),
  roleBadge: document.querySelector('#roleBadge'),
  accountName: document.querySelector('#accountName'),
  accountEmail: document.querySelector('#accountEmail'),
  accountRole: document.querySelector('#accountRole'),
  accountStatus: document.querySelector('#accountStatus'),
  organizationName: document.querySelector('#organizationName'),
  branchName: document.querySelector('#branchName'),
  baseCurrency: document.querySelector('#baseCurrency'),
  exchangeRate: document.querySelector('#exchangeRate'),
  preferencesForm: document.querySelector('#preferencesForm'),
  languageSelect: document.querySelector('#languageSelect'),
  themeSelect: document.querySelector('#themeSelect'),
  accentColorInput: document.querySelector('#accentColorInput'),
  accentColorValue: document.querySelector('#accentColorValue'),
  savePreferencesButton: document.querySelector('#savePreferencesButton'),
  saveState: document.querySelector('#saveState')
};

let supabase;
let currentSession = null;
let currentProfile = null;
let currentSettings = null;
let currentLanguage = localStorage.getItem('tiny-pos-login-language') || 'en';
let loadedUserId = null;

function t(key) {
  return TRANSLATIONS[currentLanguage]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}

function setLanguage(language, persistBeforeLogin = true) {
  currentLanguage = language === 'km' ? 'km' : 'en';
  document.documentElement.lang = currentLanguage;

  if (persistBeforeLogin) {
    localStorage.setItem('tiny-pos-login-language', currentLanguage);
  }

  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    if (TRANSLATIONS[currentLanguage]?.[key]) {
      node.textContent = TRANSLATIONS[currentLanguage][key];
    }
  });

  elements.preLoginLanguageButton.textContent = currentLanguage === 'en' ? 'ខ្មែរ' : 'English';
  elements.togglePasswordButton.textContent = elements.passwordInput.type === 'password' ? t('show') : t('hide');

  if (currentProfile) {
    elements.accountStatus.textContent = currentProfile.is_active ? t('active') : t('inactive');
  }

  if (supabase) {
    elements.connectionLabel.textContent = t('connected');
  }
}

function applyTheme(theme = 'system', accentColor = '#2563eb') {
  const safeTheme = ['system', 'light', 'dark'].includes(theme) ? theme : 'system';
  const safeColor = /^#[0-9A-Fa-f]{6}$/.test(accentColor) ? accentColor : '#2563eb';
  document.documentElement.dataset.theme = safeTheme;
  document.documentElement.style.setProperty('--accent', safeColor);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', safeColor);
  elements.accentColorValue.textContent = safeColor.toLowerCase();
}

function showView(viewName) {
  elements.loadingView.classList.toggle('hidden', viewName !== 'loading');
  elements.loginView.classList.toggle('hidden', viewName !== 'login');
  elements.dashboardView.classList.toggle('hidden', viewName !== 'dashboard');
  elements.logoutButton.classList.toggle('hidden', viewName !== 'dashboard');
}

function setLoginMessage(message = '', type = 'error') {
  elements.loginMessage.textContent = message;
  elements.loginMessage.className = `message ${type}`;
  elements.loginMessage.classList.toggle('hidden', !message);
}

function setButtonLoading(button, isLoading, loadingText, normalText) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : normalText;
}

async function loadPublicConfiguration() {
  const response = await fetch('/api/public-config', {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // A readable error is thrown below.
  }

  if (!response.ok || !payload.supabaseUrl || !payload.supabasePublishableKey) {
    throw new Error(payload.error || t('configMissing'));
  }

  return payload;
}

async function loadAccountData(user) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(`
      id,
      organization_id,
      branch_id,
      email,
      full_name,
      role,
      is_active,
      organizations (name, code),
      branches (name, code)
    `)
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('Profile load failed:', profileError);
    throw new Error(t('accountUnavailable'));
  }

  const [preferencesResult, settingsResult] = await Promise.all([
    supabase
      .from('user_preferences')
      .select('language, theme, accent_color, compact_mode, sound_enabled, scanner_vibration')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('app_settings')
      .select('shop_name, base_currency, usd_to_khr_rate, default_language, default_theme')
      .eq('organization_id', profile.organization_id)
      .single()
  ]);

  if (preferencesResult.error) {
    console.error('Preferences load failed:', preferencesResult.error);
    throw new Error(t('loadFailed'));
  }

  if (settingsResult.error) {
    console.error('Settings load failed:', settingsResult.error);
    throw new Error(t('loadFailed'));
  }

  currentProfile = profile;
  currentSettings = settingsResult.data;

  const preferences = preferencesResult.data;
  setLanguage(preferences.language, false);
  applyTheme(preferences.theme, preferences.accent_color);

  elements.languageSelect.value = preferences.language;
  elements.themeSelect.value = preferences.theme;
  elements.accentColorInput.value = preferences.accent_color;
  elements.accentColorValue.textContent = preferences.accent_color.toLowerCase();

  elements.profileName.textContent = profile.full_name;
  elements.roleBadge.textContent = profile.role.toUpperCase();
  elements.accountName.textContent = profile.full_name;
  elements.accountEmail.textContent = profile.email || user.email || '—';
  elements.accountRole.textContent = profile.role;
  elements.accountStatus.textContent = profile.is_active ? t('active') : t('inactive');
  elements.organizationName.textContent = profile.organizations?.name || '—';
  elements.branchName.textContent = profile.branches?.name || '—';
  elements.baseCurrency.textContent = currentSettings.base_currency;
  elements.exchangeRate.textContent = Number(currentSettings.usd_to_khr_rate).toLocaleString('en-US');

  document.title = `${currentSettings.shop_name || 'Tiny POS'} — Account`;
}

async function handleSession(session) {
  currentSession = session;

  if (!session?.user) {
    loadedUserId = null;
    currentProfile = null;
    currentSettings = null;
    showView('login');
    return;
  }

  if (loadedUserId === session.user.id && currentProfile) {
    showView('dashboard');
    return;
  }

  showView('loading');

  try {
    await loadAccountData(session.user);
    loadedUserId = session.user.id;
    showView('dashboard');
  } catch (error) {
    console.error(error);
    await supabase.auth.signOut();
    setLoginMessage(error.message || t('loadFailed'));
    showView('login');
  }
}

async function initialize() {
  setLanguage(currentLanguage);
  applyTheme('system', '#2563eb');
  bindEvents();

  try {
    const config = await loadPublicConfiguration();

    supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    elements.connectionLabel.textContent = t('connected');

    supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        handleSession(session).catch(console.error);
      }, 0);
    });

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await handleSession(data.session);
  } catch (error) {
    console.error(error);
    elements.connectionLabel.textContent = t('configurationError');
    setLoginMessage(error.message || t('configMissing'));
    showView('login');
    elements.loginButton.disabled = true;
  }
}

function bindEvents() {
  elements.preLoginLanguageButton.addEventListener('click', () => {
    setLanguage(currentLanguage === 'en' ? 'km' : 'en');
  });

  elements.togglePasswordButton.addEventListener('click', () => {
    const isHidden = elements.passwordInput.type === 'password';
    elements.passwordInput.type = isHidden ? 'text' : 'password';
    elements.togglePasswordButton.textContent = isHidden ? t('hide') : t('show');
  });

  elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setLoginMessage();

    if (!elements.loginForm.reportValidity() || !supabase) return;

    setButtonLoading(elements.loginButton, true, t('loggingIn'), t('login'));

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: elements.emailInput.value.trim(),
        password: elements.passwordInput.value
      });

      if (error) throw error;
      elements.passwordInput.value = '';
    } catch (error) {
      console.error(error);
      setLoginMessage(t('invalidCredentials'));
    } finally {
      setButtonLoading(elements.loginButton, false, t('loggingIn'), t('login'));
    }
  });

  elements.logoutButton.addEventListener('click', async () => {
    elements.logoutButton.disabled = true;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setLoginMessage(t('signedOut'), 'success');
    } catch (error) {
      console.error(error);
      setLoginMessage(error.message || t('loadFailed'));
    } finally {
      elements.logoutButton.disabled = false;
    }
  });

  elements.accentColorInput.addEventListener('input', () => {
    elements.accentColorValue.textContent = elements.accentColorInput.value.toLowerCase();
    applyTheme(elements.themeSelect.value, elements.accentColorInput.value);
  });

  elements.themeSelect.addEventListener('change', () => {
    applyTheme(elements.themeSelect.value, elements.accentColorInput.value);
  });

  elements.languageSelect.addEventListener('change', () => {
    setLanguage(elements.languageSelect.value, false);
  });

  elements.preferencesForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabase || !currentSession?.user) return;

    elements.saveState.textContent = t('saving');
    setButtonLoading(elements.savePreferencesButton, true, t('saving'), t('savePreferences'));

    const preferences = {
      user_id: currentSession.user.id,
      language: elements.languageSelect.value,
      theme: elements.themeSelect.value,
      accent_color: elements.accentColorInput.value
    };

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .upsert(preferences, { onConflict: 'user_id' })
        .select('language, theme, accent_color')
        .single();

      if (error) throw error;

      setLanguage(data.language, false);
      applyTheme(data.theme, data.accent_color);
      elements.saveState.textContent = t('saved');
      window.setTimeout(() => {
        elements.saveState.textContent = '';
      }, 2500);
    } catch (error) {
      console.error(error);
      elements.saveState.textContent = t('saveFailed');
    } finally {
      setButtonLoading(elements.savePreferencesButton, false, t('saving'), t('savePreferences'));
    }
  });
}

initialize().catch(console.error);
