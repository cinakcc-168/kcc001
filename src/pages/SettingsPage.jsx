import { useEffect, useMemo, useState } from "react";
import { CreditCard, ReceiptText, Save, Settings2, SlidersHorizontal, Store } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { shopFormFromSettings, uploadShopLogo } from "../lib/settings";

const tabs = [
  ["shop", "Shop Identity", Store],
  ["receipt", "Receipt", ReceiptText],
  ["preferences", "My Preferences", SlidersHorizontal],
  ["payment", "Payment & Tax", CreditCard]
];

const emptyShop = {
  shop_name: "",
  shop_phone: "",
  shop_email: "",
  shop_address: "",
  tax_id: "",
  receipt_footer: "",
  receipt_header: "",
  shop_logo_url: "",
  receipt_width_mm: 80,
  receipt_show_logo: true,
  receipt_show_address: true,
  receipt_show_phone: true,
  receipt_show_customer: true,
  receipt_show_cashier: true,
  receipt_show_barcode: true,
  default_language: "en",
  default_theme: "light",
  tax_percent: 0,
  usd_to_khr_rate: 4100
};

const emptyPersonal = {
  language: "en",
  theme_mode: "light",
  compact_mode: false,
  scanner_sound: true,
  scanner_vibration: true,
  new_sale_layout: "layout1",
  sale_product_card_scale: 1,
  sale_show_product_code: true,
  sale_stock_display: "exact"
};

function clampProductScale(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(1.45, Math.max(0.8, number));
}

function NewSaleLayoutPreview({ active, title, description, layout }) {
  return (
    <div className={`new-sale-layout-preview ${active ? "active" : ""}`}>
      <div className={`new-sale-layout-sample ${layout}`} aria-hidden="true">
        {layout === "layout1" ? (
          <>
            <div className="sample-products-area">
              <div className="sample-toolbar-row" />
              <div className="sample-card-grid">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="sample-cart-area">
              <div className="sample-cart-head" />
              <div className="sample-cart-lines">
                <span />
                <span />
                <span />
              </div>
              <div className="sample-cart-footer" />
            </div>
          </>
        ) : (
          <>
            <div className="sample-layout2-left">
              <div className="sample-bill-wide">
                <span />
                <span />
                <span />
              </div>
              <div className="sample-products-area layout2">
                <div className="sample-toolbar-row" />
                <div className="sample-card-grid two-rows">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
            <div className="sample-layout2-right">
              <div className="sample-checkout-card" />
              <div className="sample-checkout-card tall" />
              <div className="sample-cart-footer" />
            </div>
          </>
        )}
      </div>
      <div className="new-sale-layout-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { supabase, session, shop, profile, preferences, saveShopSettings, savePreferences, loading } = useAuth();
  const [tab, setTab] = useState("shop");
  const [shopForm, setShopForm] = useState(emptyShop);
  const [personal, setPersonal] = useState(emptyPersonal);
  const [message, setMessage] = useState("");
  const [savingShop, setSavingShop] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    if (shop) setShopForm({ ...emptyShop, ...shopFormFromSettings(shop), ...shop });
  }, [shop]);

  useEffect(() => {
    if (preferences) {
      setPersonal({
        ...emptyPersonal,
        ...preferences,
        theme_mode: preferences.theme || preferences.theme_mode || "system",
        scanner_sound: preferences.sound_enabled ?? preferences.scanner_sound ?? true,
        sale_product_card_scale: clampProductScale(
          preferences.sale_product_card_scale ?? 1
        ),
        new_sale_layout: preferences.new_sale_layout || "layout1",
        sale_show_product_code: preferences.sale_show_product_code !== false,
        sale_stock_display: preferences.sale_stock_display || "exact"
      });
    }
  }, [preferences]);

  const receiptPreviewWidth = useMemo(
    () => `${Math.max(58, Number(shopForm.receipt_width_mm || 80))}mm`,
    [shopForm.receipt_width_mm]
  );

  if (loading) return <div className="panel">Loading settings...</div>;

  function updateShop(key, value) {
    setShopForm((current) => ({ ...current, [key]: value }));
  }

  function updatePersonal(key, value) {
    setPersonal((current) => ({ ...current, [key]: value }));
  }

  async function handleShopSave(event) {
    event.preventDefault();
    setSavingShop(true);
    setMessage("");
    try {
      await saveShopSettings(shopForm);
      setMessage("Shop settings saved.");
    } catch (error) {
      setMessage(error.message || "Unable to save shop settings.");
    } finally {
      setSavingShop(false);
    }
  }

  async function handlePersonalSave(event) {
    event.preventDefault();
    setSavingPersonal(true);
    setMessage("");
    try {
      await savePreferences({
        ...personal,
        sale_product_card_scale: clampProductScale(personal.sale_product_card_scale)
      });
      setMessage("Your preferences were updated.");
    } catch (error) {
      setMessage(error.message || "Unable to save preferences.");
    } finally {
      setSavingPersonal(false);
    }
  }

  async function onLogoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setMessage("");
    try {
      await uploadShopLogo({ supabase, session, file });
      setMessage("Logo uploaded. Reloading Tiny POS...");
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      setMessage(error.message || "Unable to upload logo.");
    } finally {
      setLogoUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="page-stack settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SYSTEM</p>
          <h1>Settings</h1>
        </div>
        {message && <div className="notice info">{message}</div>}
      </div>

      <div className="settings-tabs">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>

      <div className="settings-layout">
        {tab === "shop" && (
          <form className="settings-section" onSubmit={handleShopSave}>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Shop identity</h2>
                  <p>These details appear across the POS, invoices and receipts.</p>
                </div>
              </div>

              <div className="shop-identity-layout">
                <div className="form-grid two">
                  <label><span>Shop name</span><input value={shopForm.shop_name || ""} onChange={(event) => updateShop("shop_name", event.target.value)} /></label>
                  <label><span>Phone</span><input value={shopForm.shop_phone || ""} onChange={(event) => updateShop("shop_phone", event.target.value)} /></label>
                  <label><span>Email</span><input value={shopForm.shop_email || ""} onChange={(event) => updateShop("shop_email", event.target.value)} /></label>
                  <label><span>Tax ID</span><input value={shopForm.tax_id || ""} onChange={(event) => updateShop("tax_id", event.target.value)} /></label>
                  <label className="settings-wide-field"><span>Address</span><textarea rows="3" value={shopForm.shop_address || ""} onChange={(event) => updateShop("shop_address", event.target.value)} /></label>
                  <label className="settings-wide-field"><span>Receipt header</span><textarea rows="2" value={shopForm.receipt_header || ""} onChange={(event) => updateShop("receipt_header", event.target.value)} /></label>
                  <label className="settings-wide-field"><span>Receipt footer</span><textarea rows="2" value={shopForm.receipt_footer || ""} onChange={(event) => updateShop("receipt_footer", event.target.value)} /></label>
                  <label><span>Default language</span><select value={shopForm.default_language || "en"} onChange={(event) => updateShop("default_language", event.target.value)}><option value="en">English</option><option value="km">Khmer</option></select></label>
                  <label><span>Default theme</span><select value={shopForm.default_theme || "light"} onChange={(event) => updateShop("default_theme", event.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
                </div>

                <div className="shop-logo-editor">
                  <div className="shop-logo-preview">
                    {shopForm.shop_logo_url ? <img src={shopForm.shop_logo_url} alt="Shop logo" /> : <span>No logo uploaded</span>}
                  </div>
                  <label className="secondary-button" style={{ justifyContent: "center", cursor: logoUploading ? "wait" : "pointer" }}>
                    {logoUploading ? "Uploading..." : "Upload logo"}
                    <input type="file" accept="image/*" onChange={onLogoChange} hidden disabled={logoUploading} />
                  </label>
                </div>
              </div>
            </section>

            <div className="settings-save-row">
              <button type="submit" className="primary-button" disabled={savingShop || logoUploading}>
                <Save size={18} /> {savingShop ? "Saving..." : "Save shop settings"}
              </button>
            </div>
          </form>
        )}

        {tab === "receipt" && (
          <form className="settings-section" onSubmit={handleShopSave}>
            <section className="panel receipt-settings-layout">
              <div className="receipt-settings-fields">
                <div>
                  <h2>Receipt setup</h2>
                  <p>Control the default receipt width and what prints for every sale.</p>
                </div>

                <div className="form-grid two">
                  <label>
                    <span>Receipt width (mm)</span>
                    <input type="number" min="58" max="120" value={shopForm.receipt_width_mm || 80} onChange={(event) => updateShop("receipt_width_mm", Number(event.target.value || 80))} />
                  </label>
                  <label>
                    <span>Cashier name on receipt</span>
                    <select value={shopForm.receipt_show_cashier !== false ? "yes" : "no"} onChange={(event) => updateShop("receipt_show_cashier", event.target.value === "yes")}>
                      <option value="yes">Show</option>
                      <option value="no">Hide</option>
                    </select>
                  </label>
                </div>

                <div className="settings-toggle-list compact-toggles">
                  {[
                    ["receipt_show_logo", "Shop logo", "Display the shop logo at the top of each receipt."],
                    ["receipt_show_address", "Shop address", "Show the shop address block."],
                    ["receipt_show_phone", "Phone and email", "Show phone number and email if available."],
                    ["receipt_show_customer", "Customer details", "Include customer name and profile details."],
                    ["receipt_show_barcode", "Invoice barcode", "Render a scannable barcode on the printed receipt."]
                  ].map(([key, title, note]) => (
                    <label key={key} className="settings-toggle">
                      <span><strong>{title}</strong><small>{note}</small></span>
                      <input type="checkbox" checked={shopForm[key] !== false} onChange={(event) => updateShop(key, event.target.checked)} />
                    </label>
                  ))}
                </div>
              </div>

              <div className="receipt-settings-preview" style={{ "--receipt-preview-width": receiptPreviewWidth }}>
                {shopForm.shop_logo_url && shopForm.receipt_show_logo !== false && <img src={shopForm.shop_logo_url} alt="Preview logo" />}
                <b>{shopForm.shop_name || "Tiny POS"}</b>
                {shopForm.receipt_header && <span>{shopForm.receipt_header}</span>}
                {shopForm.receipt_show_address !== false && <span>{shopForm.shop_address || "Shop address"}</span>}
                {shopForm.receipt_show_phone !== false && <span>{shopForm.shop_phone || "+855 xx xxx xxx"}</span>}
                <hr />
                <div>Invoice · INV-00001</div>
                <div>Cashier · {profile?.full_name || "Cashier"}</div>
                {shopForm.receipt_show_customer !== false && <div>Customer · Walk-in</div>}
                <hr />
                <div>1 × Sample product — $1.50</div>
                <div>Subtotal — $1.50</div>
                <div>Total — $1.50</div>
                {shopForm.receipt_show_barcode !== false && <div>[ barcode ]</div>}
                <hr />
                <span>{shopForm.receipt_footer || "Thank you for your purchase."}</span>
              </div>
            </section>

            <div className="settings-save-row">
              <button type="submit" className="primary-button" disabled={savingShop}>
                <Save size={18} /> {savingShop ? "Saving..." : "Save receipt settings"}
              </button>
            </div>
          </form>
        )}

        {tab === "preferences" && (
          <form className="settings-section" onSubmit={handlePersonalSave}>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>My preferences</h2>
                  <p>These settings are saved per user, so each staff member can keep a comfortable New Sale view.</p>
                </div>
              </div>

              <div className="form-grid two">
                <label>
                  <span>Language</span>
                  <select value={personal.language || "en"} onChange={(event) => updatePersonal("language", event.target.value)}>
                    <option value="en">English</option>
                    <option value="km">Khmer</option>
                  </select>
                </label>
                <label>
                  <span>Theme mode</span>
                  <select value={personal.theme_mode || "light"} onChange={(event) => updatePersonal("theme_mode", event.target.value)}>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
              </div>

              <div className="settings-toggle-list">
                <label className="settings-toggle">
                  <span><strong>Compact mode</strong><small>Use a denser interface when you want to fit more content on screen.</small></span>
                  <input type="checkbox" checked={Boolean(personal.compact_mode)} onChange={(event) => updatePersonal("compact_mode", event.target.checked)} />
                </label>
                <label className="settings-toggle">
                  <span><strong>Scanner sound</strong><small>Play a sound after a successful barcode scan.</small></span>
                  <input type="checkbox" checked={personal.scanner_sound !== false} onChange={(event) => updatePersonal("scanner_sound", event.target.checked)} />
                </label>
                <label className="settings-toggle">
                  <span><strong>Scanner vibration</strong><small>Vibrate supported devices after a successful scan.</small></span>
                  <input type="checkbox" checked={personal.scanner_vibration !== false} onChange={(event) => updatePersonal("scanner_vibration", event.target.checked)} />
                </label>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>New Sale workspace</h2>
                  <p>Choose your preferred layout and how products appear in the New Sale screen.</p>
                </div>
              </div>

              <div className="new-sale-layout-grid">
                <label className={`new-sale-layout-card ${personal.new_sale_layout === "layout1" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="new-sale-layout"
                    value="layout1"
                    checked={personal.new_sale_layout === "layout1"}
                    onChange={(event) => updatePersonal("new_sale_layout", event.target.value)}
                  />
                  <NewSaleLayoutPreview
                    active={personal.new_sale_layout === "layout1"}
                    title="Layout 1 · Classic"
                    description="Products on the left and the full bill on the right."
                    layout="layout1"
                  />
                </label>

                <label className={`new-sale-layout-card ${personal.new_sale_layout === "layout2" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="new-sale-layout"
                    value="layout2"
                    checked={personal.new_sale_layout === "layout2"}
                    onChange={(event) => updatePersonal("new_sale_layout", event.target.value)}
                  />
                  <NewSaleLayoutPreview
                    active={personal.new_sale_layout === "layout2"}
                    title="Layout 2 · Wide bill + right checkout"
                    description="Current bill above, product search below, and checkout tools on the right."
                    layout="layout2"
                  />
                </label>
              </div>

              <div className="new-sale-preference-grid">
                <label className="settings-wide-field">
                  <span>Product card size</span>
                  <div className="preference-range-row">
                    <input
                      type="range"
                      min="0.8"
                      max="1.45"
                      step="0.05"
                      value={clampProductScale(personal.sale_product_card_scale)}
                      onChange={(event) => updatePersonal("sale_product_card_scale", clampProductScale(event.target.value))}
                    />
                    <strong>{Math.round(clampProductScale(personal.sale_product_card_scale) * 100)}%</strong>
                  </div>
                  <small className="field-help">Default is 100%. Increase the size when products feel too small, or reduce it to fit more products.</small>
                </label>

                <label>
                  <span>Product code display</span>
                  <select value={personal.sale_show_product_code !== false ? "show" : "hide"} onChange={(event) => updatePersonal("sale_show_product_code", event.target.value === "show")}>
                    <option value="show">Show code / barcode</option>
                    <option value="hide">Hide code / barcode</option>
                  </select>
                </label>

                <label>
                  <span>Stock display style</span>
                  <select value={personal.sale_stock_display || "exact"} onChange={(event) => updatePersonal("sale_stock_display", event.target.value)}>
                    <option value="exact">Show exact units</option>
                    <option value="status">Show only In stock / Out</option>
                  </select>
                </label>
              </div>
            </section>

            <div className="settings-save-row">
              <button type="submit" className="primary-button" disabled={savingPersonal}>
                <Save size={18} /> {savingPersonal ? "Saving..." : "Save my preferences"}
              </button>
            </div>
          </form>
        )}

        {tab === "payment" && (
          <form className="settings-section" onSubmit={handleShopSave}>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Payment & tax</h2>
                  <p>Control the default rate used for USD/KHR conversion and tax calculation.</p>
                </div>
              </div>

              <div className="form-grid two">
                <label>
                  <span>Tax percent (%)</span>
                  <input type="number" min="0" max="100" step="0.01" value={shopForm.tax_percent || 0} onChange={(event) => updateShop("tax_percent", Number(event.target.value || 0))} />
                </label>
                <label>
                  <span>USD → KHR rate</span>
                  <input type="number" min="1" step="1" value={shopForm.usd_to_khr_rate || 4100} onChange={(event) => updateShop("usd_to_khr_rate", Number(event.target.value || 4100))} />
                </label>
              </div>
            </section>

            <div className="settings-save-row">
              <button type="submit" className="primary-button" disabled={savingShop}>
                <Save size={18} /> {savingShop ? "Saving..." : "Save payment settings"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
