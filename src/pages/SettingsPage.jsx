import { useEffect, useMemo, useState } from "react";
import {
  Barcode,
  ImagePlus,
  Palette,
  ReceiptText,
  Save,
  Store,
  Trash2,
  UserRound
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import {
  removeShopLogo,
  saveShopSettings,
  shopFormFromSettings,
  uploadShopLogo
} from "../lib/settings";

export default function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();

  const {
    supabase,
    session,
    profile,
    preferences,
    shop,
    can,
    savePreferences
  } = useAuth();

  const canEditShop = can("settings.manage");
  const [tab, setTab] = useState("personal");
  const [personal, setPersonal] = useState({
    language: "en",
    theme: "system",
    accent_color: "#2563eb",
    compact_mode: false,
    sound_enabled: true,
    scanner_vibration: true
  });
  const [shopForm, setShopForm] = useState(shopFormFromSettings(shop));
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  useEffect(() => {
    if (preferences) {
      setPersonal({
        language: preferences.language,
        theme: preferences.theme,
        accent_color: preferences.accent_color,
        compact_mode: preferences.compact_mode,
        sound_enabled: preferences.sound_enabled,
        scanner_vibration: preferences.scanner_vibration
      });
    }
  }, [preferences]);

  useEffect(() => {
    setShopForm(shopFormFromSettings(shop));
    setLogoPreview(shop?.shop_logo_url || "");
  }, [shop]);

  useEffect(() => {
    if (!logoFile) return undefined;

    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

  const receiptPreviewStyle = useMemo(
    () => ({ "--receipt-preview-width": `${shopForm.receipt_width_mm}mm` }),
    [shopForm.receipt_width_mm]
  );

  function updatePersonal(field, value) {
    setPersonal((current) => ({ ...current, [field]: value }));

    if (field === "language") {
      setLanguage(value);
    }

    setMessage("");
  }

  function updateShop(field, value) {
    setShopForm((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  async function submitPersonal(event) {
    event.preventDefault();

    try {
      setBusy(true);
      await savePreferences(personal);
      setMessageType("success");
      setMessage(t("Personal preferences saved."));
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitShop(event) {
    event.preventDefault();

    if (!canEditShop) return;

    try {
      setBusy(true);
      await saveShopSettings(supabase, shopForm);
      setMessageType("success");
      setMessage("Shop settings saved. Reloading the POS...");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
      setBusy(false);
    }
  }

  async function uploadLogo() {
    if (!logoFile || !canEditShop) return;

    try {
      setBusy(true);
      await uploadShopLogo({ supabase, session, file: logoFile });
      setMessageType("success");
      setMessage("Shop logo uploaded. Reloading the POS...");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
      setBusy(false);
    }
  }

  async function deleteLogo() {
    if (!canEditShop) return;

    try {
      setBusy(true);
      await removeShopLogo({
        supabase,
        session,
        publicId: shop?.shop_logo_public_id
      });
      setMessageType("success");
      setMessage("Shop logo removed. Reloading the POS...");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="page-stack settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONFIGURATION</p>
          <h1>Settings</h1>
          <p className="muted">
            Every staff member controls their own display. Shop settings are shared.
          </p>
        </div>
      </div>

      {message && <div className={`notice ${messageType}`}>{message}</div>}

      <div className="settings-tabs">
        <button
          type="button"
          className={tab === "personal" ? "active" : ""}
          onClick={() => setTab("personal")}
        >
          <UserRound size={18} />
          My preferences
        </button>
        <button
          type="button"
          className={tab === "shop" ? "active" : ""}
          onClick={() => setTab("shop")}
        >
          <Store size={18} />
          Shop & receipt
        </button>
      </div>

      {tab === "personal" ? (
        <form className="settings-layout" onSubmit={submitPersonal}>
          <section className="panel settings-section">
            <div className="panel-heading">
              <div>
                <h2>Appearance</h2>
                <p className="muted">These choices apply only to your account.</p>
              </div>
              <Palette size={23} />
            </div>

            <div className="form-grid three">
              <label>
                <span>Language</span>
                <select
                  value={language || personal.language}
                  onChange={(event) => updatePersonal("language", event.target.value)}
                >
                  <option value="en">English</option>
                  <option value="km">ខ្មែរ</option>
                </select>
                <small className="field-help">
                  {t("Language changes immediately and is saved to your account.")}
                </small>
              </label>

              <label>
                <span>Theme</span>
                <select
                  value={personal.theme}
                  onChange={(event) => updatePersonal("theme", event.target.value)}
                >
                  <option value="system">Device setting</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>

              <label>
                <span>Accent color</span>
                <input
                  type="color"
                  value={personal.accent_color}
                  onChange={(event) => updatePersonal("accent_color", event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="panel settings-section">
            <h2>POS behavior</h2>
            <div className="settings-toggle-list">
              {[
                ["compact_mode", "Compact layout", "Reduce spacing on large screens."],
                ["sound_enabled", "Confirmation sounds", "Play supported checkout and scanner sounds."],
                ["scanner_vibration", "Scanner vibration", "Vibrate supported phones after a successful scan."]
              ].map(([field, label, detail]) => (
                <label className="settings-toggle" key={field}>
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(personal[field])}
                    onChange={(event) => updatePersonal(field, event.target.checked)}
                  />
                </label>
              ))}
            </div>
          </section>

          <div className="settings-save-row">
            <button className="primary-button" disabled={busy}>
              <Save size={18} />
              {busy ? "Saving..." : "Save my preferences"}
            </button>
          </div>
        </form>
      ) : (
        <form className="settings-layout" onSubmit={submitShop}>
          {!canEditShop && (
            <div className="notice warning">
              Shop settings are visible to all staff. Only an owner or admin can edit them.
            </div>
          )}

          <section className="panel settings-section">
            <div className="panel-heading">
              <div>
                <h2>Shop identity</h2>
                <p className="muted">Used on receipts and printed documents.</p>
              </div>
              <Store size={23} />
            </div>

            <div className="shop-identity-layout">
              <div className="form-grid two">
                <label>
                  <span>Shop name</span>
                  <input
                    value={shopForm.shop_name}
                    disabled={!canEditShop}
                    onChange={(event) => updateShop("shop_name", event.target.value)}
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <input
                    value={shopForm.shop_phone}
                    disabled={!canEditShop}
                    onChange={(event) => updateShop("shop_phone", event.target.value)}
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={shopForm.shop_email}
                    disabled={!canEditShop}
                    onChange={(event) => updateShop("shop_email", event.target.value)}
                  />
                </label>
                <label>
                  <span>Tax or registration ID</span>
                  <input
                    value={shopForm.tax_id}
                    disabled={!canEditShop}
                    onChange={(event) => updateShop("tax_id", event.target.value)}
                  />
                </label>
                <label className="settings-wide-field">
                  <span>Address</span>
                  <textarea
                    rows="3"
                    value={shopForm.shop_address}
                    disabled={!canEditShop}
                    onChange={(event) => updateShop("shop_address", event.target.value)}
                  />
                </label>
              </div>

              <div className="shop-logo-editor">
                <span className="field-title">Shop logo</span>
                <div className="shop-logo-preview">
                  {logoPreview ? <img src={logoPreview} alt="Shop logo preview" /> : <Store size={42} />}
                </div>

                {canEditShop && (
                  <>
                    <label className="secondary-button file-button">
                      <ImagePlus size={18} />
                      Choose logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => setLogoFile(event.target.files?.[0] || null)}
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={!logoFile || busy}
                      onClick={uploadLogo}
                    >
                      Upload logo
                    </button>
                    {shop?.shop_logo_url && (
                      <button
                        type="button"
                        className="danger-button"
                        disabled={busy}
                        onClick={deleteLogo}
                      >
                        <Trash2 size={18} />
                        Remove logo
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="panel settings-section">
            <div className="panel-heading">
              <div>
                <h2>Business defaults</h2>
                <p className="muted">Shared defaults used by products and sales.</p>
              </div>
            </div>

            <div className="form-grid three">
              <label>
                <span>Base currency</span>
                <select
                  value={shopForm.base_currency}
                  disabled={!canEditShop}
                  onChange={(event) => updateShop("base_currency", event.target.value)}
                >
                  <option value="USD">USD</option>
                  <option value="KHR">KHR</option>
                </select>
              </label>
              <label>
                <span>USD to KHR rate</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={shopForm.usd_to_khr_rate}
                  disabled={!canEditShop}
                  onChange={(event) => updateShop("usd_to_khr_rate", event.target.value)}
                />
              </label>
              <label>
                <span>Default tax (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={shopForm.tax_percent}
                  disabled={!canEditShop}
                  onChange={(event) => updateShop("tax_percent", event.target.value)}
                />
              </label>
              <label>
                <span>Low-stock threshold</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={shopForm.low_stock_threshold}
                  disabled={!canEditShop}
                  onChange={(event) => updateShop("low_stock_threshold", event.target.value)}
                />
              </label>
              <label>
                <span>Invoice prefix</span>
                <input
                  maxLength="12"
                  value={shopForm.invoice_prefix}
                  disabled={!canEditShop}
                  onChange={(event) => updateShop("invoice_prefix", event.target.value.toUpperCase())}
                />
              </label>
              <label>
                <span>Default language</span>
                <select
                  value={shopForm.default_language}
                  disabled={!canEditShop}
                  onChange={(event) => updateShop("default_language", event.target.value)}
                >
                  <option value="en">English</option>
                  <option value="km">ខ្មែរ</option>
                </select>
              </label>
              <label>
                <span>Default theme</span>
                <select
                  value={shopForm.default_theme}
                  disabled={!canEditShop}
                  onChange={(event) => updateShop("default_theme", event.target.value)}
                >
                  <option value="system">Device setting</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>

            <label className="settings-toggle standalone-toggle">
              <span>
                <strong>Allow negative stock</strong>
                <small>Use only when sales must continue without confirmed stock.</small>
              </span>
              <input
                type="checkbox"
                checked={shopForm.allow_negative_stock}
                disabled={!canEditShop}
                onChange={(event) => updateShop("allow_negative_stock", event.target.checked)}
              />
            </label>
          </section>

          <section className="panel settings-section">
            <div className="panel-heading">
              <div>
                <h2>Receipt design</h2>
                <p className="muted">Control thermal receipt content.</p>
              </div>
              <ReceiptText size={23} />
            </div>

            <div className="receipt-settings-layout">
              <div className="receipt-settings-fields">
                <div className="form-grid two">
                  <label>
                    <span>Receipt width</span>
                    <select
                      value={shopForm.receipt_width_mm}
                      disabled={!canEditShop}
                      onChange={(event) => updateShop("receipt_width_mm", Number(event.target.value))}
                    >
                      <option value="58">58 mm</option>
                      <option value="80">80 mm</option>
                    </select>
                  </label>
                  <label>
                    <span>Header message</span>
                    <input
                      value={shopForm.receipt_header}
                      disabled={!canEditShop}
                      onChange={(event) => updateShop("receipt_header", event.target.value)}
                      placeholder="Optional message above invoice details"
                    />
                  </label>
                  <label className="settings-wide-field">
                    <span>Receipt footer</span>
                    <textarea
                      rows="3"
                      value={shopForm.receipt_footer}
                      disabled={!canEditShop}
                      onChange={(event) => updateShop("receipt_footer", event.target.value)}
                    />
                  </label>
                </div>

                <div className="settings-toggle-list compact-toggles">
                  {[
                    ["receipt_show_logo", "Show logo"],
                    ["receipt_show_address", "Show address"],
                    ["receipt_show_phone", "Show phone and email"],
                    ["receipt_show_customer", "Show customer"],
                    ["receipt_show_cashier", "Show cashier"],
                    ["receipt_show_barcode", "Show invoice barcode"]
                  ].map(([field, label]) => (
                    <label className="settings-toggle" key={field}>
                      <span><strong>{label}</strong></span>
                      <input
                        type="checkbox"
                        checked={Boolean(shopForm[field])}
                        disabled={!canEditShop}
                        onChange={(event) => updateShop(field, event.target.checked)}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="receipt-settings-preview" style={receiptPreviewStyle}>
                {shopForm.receipt_show_logo && logoPreview && (
                  <img src={logoPreview} alt="" />
                )}
                <strong>{shopForm.shop_name || "Tiny POS"}</strong>
                {shopForm.receipt_header && <span>{shopForm.receipt_header}</span>}
                <hr />
                <span>INV-MAIN-00001</span>
                <span>Sample product × 1</span>
                <b>$10.00</b>
                <hr />
                <strong>Total $10.00</strong>
                <span>{shopForm.receipt_footer}</span>
              </div>
            </div>
          </section>

          <section className="panel settings-section">
            <div className="panel-heading">
              <div>
                <h2>Barcode label defaults</h2>
                <p className="muted">Used when opening Barcode & Price Labels.</p>
              </div>
              <Barcode size={23} />
            </div>

            <div className="form-grid four">
              <label>
                <span>Width (mm)</span>
                <input
                  type="number"
                  min="20"
                  max="120"
                  value={shopForm.label_width_mm}
                  disabled={!canEditShop}
                  onChange={(event) => updateShop("label_width_mm", event.target.value)}
                />
              </label>
              <label>
                <span>Height (mm)</span>
                <input
                  type="number"
                  min="15"
                  max="100"
                  value={shopForm.label_height_mm}
                  disabled={!canEditShop}
                  onChange={(event) => updateShop("label_height_mm", event.target.value)}
                />
              </label>
              <label>
                <span>Columns</span>
                <select
                  value={shopForm.label_columns}
                  disabled={!canEditShop}
                  onChange={(event) => updateShop("label_columns", Number(event.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map((number) => (
                    <option value={number} key={number}>{number}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Barcode format</span>
                <select
                  value={shopForm.label_barcode_format}
                  disabled={!canEditShop}
                  onChange={(event) => updateShop("label_barcode_format", event.target.value)}
                >
                  <option value="CODE128">CODE128</option>
                  <option value="EAN13">EAN-13</option>
                </select>
              </label>
            </div>

            <div className="label-toggle-row">
              {[
                ["label_show_name", "Show product name"],
                ["label_show_price", "Show selling price"],
                ["label_show_sku", "Show product code"]
              ].map(([field, label]) => (
                <label className="check-row" key={field}>
                  <input
                    type="checkbox"
                    checked={Boolean(shopForm[field])}
                    disabled={!canEditShop}
                    onChange={(event) => updateShop(field, event.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          {canEditShop && (
            <div className="settings-save-row">
              <button className="primary-button" disabled={busy}>
                <Save size={18} />
                {busy ? "Saving..." : "Save shop settings"}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
