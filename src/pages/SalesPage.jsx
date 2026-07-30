import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeDollarSign,
  Camera,
  Clock3,
  ImageOff,
  CirclePause,
  FileText,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  WifiOff
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import BarcodeScanner from "../components/BarcodeScanner";
import Modal from "../components/Modal";
import PaymentModal from "../components/PaymentModal";
import ReceiptModal from "../components/ReceiptModal";
import QuoteSaveModal from "../components/QuoteSaveModal";
import ApprovalRequestModal from "../components/ApprovalRequestModal";
import SaleCart from "../components/SaleCart";
import { cloudinaryThumb, money, stockNumber } from "../lib/catalog";
import {
  buildSaleCartItem,
  calculateSaleTotals,
  completeSale,
  createCustomer,
  creditAccountForCustomer,
  createIdempotencyKey,
  exactSaleProductMatch,
  hydrateParkedCart,
  loadSalesWorkspace,
  previewCoupon,
  removeParkedSale,
  saleUnitForProduct,
  saveParkedSale
} from "../lib/sales";
import { getOpenCashRegisterSummary } from "../lib/cashRegister";
import {
  clearLocalSaleDraft,
  loadLocalSaleDraft,
  saveLocalSaleDraft
} from "../lib/pwa";
import {
  consumeQuoteForSale,
  hydrateQuoteCart,
  saveSalesQuote
} from "../lib/quotes";
import {
  applyPriceCatalog,
  loadCustomerPriceCatalog
} from "../lib/priceLists";
import {
  saleApprovalPayload,
  saleDiscountApprovalRequirement
} from "../lib/permissions";
import {
  consumeDeliveryForSale,
  hydrateSalesOrderDeliveryCart
} from "../lib/salesOrders";

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

const emptyCustomer = { customer_type: "regular", name: "", phone: "", email: "", notes: "" };

export default function SalesPage() {
  const {
    supabase,
    profile,
    shop,
    preferences,
    access,
    can
  } = useAuth();

  const canSell = can("sales.create");
  const canDiscount = can(
    "sales.discount.apply"
  );
  const [baseProducts, setBaseProducts] = useState([]);
  const [priceCatalogs, setPriceCatalogs] = useState({
    USD: null,
    KHR: null
  });
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [parkedSales, setParkedSales] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [cashRegisterOpen, setCashRegisterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [discountType, setDiscountType] = useState("none");
  const [discountValue, setDiscountValue] = useState("0");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [parkedOpen, setParkedOpen] = useState(false);
  const [activeParkedId, setActiveParkedId] = useState(null);
  const [activeParkLabel, setActiveParkLabel] = useState("");
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [activeQuote, setActiveQuote] = useState(null);
  const [activeOrderDelivery, setActiveOrderDelivery] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [approvalRequest, setApprovalRequest] = useState(null);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey());
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const draftReadyRef = useRef(false);
  const skipDraftSaveRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.organization_id || !profile?.branch_id) return;

    try {
      setLoading(true);
      const [data, registerSummary] = await Promise.all([
        loadSalesWorkspace(
          supabase,
          profile.organization_id,
          profile.branch_id
        ),
        getOpenCashRegisterSummary(supabase)
      ]);

      setBaseProducts(data.products);
      setCategories(data.categories);
      setCustomers(data.customers);
      setParkedSales(data.parkedSales);
      setRecentSales(data.recentSales);
      setCashRegisterOpen(Boolean(registerSummary?.session));
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      refresh();
    }

    function handleOffline() {
      setIsOnline(false);
      setPaymentOpen(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh]);

  useEffect(() => {
    let active = true;

    if (
      !supabase
      || !profile?.branch_id
    ) {
      return undefined;
    }

    (async () => {
      try {
        const [usd, khr] = await Promise.all([
          loadCustomerPriceCatalog(
            supabase,
            customerId || null,
            "USD"
          ),
          loadCustomerPriceCatalog(
            supabase,
            customerId || null,
            "KHR"
          )
        ]);

        if (!active) return;

        setPriceCatalogs({ USD: usd, KHR: khr });
      } catch (error) {
        if (!active) return;
        announce("error", error.message);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    supabase,
    profile?.branch_id,
    customerId
  ]);

  const products = useMemo(() => {
    const usdProducts = applyPriceCatalog(
      baseProducts.filter(
        (product) => product.currency === "USD"
      ),
      priceCatalogs.USD
    );

    const khrProducts = applyPriceCatalog(
      baseProducts.filter(
        (product) => product.currency === "KHR"
      ),
      priceCatalogs.KHR
    );

    const priced = new Map(
      [...usdProducts, ...khrProducts]
        .map((product) => [product.id, product])
    );

    return baseProducts.map(
      (product) => priced.get(product.id) || product
    );
  }, [baseProducts, priceCatalogs]);

  useEffect(() => {
    if (cart.length === 0 || activeOrderDelivery) return;

    setCart((current) =>
      current.map((item) => {
        const product = products.find(
          (row) => row.id === item.id
        );

        if (!product) return item;

        const unit = saleUnitForProduct(
          product,
          item.selected_unit_id
        );

        return {
          ...buildSaleCartItem(product, unit.id),
          quantity: item.quantity
        };
      })
    );
  }, [priceCatalogs, baseProducts, activeOrderDelivery]);

  useEffect(() => {
    draftReadyRef.current = false;
  }, [profile?.id, profile?.branch_id]);

  useEffect(() => {
    if (
      loading ||
      draftReadyRef.current ||
      products.length === 0 ||
      !profile?.id
    ) {
      return;
    }

    draftReadyRef.current = true;

    const pendingDelivery =
      consumeDeliveryForSale(profile);

    if (pendingDelivery && cart.length === 0) {
      const hydrated =
        hydrateSalesOrderDeliveryCart(
          products,
          pendingDelivery.order,
          pendingDelivery.delivery
        );

      if (hydrated.cart.length > 0) {
        skipDraftSaveRef.current = true;
        setCart(hydrated.cart);
        setCustomerId(
          pendingDelivery.order.customer_id || ""
        );
        setCouponCode("");
        setAppliedCoupon(null);
        setDiscountType("none");
        setDiscountValue("0");
        setNotes(
          pendingDelivery.delivery.notes
          || pendingDelivery.order.notes
          || ""
        );
        setActiveParkedId(null);
        setActiveParkLabel("");
        setActiveQuote(null);
        setActiveOrderDelivery(pendingDelivery);
        setIdempotencyKey(
          createIdempotencyKey()
        );

        announce(
          "success",
          `${pendingDelivery.delivery.delivery_number} loaded from ${pendingDelivery.order.order_number}. Products, customer and quantities are locked.`
        );

        if (hydrated.missing.length > 0) {
          announce(
            "error",
            `${hydrated.missing.length} delivery item(s) are unavailable. Cancel this draft delivery and prepare it again.`
          );
        }

        return;
      }
    }

    const pendingQuote =
      consumeQuoteForSale(profile);

    if (pendingQuote && cart.length === 0) {
      const hydrated =
        hydrateQuoteCart(
          products,
          pendingQuote
        );

      if (hydrated.cart.length > 0) {
        skipDraftSaveRef.current = true;
        setCart(hydrated.cart);
        setCustomerId(
          pendingQuote.customer_id || ""
        );
        setCouponCode(
          pendingQuote.coupon_code || ""
        );
        setAppliedCoupon(null);

        if (pendingQuote.coupon_code) {
          setDiscountType("none");
          setDiscountValue("0");
        } else {
          setDiscountType(
            pendingQuote.discount_type
            || "none"
          );
          setDiscountValue(
            String(
              pendingQuote.discount_value
              || 0
            )
          );
        }

        setNotes(pendingQuote.notes || "");
        setActiveParkedId(null);
        setActiveParkLabel("");
        setActiveQuote(pendingQuote);
        setIdempotencyKey(
          createIdempotencyKey()
        );

        announce(
          pendingQuote.coupon_code
            ? "error"
            : "success",
          pendingQuote.coupon_code
            ? `${pendingQuote.quote_number} loaded. Reapply coupon ${pendingQuote.coupon_code} before saving or payment.`
            : `${pendingQuote.quote_number} loaded into New Sale.`
        );

        if (hydrated.missing.length > 0) {
          announce(
            "error",
            `${hydrated.missing.length} unavailable quotation item(s) were removed.`
          );
        }

        return;
      }
    }

    const draft = loadLocalSaleDraft(profile);
    if (!draft || cart.length > 0) return;

    const hydrated = draft.active_order_delivery
      ? hydrateSalesOrderDeliveryCart(
          products,
          draft.active_order_delivery.order,
          draft.active_order_delivery.delivery
        )
      : hydrateParkedCart(
          products,
          draft.cart || []
        );

    if (hydrated.cart.length === 0) {
      clearLocalSaleDraft(profile);
      return;
    }

    skipDraftSaveRef.current = true;
    setCart(hydrated.cart);
    setCustomerId(draft.customer_id || "");
    setCouponCode(draft.coupon_code || "");
    setAppliedCoupon(null);

    if (draft.coupon_code) {
      setDiscountType("none");
      setDiscountValue("0");
    } else {
      setDiscountType(draft.discount_type || "none");
      setDiscountValue(String(draft.discount_value || 0));
    }

    setNotes(draft.notes || "");
    setActiveParkedId(draft.active_parked_id || null);
    setActiveParkLabel(draft.active_parked_label || "");
    setActiveQuote(
      draft.active_quote_id
        ? {
            id: draft.active_quote_id,
            quote_number:
              draft.active_quote_number,
            status:
              draft.active_quote_status,
            valid_until:
              draft.active_quote_valid_until,
            terms:
              draft.active_quote_terms || ""
          }
        : null
    );
    setActiveOrderDelivery(
      draft.active_order_delivery || null
    );
    setIdempotencyKey(createIdempotencyKey());

    announce(
      draft.coupon_code ? "error" : "success",
      draft.coupon_code
        ? `Local sale draft restored. Reapply coupon ${draft.coupon_code} while online.`
        : "Local sale draft restored from this device."
    );
  }, [
    loading,
    products,
    profile,
    cart.length
  ]);

  useEffect(() => {
    if (!draftReadyRef.current || !profile?.id) {
      return;
    }

    if (skipDraftSaveRef.current) {
      skipDraftSaveRef.current = false;
      return;
    }

    const hasDraft =
      cart.length > 0 ||
      Boolean(customerId) ||
      Boolean(notes.trim()) ||
      discountType !== "none" ||
      Boolean(couponCode.trim()) ||
      Boolean(activeParkedId) ||
      Boolean(activeQuote?.id) ||
      Boolean(activeOrderDelivery?.delivery?.id);

    if (!hasDraft) {
      clearLocalSaleDraft(profile);
      return;
    }

    saveLocalSaleDraft(profile, {
      cart: cart.map((item) => ({
        product_id: item.id,
        product_unit_id:
          item.selected_unit_id || null,
        quantity: Number(item.quantity || 0)
      })),
      customer_id: customerId || null,
      discount_type:
        appliedCoupon ? "none" : discountType,
      discount_value:
        appliedCoupon ? 0 : Number(discountValue || 0),
      coupon_code:
        appliedCoupon?.code || couponCode.trim() || null,
      notes,
      active_parked_id: activeParkedId,
      active_parked_label: activeParkLabel,
      active_quote_id:
        activeQuote?.id || null,
      active_quote_number:
        activeQuote?.quote_number || null,
      active_quote_status:
        activeQuote?.status || null,
      active_quote_valid_until:
        activeQuote?.valid_until || null,
      active_quote_terms:
        activeQuote?.terms || null,
      active_order_delivery:
        activeOrderDelivery || null
    });
  }, [
    profile,
    cart,
    customerId,
    discountType,
    discountValue,
    couponCode,
    appliedCoupon,
    notes,
    activeParkedId,
    activeParkLabel,
    activeQuote,
    activeOrderDelivery
  ]);

  const visibleProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !needle ||
        [
          product.name,
          product.name_km,
          product.sku,
          product.barcode,
          ...(product.product_units || []).flatMap((unit) => [
            unit.name,
            unit.short_name,
            unit.barcode
          ])
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(needle)
          );
      const matchesCategory =
        categoryFilter === "all" || product.category_id === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter, shop]);

  const currency = cart[0]?.currency || shop?.base_currency || "USD";
  const totals = useMemo(
    () => calculateSaleTotals(
      cart,
      discountType,
      discountValue,
      Number(shop?.tax_percent || 0)
    ),
    [cart, discountType, discountValue, shop]
  );

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );
  const selectedCreditAccount = creditAccountForCustomer(
    selectedCustomer,
    currency
  );

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  function invalidateCoupon() {
    if (!appliedCoupon) return;
    setAppliedCoupon(null);
    setDiscountType("none");
    setDiscountValue("0");
  }

  async function applyCoupon() {
    if (!isOnline) {
      announce(
        "error",
        "Reconnect before validating a coupon."
      );
      return;
    }

    if (activeOrderDelivery) {
      setQuoteOpen(false);
      announce("error", "A prepared delivery cannot be saved as a quotation.");
      return;
    }

    if (cart.length === 0) {
      announce("error", "Add a product before applying a coupon.");
      return;
    }

    if (!couponCode.trim()) {
      announce("error", "Enter a coupon code.");
      return;
    }

    try {
      setCouponBusy(true);
      const result = await previewCoupon(supabase, {
        code: couponCode,
        cart,
        customer_id: customerId,
        currency
      });

      setAppliedCoupon(result);
      setCouponCode(result.code);
      setDiscountType("fixed");
      setDiscountValue(String(result.discount_amount));
      announce(
        "success",
        `${result.code} applied: ${money(result.discount_amount, currency)} discount.`
      );
    } catch (error) {
      setAppliedCoupon(null);
      setDiscountType("none");
      setDiscountValue("0");
      announce("error", error.message);
    } finally {
      setCouponBusy(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setDiscountType("none");
    setDiscountValue("0");
  }

  function validateQuantity(product, unit, quantity) {
    const next = Number(quantity);
    if (!Number.isFinite(next) || next <= 0) {
      throw new Error("Quantity must be greater than zero.");
    }

    const factor = Number(unit?.conversion_factor || 1);
    const requestedBase = next * factor;

    if (
      product.track_stock
      && !product.allow_negative_stock
      && !shop?.allow_negative_stock
      && requestedBase > Number(product.stock_quantity || 0)
    ) {
      throw new Error(
        `${product.name} has only ${stockNumber(
          Number(product.stock_quantity || 0) / factor
        )} ${unit?.name || product.unit_name} available.`
      );
    }

    return next;
  }

  function addProduct(product, preferredUnitId = null) {
    try {
      if (!canSell) throw new Error("Your role cannot create sales.");
      if (activeOrderDelivery) {
        throw new Error("Products are locked for this prepared sales-order delivery.");
      }
      if (cart.length > 0 && cart[0].currency !== product.currency) {
        throw new Error(
          `This bill already uses ${cart[0].currency}. Mixed currencies are not allowed.`
        );
      }

      const unit = saleUnitForProduct(product, preferredUnitId);
      const existing = cart.find((item) => item.id === product.id);
      invalidateCoupon();

      if (existing && existing.selected_unit_id === unit.id) {
        const nextQuantity = validateQuantity(
          product,
          unit,
          Number(existing.quantity || 0) + 1
        );
        setCart((current) => current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: nextQuantity }
            : item
        ));
      } else if (existing) {
        validateQuantity(product, unit, 1);
        setCart((current) => current.map((item) =>
          item.id === product.id
            ? { ...buildSaleCartItem(product, unit.id), quantity: 1 }
            : item
        ));
      } else {
        validateQuantity(product, unit, 1);
        setCart((current) => [
          ...current,
          buildSaleCartItem(product, unit.id)
        ]);
      }

      if (preferences?.scanner_vibration) navigator.vibrate?.(55);
      setSearch("");
      announce("success", `${product.name} · ${unit.name} added to the bill.`);
    } catch (error) {
      announce("error", error.message);
    }
  }

  function changeQuantity(productId, value) {
    if (activeOrderDelivery) return;
    const product = cart.find((item) => item.id === productId);
    if (!product) return;

    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      invalidateCoupon();
      setCart((current) => current.filter((item) => item.id !== productId));
      return;
    }

    try {
      const unit = saleUnitForProduct(product, product.selected_unit_id);
      const quantity = validateQuantity(product, unit, number);
      invalidateCoupon();
      setCart((current) => current.map((item) =>
        item.id === productId ? { ...item, quantity } : item
      ));
    } catch (error) {
      announce("error", error.message);
    }
  }

  function changeUnit(productId, unitId) {
    if (activeOrderDelivery) return;
    const product = cart.find((item) => item.id === productId);
    if (!product) return;

    try {
      const unit = saleUnitForProduct(product, unitId);
      validateQuantity(product, unit, 1);
      invalidateCoupon();
      setCart((current) => current.map((item) =>
        item.id === productId
          ? { ...buildSaleCartItem(product, unit.id), quantity: 1 }
          : item
      ));
      announce("success", `${product.name} unit changed to ${unit.name}.`);
    } catch (error) {
      announce("error", error.message);
    }
  }

  function clearSale() {
    setCart([]);
    setCustomerId("");
    setDiscountType("none");
    setDiscountValue("0");
    setCouponCode("");
    setAppliedCoupon(null);
    setNotes("");
    setActiveParkedId(null);
    setActiveParkLabel("");
    setActiveQuote(null);
    setActiveOrderDelivery(null);
    setIdempotencyKey(createIdempotencyKey());
    clearLocalSaleDraft(profile);
  }

  function handleScan(code) {
    setScannerOpen(false);
    if (activeOrderDelivery) {
      announce("error", "Scanning is disabled for a prepared delivery.");
      return;
    }
    const match = exactSaleProductMatch(products, code);
    if (!match) {
      announce("error", `No active product or package matches ${code}.`);
      return;
    }
    addProduct(match.product, match.unit?.id || null);
  }

  function submitSearch(event) {
    event.preventDefault();
    const match = exactSaleProductMatch(products, search);
    if (match) addProduct(match.product, match.unit?.id || null);
  }

  async function handlePark() {
    if (!isOnline) {
      announce(
        "error",
        "The sale draft is saved on this device. Reconnect before parking it on the server."
      );
      return;
    }

    if (cart.length === 0) return;
    if (activeOrderDelivery) {
      announce("error", "A prepared sales-order delivery cannot be parked.");
      return;
    }

    try {
      setBusy(true);
      const label = activeParkLabel || `Parked ${new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date())}`;

      const saved = await saveParkedSale(supabase, profile, {
        parked_id: activeParkedId,
        label,
        customer_id: customerId,
        currency,
        cart,
        discount_type: appliedCoupon ? "none" : discountType,
        discount_value: appliedCoupon ? 0 : discountValue,
        coupon_code: appliedCoupon?.code || null,
        notes
      });

      announce("success", `${saved.label || "Sale"} parked successfully.`);
      clearSale();
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  function resumeParked(parked) {
    const hydrated = hydrateParkedCart(products, parked.cart);
    if (hydrated.cart.length === 0) {
      announce("error", "This parked sale has no products that are currently available.");
      return;
    }

    setCart(hydrated.cart);
    setCustomerId(parked.customer_id || "");
    setCouponCode(parked.coupon_code || "");
    setAppliedCoupon(null);
    if (parked.coupon_code) {
      setDiscountType("none");
      setDiscountValue("0");
    } else {
      setDiscountType(parked.discount_type || "none");
      setDiscountValue(String(parked.discount_value || 0));
    }
    setNotes(parked.notes || "");
    setActiveParkedId(parked.id);
    setActiveParkLabel(parked.label || "Parked sale");
    setActiveQuote(null);
    setActiveOrderDelivery(null);
    setIdempotencyKey(createIdempotencyKey());
    setParkedOpen(false);

    if (hydrated.missing.length > 0) {
      announce("error", `${hydrated.missing.length} unavailable product(s) were removed from this parked sale.`);
    } else {
      announce(
        parked.coupon_code ? "error" : "success",
        parked.coupon_code
          ? `${parked.label || "Parked sale"} resumed. Reapply coupon ${parked.coupon_code}.`
          : `${parked.label || "Parked sale"} resumed.`
      );
    }
  }

  async function deleteParked(parkedId) {
    try {
      setBusy(true);
      await removeParkedSale(supabase, parkedId);
      if (activeParkedId === parkedId) clearSale();
      announce("success", "Parked sale deleted.");
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCustomer(event) {
    event.preventDefault();

    if (!isOnline) {
      announce(
        "error",
        "Reconnect before creating a customer."
      );
      return;
    }
    if (!customerForm.name.trim()) {
      announce("error", "Customer name is required.");
      return;
    }

    try {
      setBusy(true);
      const customer = await createCustomer(supabase, profile, customerForm);
      setCustomers((current) =>
        [...current, customer].sort((a, b) => a.name.localeCompare(b.name))
      );
      invalidateCoupon();
      setCustomerId(customer.id);
      setCustomerOpen(false);
      setCustomerForm(emptyCustomer);
      announce("success", `${customer.name} added as the customer.`);
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleQuoteSave(values) {
    if (!isOnline) {
      setQuoteOpen(false);
      announce(
        "error",
        "Reconnect before saving a quotation."
      );
      return;
    }

    if (cart.length === 0) {
      announce(
        "error",
        "Add at least one product before saving a quotation."
      );
      return;
    }

    try {
      setBusy(true);

      const result = await saveSalesQuote(
        supabase,
        {
          quote_id:
            activeQuote?.id || null,
          cart,
          customer_id: customerId,
          discount_type: discountType,
          discount_value: discountValue,
          coupon_code: couponCode,
          applied_coupon: appliedCoupon,
          currency,
          valid_until:
            values.valid_until,
          notes,
          terms: values.terms,
          status: values.status
        }
      );

      setActiveParkedId(null);
      setActiveParkLabel("");

      setActiveQuote({
        ...(activeQuote || {}),
        id: result.quote_id,
        quote_number:
          result.quote_number,
        status: result.status,
        valid_until:
          result.valid_until,
        terms: values.terms,
        customer_id:
          customerId || null
      });

      setQuoteOpen(false);

      announce(
        "success",
        `${result.quote_number} saved for ${money(
          result.total_amount,
          result.currency
        )}.`
      );
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePayment(
    payment,
    approvalRequestId = null
  ) {
    if (!isOnline) {
      setPaymentOpen(false);
      announce(
        "error",
        "Reconnect before completing the payment. The sale draft remains saved on this device."
      );
      return;
    }

    const saleValues = {
      cart,
      customer_id: customerId,
      discount_type:
        activeOrderDelivery ? "none" : discountType,
      discount_value:
        activeOrderDelivery
          ? 0
          : appliedCoupon ? 0 : discountValue,
      coupon_code:
        activeOrderDelivery
          ? null
          : appliedCoupon?.code || null,
      tax_amount: totals.taxAmount,
      currency,
      notes,
      idempotency_key: idempotencyKey,
      source_quote_id:
        activeOrderDelivery
          ? null
          : activeQuote?.id || null,
      source_sales_order_delivery_id:
        activeOrderDelivery?.delivery?.id || null,
      ...payment
    };

    if (
      !appliedCoupon
      && discountType !== "none"
      && Number(discountValue || 0) > 0
      && !canDiscount
    ) {
      setPaymentOpen(false);
      announce(
        "error",
        "Your account cannot apply a manual discount."
      );
      return;
    }

    const approvalNeed = activeOrderDelivery
      ? { required: false, discountAmount: 0 }
      : saleDiscountApprovalRequirement(
        access,
        {
          discount_type: discountType,
          discount_value:
            appliedCoupon
              ? 0
              : discountValue,
          discount_amount:
            appliedCoupon
              ? 0
              : totals.discountAmount,
          applied_coupon:
            appliedCoupon,
          currency
        }
      );

    if (
      approvalNeed.required
      && !approvalRequestId
    ) {
      setPaymentOpen(false);
      setPendingPayment(payment);

      const payload =
        saleApprovalPayload(
          saleValues
        );

      setApprovalRequest({
        permission_key:
          "sales.discount.exceed_limit",
        action_type:
          "sale_discount",
        action_label:
          "Sale discount above limit",
        payload,
        summary: [
          `Approve ${money(
            approvalNeed.discountAmount,
            currency
          )} discount`,
          selectedCustomer?.name
            || "Walk-in customer",
          `${cart.length} product line${
            cart.length === 1 ? "" : "s"
          }`
        ].join(" · "),
        amount:
          approvalNeed.discountAmount,
        currency
      });

      announce(
        "error",
        "This discount exceeds your individual limit. Manager approval is required."
      );
      return;
    }

    try {
      setBusy(true);

      const result = await completeSale(
        supabase,
        {
          ...saleValues,
          approval_request_id:
            approvalRequestId
        }
      );

      if (activeParkedId) {
        await removeParkedSale(supabase, activeParkedId);
      }

      const completedAt = new Date().toISOString();
      setReceipt({
        invoiceNumber: result.invoice_number,
        completedAt,
        shopName: shop?.shop_name || "Tiny POS",
        shopPhone: shop?.shop_phone,
        shopAddress: shop?.shop_address,
        footer: shop?.receipt_footer,
        cashierName: profile?.full_name || "POS User",
        customerName: selectedCustomer?.name,
        customerCode: selectedCustomer?.customer_code,
        customerType: selectedCustomer?.customer_type,
        couponCode: result.coupon_code || appliedCoupon?.code || null,
        couponName: result.coupon_name || appliedCoupon?.name || null,
        cart: cart.map((item) => ({ ...item })),
        subtotal: Number(result.subtotal ?? totals.subtotal),
        discountAmount: Number(result.discount_amount ?? totals.discountAmount),
        taxAmount: Number(result.tax_amount ?? totals.taxAmount),
        totalAmount: Number(result.total_amount ?? totals.total),
        amountReceived: Number(
          result.amount_received
          ?? payment.amount_received
          ?? 0
        ),
        changeAmount: Number(result.change_amount || 0),
        paymentMethod: payment.payment_method,
        priceListName:
          result.price_list_name
          || priceCatalogs[currency]?.price_list_name
          || null,
        priceAdjustmentAmount: Number(
          result.price_adjustment_amount || 0
        ),
        sourceQuoteNumber:
          result.source_quote_number
          || activeQuote?.quote_number
          || null,
        sourceSalesOrderNumber:
          result.source_sales_order_number
          || activeOrderDelivery?.order?.order_number
          || null,
        sourceDeliveryNumber:
          result.source_delivery_number
          || activeOrderDelivery?.delivery?.delivery_number
          || null,
        creditDueDate: result.credit_due_date || null,
        creditAmount: Number(result.credit_amount || 0),
        creditBalanceAfter: Number(
          result.credit_balance_after || 0
        ),
        currency
      });

      setPaymentOpen(false);
      setApprovalRequest(null);
      setPendingPayment(null);
      clearSale();
      announce(
        "success",
        `${result.invoice_number} completed for ${money(result.total_amount, currency)}.`
      );
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack sales-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">POINT OF SALE</p>
          <h1>New Sale</h1>
          <p className="muted">Search, tap or scan products, then accept payment or customer credit.</p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setParkedOpen(true)}
          >
            <CirclePause size={18} /> Parked ({parkedSales.length})
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setScannerOpen(true)}
            disabled={!canSell || Boolean(activeOrderDelivery)}
          >
            <Camera size={18} /> Scan
          </button>
        </div>
      </div>

      {message && (
        <div className={`notice ${messageType}`} onClick={() => setMessage("")}>
          {message}
        </div>
      )}

      {!cashRegisterOpen && (
        <div className="notice warning cash-register-sale-warning">
          <span>
            Cash payments are disabled because this branch has no open
            register.
          </span>
          <Link to="/cash-register">Open cash register</Link>
        </div>
      )}

      {!isOnline && (
        <div className="notice warning offline-sale-warning">
          <WifiOff size={20} />
          <span>
            Offline mode: the current bill is saved locally on this device.
            Reconnect before applying coupons, parking, creating customers or paying.
          </span>
        </div>
      )}

      {activeOrderDelivery && (
        <div className="notice info active-order-delivery-banner">
          <Truck size={20} />
          <span>
            Delivering <strong>{activeOrderDelivery.delivery.delivery_number}</strong>
            {" · "}
            Sales Order <strong>{activeOrderDelivery.order.order_number}</strong>
            {" · Products and customer are locked"}
          </span>
          <Link to="/sales-orders">
            Open Sales Orders
          </Link>
        </div>
      )}

      {activeQuote && (
        <div className="notice info active-quote-sale-banner">
          <FileText size={20} />
          <span>
            Working from quotation{" "}
            <strong>
              {activeQuote.quote_number}
            </strong>
            {activeQuote.valid_until
              ? ` · Valid until ${activeQuote.valid_until}`
              : ""}
          </span>
          <Link to="/quotes">
            Open quotations
          </Link>
        </div>
      )}

      {priceCatalogs[currency]?.price_list_name && (
        <div className="notice success active-price-list-banner">
          <BadgeDollarSign size={20} />
          <span>
            Active price list:{" "}
            <strong>
              {priceCatalogs[currency].price_list_name}
            </strong>
            {selectedCustomer
              ? ` · ${selectedCustomer.name}`
              : " · Walk-in customer"}
          </span>
          {can("price_lists.manage") && (
            <Link to="/price-lists">
              Manage prices
            </Link>
          )}
        </div>
      )}

      <div className="sale-layout">
        <section className="sale-products-panel panel">
          <form className="sale-toolbar" onSubmit={submitSearch}>
            <label className="search-box">
              <Search size={19} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search product, code or barcode"
              />
            </label>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <button type="button" className="icon-button refresh-button" onClick={refresh} title="Refresh">
              <RefreshCw className={loading ? "spin" : ""} size={20} />
            </button>
          </form>

          <div className="sale-product-summary">
            <span><strong>{visibleProducts.length}</strong> products available</span>
            <small>Tap a product to add one unit.</small>
          </div>

          {loading ? (
            <div className="empty-state"><RefreshCw className="spin" size={34} /><p>Loading products...</p></div>
          ) : visibleProducts.length === 0 ? (
            <div className="empty-state"><ShoppingCart size={46} /><h2>No sale products found</h2><p>Change the filters or add stock first.</p></div>
          ) : (
            <div className="sale-products-grid">
              {visibleProducts.map((product) => {
                const outOfStock = product.track_stock && Number(product.stock_quantity) <= 0;
                return (
                  <button
                    type="button"
                    className="sale-product-card"
                    key={product.id}
                    onClick={() => addProduct(product)}
                    disabled={Boolean(activeOrderDelivery) || (outOfStock && !product.allow_negative_stock && !shop?.allow_negative_stock)}
                  >
                    <div className="sale-product-image">
                      {product.image?.secure_url ? (
                        <img src={cloudinaryThumb(product.image.secure_url, 240, 180)} alt="" />
                      ) : (
                        <ImageOff size={28} />
                      )}
                    </div>
                    <div className="sale-product-content">
                      <strong>{product.name}</strong>
                      {product.name_km && <span>{product.name_km}</span>}
                      <small>{product.sku || product.barcode || "No code"}</small>
                      <div>
                        <b>{money(saleUnitForProduct(product).selling_price, product.currency)}</b>
                        <em className={outOfStock ? "out" : ""}>
                          Stock: {product.track_stock ? `${stockNumber(product.stock_quantity)} ${product.unit_name}` : "∞"}
                        </em>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <SaleCart
          cart={cart}
          customers={customers}
          customerId={customerId}
          creditAccount={selectedCreditAccount}
          onCustomerChange={(value) => {
            invalidateCoupon();
            setCustomerId(value);
          }}
          onAddCustomer={() => setCustomerOpen(true)}
          discountType={discountType}
          discountValue={discountValue}
          onDiscountTypeChange={(value) => {
            setDiscountType(value);
            if (value === "none") setDiscountValue("0");
          }}
          onDiscountValueChange={setDiscountValue}
          couponCode={couponCode}
          appliedCoupon={appliedCoupon}
          couponBusy={couponBusy}
          onCouponCodeChange={(value) => {
            setCouponCode(value);
            if (appliedCoupon) invalidateCoupon();
          }}
          onApplyCoupon={applyCoupon}
          onRemoveCoupon={removeCoupon}
          notes={notes}
          onNotesChange={setNotes}
          totals={totals}
          currency={currency}
          taxPercent={shop?.tax_percent || 0}
          onQuantityChange={changeQuantity}
          onUnitChange={changeUnit}
          onRemove={(productId) => {
            invalidateCoupon();
            setCart((current) =>
              current.filter((item) => item.id !== productId)
            );
          }}
          onClear={clearSale}
          onPark={handlePark}
          onSaveQuote={() => {
            if (activeOrderDelivery) {
              announce("error", "A prepared delivery cannot be saved as a quotation.");
              return;
            }
            if (!isOnline) {
              announce(
                "error",
                "Reconnect before saving a quotation."
              );
              return;
            }
            setQuoteOpen(true);
          }}
          onPay={() => {
            if (!isOnline) {
              announce(
                "error",
                "Reconnect before completing payment."
              );
              return;
            }
            setPaymentOpen(true);
          }}
          canSell={canSell && !busy}
          canDiscount={canDiscount}
          online={isOnline}
          activeParkLabel={activeParkLabel}
          activeQuoteNumber={
            activeQuote?.quote_number || ""
          }
          quoteEditable={
            !activeQuote
            || ["draft", "sent"].includes(
              activeQuote.status
            )
          }
          priceListName={
            activeOrderDelivery?.order?.price_list_name
            || priceCatalogs[currency]?.price_list_name
            || ""
          }
          fulfillmentLocked={Boolean(activeOrderDelivery)}
          fulfillmentLabel={
            activeOrderDelivery
              ? `${activeOrderDelivery.delivery.delivery_number} · ${activeOrderDelivery.order.order_number}`
              : ""
          }
        />
      </div>

      <section className="panel recent-sales-panel">
        <div className="panel-title-row">
          <div><p className="eyebrow">HISTORY</p><h2>Recent sales</h2></div>
          <Clock3 size={22} />
        </div>
        {recentSales.length === 0 ? (
          <p className="muted">No completed sales yet.</p>
        ) : (
          <div className="recent-sales-table-wrap">
            <table className="recent-sales-table">
              <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Payment</th><th>Status</th><th>Total</th></tr></thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td data-label="Invoice"><strong>{sale.invoice_number}</strong></td>
                    <td data-label="Date">{dateTime(sale.completed_at || sale.created_at)}</td>
                    <td data-label="Customer">{sale.customers?.name || "Walk-in"}</td>
                    <td data-label="Payment">
                      {sale.credit_account_id
                        ? "CREDIT"
                        : sale.payments?.[0]?.method?.toUpperCase() || "—"}
                    </td>
                    <td data-label="Status"><span className={`status-pill ${sale.status === "completed" ? "active" : "inactive"}`}>{sale.status}</span></td>
                    <td data-label="Total"><strong>{money(sale.total_amount, sale.currency)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <BarcodeScanner
        open={scannerOpen}
        title="Scan product for sale"
        onClose={() => setScannerOpen(false)}
        onDetected={handleScan}
      />

      <PaymentModal
        open={paymentOpen}
        busy={busy}
        totals={totals}
        currency={currency}
        customerName={selectedCustomer?.name}
        creditAccount={selectedCreditAccount}
        cashRegisterOpen={cashRegisterOpen}
        onClose={() => setPaymentOpen(false)}
        onSubmit={handlePayment}
      />

      <ApprovalRequestModal
        request={approvalRequest}
        onClose={() => {
          setApprovalRequest(null);
          setPendingPayment(null);
        }}
        onApproved={(requestId) => {
          const payment = pendingPayment;
          setApprovalRequest(null);
          setPendingPayment(null);

          if (payment) {
            handlePayment(
              payment,
              requestId
            );
          }
        }}
      />

      <QuoteSaveModal
        open={quoteOpen}
        busy={busy}
        activeQuote={activeQuote}
        customerName={selectedCustomer?.name}
        cart={cart}
        totals={totals}
        currency={currency}
        appliedCoupon={appliedCoupon}
        notes={notes}
        onClose={() => setQuoteOpen(false)}
        onSubmit={handleQuoteSave}
      />

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />

      {customerOpen && (
        <Modal title="Add customer" onClose={() => !busy && setCustomerOpen(false)}>
          <form className="customer-quick-form" onSubmit={saveCustomer}>
            <label><span>Customer type</span><select value={customerForm.customer_type} onChange={(event) => setCustomerForm((current) => ({ ...current, customer_type: event.target.value }))}><option value="regular">Regular</option><option value="vip">VIP</option><option value="wholesale">Wholesale</option></select></label>
            <label><span>Name *</span><input value={customerForm.name} onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))} autoFocus /></label>
            <label><span>Phone</span><input value={customerForm.phone} onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label><span>Email</span><input type="email" value={customerForm.email} onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label><span>Note</span><textarea rows="3" value={customerForm.notes} onChange={(event) => setCustomerForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setCustomerOpen(false)} disabled={busy}>Cancel</button>
              <button type="submit" className="primary-button" disabled={busy}><Plus size={18} /> {busy ? "Saving..." : "Add customer"}</button>
            </div>
          </form>
        </Modal>
      )}

      {parkedOpen && (
        <Modal title="Parked sales" onClose={() => !busy && setParkedOpen(false)}>
          <div className="parked-sales-list">
            {parkedSales.length === 0 ? (
              <div className="cart-empty"><CirclePause size={42} /><strong>No parked sales</strong><span>Park a bill to continue it later.</span></div>
            ) : (
              parkedSales.map((parked) => {
                const customer = customers.find((item) => item.id === parked.customer_id);
                return (
                  <article key={parked.id}>
                    <div>
                      <strong>{parked.label || "Parked sale"}</strong>
                      <span>{customer?.name || "Walk-in"} · {Array.isArray(parked.cart) ? parked.cart.length : 0} products</span>
                      <small>{dateTime(parked.created_at)}</small>
                    </div>
                    <div>
                      <button type="button" className="secondary-button" onClick={() => resumeParked(parked)} disabled={busy}>Resume</button>
                      <button type="button" className="icon-button danger-icon" onClick={() => deleteParked(parked.id)} disabled={busy} aria-label="Delete parked sale"><Trash2 size={18} /></button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
