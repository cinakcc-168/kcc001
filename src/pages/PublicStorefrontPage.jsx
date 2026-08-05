import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImageUp,
  Minus,
  PackageSearch,
  Plus,
  Search,
  ShoppingBag,
  Store,
  Truck,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  loadPublicStorefront,
  onlineMoney,
  onlineStatusLabel,
  submitPublicOrder,
  trackPublicOrder,
  uploadPublicBankSlip
} from "../lib/onlineStore";

function initialOrder(store = null) {
  const fulfilment = store?.allow_pickup === false ? "delivery" : "pickup";
  const payment = fulfilment === "pickup" && store?.allow_pay_at_store !== false
    ? "pay_at_store"
    : store?.allow_cash_on_delivery
      ? "cash_on_delivery"
      : store?.allow_bank_transfer
        ? "bank_transfer"
        : "pay_at_store";

  return {
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    fulfilment_type: fulfilment,
    payment_method: payment,
    delivery_address: "",
    requested_date: "",
    customer_note: "",
    bank_reference: "",
    bank_slip_url: "",
    bank_slip_public_id: "",
    website: ""
  };
}

function unitFor(product, unitId) {
  return (product.units || []).find((unit) => unit.id === unitId)
    || (product.units || [])[0]
    || null;
}

export default function PublicStorefrontPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem("tiny-pos-public-language")
        || (navigator.language?.toLowerCase().startsWith("km") ? "km" : "en");
    } catch {
      return navigator.language?.toLowerCase().startsWith("km") ? "km" : "en";
    }
  });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [unitChoices, setUnitChoices] = useState({});
  const [cart, setCart] = useState([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orderValues, setOrderValues] = useState(initialOrder());
  const [submitting, setSubmitting] = useState(false);
  const [slipUploading, setSlipUploading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [tracking, setTracking] = useState({ order: "", token: "" });
  const [trackedOrder, setTrackedOrder] = useState(null);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);

  function label(en, km) {
    return language === "km" ? km : en;
  }

  useEffect(() => {
    try { localStorage.setItem("tiny-pos-public-language", language); } catch { /* optional */ }
    document.documentElement.lang = language === "km" ? "km" : "en";
  }, [language]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const result = await loadPublicStorefront(slug);
        if (!active) return;
        setData(result);
        setOrderValues(initialOrder(result.store));
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [slug]);

  const banners = useMemo(
    () => (Array.isArray(data?.store?.banner_images) ? data.store.banner_images : []).filter((item) => item?.url),
    [data?.store?.banner_images]
  );

  useEffect(() => {
    setBannerIndex(0);
    if (banners.length < 2) return undefined;
    const seconds = Math.max(2, Math.min(30, Number(data?.store?.banner_interval_seconds || 5)));
    const timer = window.setInterval(() => {
      setBannerIndex((current) => (current + 1) % banners.length);
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [banners, data?.store?.banner_interval_seconds]);

  const products = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.products || []).filter((product) => {
      if (category !== "all" && product.category_id !== category) return false;
      if (!term) return true;
      return [product.name, product.name_km, product.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [data?.products, search, category]);

  const currency = cart[0]?.currency || "USD";
  const subtotal = cart.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unit.price),
    0
  );
  const deliveryFee = orderValues.fulfilment_type === "delivery"
    ? Number(currency === "KHR" ? data?.store?.delivery_fee_khr : data?.store?.delivery_fee_usd)
    : 0;
  const total = subtotal + deliveryFee;

  function updateOrder(name, value) {
    setOrderValues((current) => ({ ...current, [name]: value }));
  }

  function addProduct(product) {
    const selected = unitFor(product, unitChoices[product.id]);
    if (!selected) return;

    if (cart.length && cart[0].currency !== product.currency) {
      window.alert(label(
        "USD and KHR products must be ordered separately.",
        "ផលិតផល USD និង KHR ត្រូវបញ្ជាទិញដាច់ដោយឡែក។"
      ));
      return;
    }

    const available = Number(selected.available_quantity || 0);
    if (available <= 0) {
      window.alert(label("This product is currently out of stock.", "ផលិតផលនេះអស់ពីស្តុក។"));
      return;
    }

    setCart((current) => {
      const index = current.findIndex(
        (item) => item.product.id === product.id && item.unit.id === selected.id
      );
      if (index >= 0) {
        return current.map((item, itemIndex) => itemIndex === index
          ? { ...item, quantity: Math.min(available, Number(item.quantity) + 1) }
          : item);
      }
      return [...current, { product, unit: selected, currency: product.currency, quantity: 1 }];
    });
  }

  function updateQuantity(index, quantity) {
    setCart((current) => current
      .map((item, itemIndex) => itemIndex !== index ? item : {
        ...item,
        quantity: Math.min(
          Number(item.unit.available_quantity || 0),
          Math.max(0, Number(quantity || 0))
        )
      })
      .filter((item) => item.quantity > 0));
  }

  async function uploadSlip(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setSlipUploading(true);
      setError("");
      const uploaded = await uploadPublicBankSlip(slug, file);
      setOrderValues((current) => ({
        ...current,
        bank_slip_url: uploaded.url,
        bank_slip_public_id: uploaded.public_id
      }));
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setSlipUploading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (orderValues.payment_method === "bank_transfer" && !orderValues.bank_slip_url) {
      setError(label(
        "Upload your bank-transfer slip before submitting the order.",
        "សូមបញ្ចូលរូបសន្លឹកបង់ប្រាក់មុនពេលផ្ញើការបញ្ជាទិញ។"
      ));
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const result = await submitPublicOrder(slug, {
        ...orderValues,
        items: cart.map((item) => ({ product_unit_id: item.unit.id, quantity: item.quantity }))
      });
      setSuccess(result);
      setTracking({ order: result.order_number, token: result.tracking_token });
      setCart([]);
      setCheckoutOpen(false);
      setOrderValues(initialOrder(data.store));
      try {
        localStorage.setItem(
          `tiny-pos-online-order:${slug}:${result.order_number}`,
          result.tracking_token
        );
      } catch { /* token is still shown */ }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function track(event) {
    event.preventDefault();
    try {
      setTrackingBusy(true);
      setError("");
      const result = await trackPublicOrder(slug, tracking.order, tracking.token);
      setTrackedOrder(result.order);
    } catch (requestError) {
      setTrackedOrder(null);
      setError(requestError.message);
    } finally {
      setTrackingBusy(false);
    }
  }

  if (loading) {
    return <div className="public-store-loading"><Store size={36} /><strong>{label("Opening store…", "កំពុងបើកហាង…")}</strong></div>;
  }

  if (!data) {
    return <div className="public-store-loading error"><Store size={36} /><strong>{label("Storefront unavailable", "ហាងអនឡាញមិនអាចប្រើបាន")}</strong><p>{error}</p></div>;
  }

  const activeBanner = banners[bannerIndex] || null;

  return (
    <div className={`public-storefront language-${language}`}>
      <header className="public-store-header">
        <div className="public-store-brand">
          {data.store.shop_logo_url ? <img src={data.store.shop_logo_url} alt="" /> : <span><Store size={27} /></span>}
          <div><strong>{data.store.title}</strong><small>{data.store.branch_name}</small></div>
        </div>
        <div className="public-store-header-actions">
          <div className="public-language-toggle" role="group" aria-label="Language">
            <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
            <button type="button" className={language === "km" ? "active" : ""} onClick={() => setLanguage("km")}>KH</button>
          </div>
          <button type="button" className="public-cart-button" onClick={() => setCheckoutOpen(true)}>
            <ShoppingBag size={20} /><span>{cart.reduce((sum, item) => sum + Number(item.quantity), 0)}</span>
          </button>
        </div>
      </header>

      <section
        className={`public-store-hero ${activeBanner ? "has-banner" : ""}`}
        style={activeBanner ? { backgroundImage: `linear-gradient(90deg,rgba(8,20,40,.82),rgba(8,20,40,.18)),url("${activeBanner.url}")` } : undefined}
      >
        <div className="public-store-hero-content">
          <p className="eyebrow">{label("ORDER ONLINE", "បញ្ជាទិញតាមអនឡាញ")}</p>
          <h1>{data.store.title}</h1>
          <p>{data.store.description || label("Choose products and send your order to the shop.", "ជ្រើសរើសផលិតផល ហើយផ្ញើការបញ្ជាទិញទៅហាង។")}</p>
          <div className="public-store-meta">
            {data.store.allow_pickup && <span><Store size={16} />{label("Branch pickup", "មកទទួលនៅសាខា")}</span>}
            {data.store.allow_delivery && <span><Truck size={16} />{label("Delivery available", "មានសេវាដឹកជញ្ជូន")}</span>}
          </div>
        </div>

        {banners.length > 1 && (
          <div className="public-banner-controls">
            <button type="button" onClick={() => setBannerIndex((bannerIndex - 1 + banners.length) % banners.length)} aria-label="Previous picture"><ChevronLeft size={22} /></button>
            <div>{banners.map((_, index) => <button type="button" aria-label={`Picture ${index + 1}`} className={index === bannerIndex ? "active" : ""} onClick={() => setBannerIndex(index)} key={index} />)}</div>
            <button type="button" onClick={() => setBannerIndex((bannerIndex + 1) % banners.length)} aria-label="Next picture"><ChevronRight size={22} /></button>
          </div>
        )}
      </section>

      {error && <div className="public-store-notice error">{error}<button type="button" onClick={() => setError("")}>×</button></div>}

      {success && (
        <section className="public-order-success">
          <CheckCircle2 size={34} />
          <div>
            <h2>{label("Order received", "បានទទួលការបញ្ជាទិញ")}</h2>
            <p>{label("Order number", "លេខបញ្ជាទិញ")}: <strong>{success.order_number}</strong></p>
            <p>{label("Total", "សរុប")}: <strong>{onlineMoney(success.total_amount, success.currency)}</strong></p>
            <p>{success.customer_message || label("The shop will review stock and contact you.", "ហាងនឹងពិនិត្យស្តុក ហើយទាក់ទងទៅអ្នក។")}</p>
            {success.bank_slip_url && <p className="public-slip-confirmed">✓ {label("Bank slip submitted for review.", "បានផ្ញើសន្លឹកបង់ប្រាក់សម្រាប់ពិនិត្យ។")}</p>}
            <div className="tracking-token-box">
              <small>{label("Keep this tracking token private", "សូមរក្សាកូដតាមដាននេះជាសម្ងាត់")}</small>
              <code>{success.tracking_token}</code>
            </div>
          </div>
        </section>
      )}

      <main className="public-store-main">
        <div className="public-store-toolbar">
          <label><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={label("Search products", "ស្វែងរកផលិតផល")} /></label>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">{label("All categories", "គ្រប់ប្រភេទ")}</option>
            {(data.categories || []).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </div>

        <div className="public-product-grid">
          {products.map((product) => {
            const selected = unitFor(product, unitChoices[product.id]);
            const soldOut = !selected || Number(selected.available_quantity || 0) <= 0;
            return (
              <article className="public-product-card" key={product.id}>
                <div className="public-product-image">
                  <img src={product.image_url || "/assets/tiny-pos-product-placeholder.png"} alt="" className={!product.image_url ? "placeholder" : ""} />
                  {product.featured && <span>{label("Featured", "ពេញនិយម")}</span>}
                </div>
                <div className="public-product-content">
                  <div className="public-product-title-row">
                    <h2>{language === "km" && product.name_km ? product.name_km : product.name}</h2>
                    <small className={soldOut ? "out" : "available"}>{soldOut ? label("Out of stock", "អស់ពីស្តុក") : label("Available", "មានស្តុក")}</small>
                  </div>
                  {product.description && <p>{product.description}</p>}
                  <div className="public-price-unit-row">
                    <div className="public-product-price">
                      <strong>{selected ? onlineMoney(selected.price, product.currency) : "—"}</strong>
                      {selected && Number(selected.list_price) > Number(selected.price) && <del>{onlineMoney(selected.list_price, product.currency)}</del>}
                    </div>
                    <select
                      value={selected?.id || ""}
                      onChange={(event) => setUnitChoices((current) => ({ ...current, [product.id]: event.target.value }))}
                      aria-label={label("Selling unit", "ឯកតាលក់")}
                    >
                      {(product.units || []).map((unit) => <option value={unit.id} key={unit.id}>{unit.short_name || unit.name}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={() => addProduct(product)} disabled={soldOut}><Plus size={18} />{label("Add to order", "បន្ថែមទៅការបញ្ជាទិញ")}</button>
                </div>
              </article>
            );
          })}
        </div>

        {!products.length && <div className="empty-state"><PackageSearch size={38} /><strong>{label("No products found", "រកមិនឃើញផលិតផល")}</strong></div>}

        <section className="public-track-section">
          <h2>{label("Track an order", "តាមដានការបញ្ជាទិញ")}</h2>
          <form onSubmit={track}>
            <input value={tracking.order} onChange={(event) => setTracking((current) => ({ ...current, order: event.target.value }))} placeholder={label("Order number", "លេខបញ្ជាទិញ")} required />
            <input value={tracking.token} onChange={(event) => setTracking((current) => ({ ...current, token: event.target.value }))} placeholder={label("Private tracking token", "កូដតាមដានសម្ងាត់")} required />
            <button type="submit" disabled={trackingBusy}>{trackingBusy ? label("Checking…", "កំពុងពិនិត្យ…") : label("Track order", "តាមដាន")}</button>
          </form>
          {trackedOrder && (
            <div className="public-tracked-order">
              <strong>{trackedOrder.order_number}</strong>
              <span className={`status-badge ${trackedOrder.status}`}>{onlineStatusLabel(trackedOrder.status, language)}</span>
              <p>{label("Total", "សរុប")}: {onlineMoney(trackedOrder.total_amount, trackedOrder.currency)}</p>
              <div className="public-status-timeline">
                {(trackedOrder.history || []).map((item, index) => (
                  <div key={`${item.status}-${index}`}><span /><div><strong>{onlineStatusLabel(item.status, language)}</strong>{item.note && <p>{item.note}</p>}</div></div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      {cart.length > 0 && (
        <button type="button" className="public-floating-cart" onClick={() => setCheckoutOpen(true)}>
          <ShoppingBag size={21} />
          <span>{cart.reduce((sum, item) => sum + Number(item.quantity), 0)} {label("items", "មុខទំនិញ")}</span>
          <strong>{onlineMoney(subtotal, currency)}</strong>
        </button>
      )}

      {checkoutOpen && (
        <div className="public-checkout-backdrop">
          <form className="public-checkout" onSubmit={submit}>
            <div className="modal-head">
              <div><p className="eyebrow">{label("CUSTOMER ORDER", "ការបញ្ជាទិញអតិថិជន")}</p><h2>{label("Review and submit", "ពិនិត្យ និងផ្ញើ")}</h2></div>
              <button type="button" className="icon-button" onClick={() => setCheckoutOpen(false)}><X size={21} /></button>
            </div>

            <div className="public-cart-lines">
              {cart.map((item, index) => (
                <div key={`${item.product.id}-${item.unit.id}`}>
                  <div><strong>{language === "km" && item.product.name_km ? item.product.name_km : item.product.name}</strong><small>{item.unit.name}</small></div>
                  <div className="public-qty">
                    <button type="button" onClick={() => updateQuantity(index, item.quantity - 1)}><Minus size={15} /></button>
                    <input type="number" min="0" max={item.unit.available_quantity} value={item.quantity} onChange={(event) => updateQuantity(index, event.target.value)} />
                    <button type="button" onClick={() => updateQuantity(index, item.quantity + 1)}><Plus size={15} /></button>
                  </div>
                  <strong>{onlineMoney(item.quantity * item.unit.price, item.currency)}</strong>
                </div>
              ))}
            </div>

            <div className="form-grid two">
              <label>{label("Full name", "ឈ្មោះពេញ")}<input value={orderValues.customer_name} onChange={(event) => updateOrder("customer_name", event.target.value)} required /></label>
              <label>{label("Phone number", "លេខទូរស័ព្ទ")}<input value={orderValues.customer_phone} onChange={(event) => updateOrder("customer_phone", event.target.value)} required /></label>
              <label className="full">{label("Email (optional)", "អ៊ីមែល (ជាជម្រើស)")}<input type="email" value={orderValues.customer_email} onChange={(event) => updateOrder("customer_email", event.target.value)} /></label>
              <label>{label("Fulfilment", "វិធីទទួលទំនិញ")}
                <select value={orderValues.fulfilment_type} onChange={(event) => {
                  const value = event.target.value;
                  updateOrder("fulfilment_type", value);
                  if (value === "delivery" && orderValues.payment_method === "pay_at_store") {
                    updateOrder("payment_method", data.store.allow_cash_on_delivery ? "cash_on_delivery" : "bank_transfer");
                  }
                }}>
                  {data.store.allow_pickup && <option value="pickup">{label("Branch pickup", "មកទទួលនៅសាខា")}</option>}
                  {data.store.allow_delivery && <option value="delivery">{label("Delivery", "ដឹកជញ្ជូន")}</option>}
                </select>
              </label>
              <label>{label("Payment", "ការទូទាត់")}
                <select value={orderValues.payment_method} onChange={(event) => updateOrder("payment_method", event.target.value)}>
                  {orderValues.fulfilment_type === "pickup" && data.store.allow_pay_at_store && <option value="pay_at_store">{label("Pay at store", "ទូទាត់នៅហាង")}</option>}
                  {data.store.allow_cash_on_delivery && <option value="cash_on_delivery">{label("Cash on delivery", "សាច់ប្រាក់ពេលទទួល")}</option>}
                  {data.store.allow_bank_transfer && <option value="bank_transfer">{label("Bank transfer", "ផ្ទេរប្រាក់ធនាគារ")}</option>}
                </select>
              </label>

              {orderValues.fulfilment_type === "delivery" && <label className="full">{label("Delivery address", "អាសយដ្ឋានដឹកជញ្ជូន")}<textarea rows={2} value={orderValues.delivery_address} onChange={(event) => updateOrder("delivery_address", event.target.value)} required /></label>}
              <label>{label("Requested date", "ថ្ងៃដែលចង់ទទួល")}<input type="date" value={orderValues.requested_date} onChange={(event) => updateOrder("requested_date", event.target.value)} /></label>
              <label className="full">{label("Order note", "កំណត់ចំណាំ")}<textarea rows={2} value={orderValues.customer_note} onChange={(event) => updateOrder("customer_note", event.target.value)} /></label>

              {orderValues.payment_method === "bank_transfer" && (
                <section className="public-bank-payment full">
                  <div className="public-bank-payment-head">
                    <div><strong>{label("Pay by bank transfer", "ទូទាត់តាមធនាគារ")}</strong><p>{data.store.bank_comment || label("Pay the exact total, then upload your bank slip.", "សូមបង់ចំនួនសរុបត្រឹមត្រូវ ហើយបញ្ចូលរូបសន្លឹកបង់ប្រាក់។")}</p></div>
                    {data.store.bank_qr_url && <img src={data.store.bank_qr_url} alt="Bank QR" />}
                  </div>
                  {data.store.bank_instructions && <pre>{data.store.bank_instructions}</pre>}
                  <label>{label("Bank reference (optional)", "លេខយោងធនាគារ (ជាជម្រើស)")}<input value={orderValues.bank_reference} onChange={(event) => updateOrder("bank_reference", event.target.value)} /></label>
                  <label className={`public-slip-upload ${orderValues.bank_slip_url ? "uploaded" : ""}`}>
                    <ImageUp size={22} />
                    <span>{slipUploading ? label("Uploading slip…", "កំពុងបញ្ចូលសន្លឹក…") : orderValues.bank_slip_url ? label("Bank slip uploaded — tap to replace", "បានបញ្ចូលសន្លឹក — ចុចដើម្បីប្តូរ") : label("Upload bank slip", "បញ្ចូលរូបសន្លឹកបង់ប្រាក់")}</span>
                    <input type="file" accept="image/*" hidden onChange={uploadSlip} disabled={slipUploading} />
                  </label>
                  {orderValues.bank_slip_url && <img className="public-slip-preview" src={orderValues.bank_slip_url} alt="Uploaded bank slip" />}
                </section>
              )}

              <label className="honeypot-field">Website<input value={orderValues.website} onChange={(event) => updateOrder("website", event.target.value)} tabIndex={-1} autoComplete="off" /></label>
            </div>

            <div className="public-checkout-totals">
              <div><span>{label("Subtotal", "សរុបរង")}</span><strong>{onlineMoney(subtotal, currency)}</strong></div>
              <div><span>{label("Delivery fee", "ថ្លៃដឹកជញ្ជូន")}</span><strong>{onlineMoney(deliveryFee, currency)}</strong></div>
              <div><span>{label("Total", "សរុប")}</span><strong>{onlineMoney(total, currency)}</strong></div>
            </div>

            <p className="public-stock-note">{label("Stock and price are checked again when you submit. The shop receives the order first, then creates a reserved Sales Order.", "ស្តុក និងតម្លៃនឹងត្រូវពិនិត្យម្តងទៀតពេលផ្ញើ។ ហាងនឹងទទួលការបញ្ជាទិញ ហើយបង្កើតបញ្ជាទិញលក់ដែលកក់ស្តុក។")}</p>
            <button type="submit" className="public-submit-order" disabled={submitting || slipUploading || !cart.length}>{submitting ? label("Submitting…", "កំពុងផ្ញើ…") : label("Submit order", "ផ្ញើការបញ្ជាទិញ")}</button>
          </form>
        </div>
      )}
    </div>
  );
}
