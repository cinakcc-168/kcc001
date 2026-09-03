import { fetchProductsMetaMap } from "./catalog";

export function defaultInvoiceDateRange() {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return {
    from: today,
    to: today
  };
}

export function invoiceDateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function invoiceDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(
    new Date(`${String(value).slice(0, 10)}T00:00:00`)
  );
}

export function invoiceStatusLabel(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function paymentMethodLabel(value) {
  if (!value) return "Other";

  return String(value)
    .split(",")
    .map((part) => invoiceStatusLabel(part.trim()))
    .join(", ");
}

export async function loadInvoiceCenter(
  supabase,
  filters
) {
  const { data, error } = await supabase.rpc(
    "get_invoice_center",
    {
      p_from: filters.from,
      p_to: filters.to,
      p_search: filters.search?.trim() || null,
      p_sale_status: filters.sale_status || null,
      p_payment_status: filters.payment_status || null,
      p_payment_method: filters.payment_method || null,
      p_currency: filters.currency || null,
      p_branch_id: filters.branch_id || null,
      p_page: filters.cashier_id ? 1 : Number(filters.page || 1),
      p_page_size: filters.cashier_id ? 1000 : Number(filters.page_size || 25)
    }
  );

  if (error) throw error;

  const allRows = Array.isArray(data?.rows) ? data.rows : [];
  if (!filters.cashier_id) {
    return { meta: data?.meta || {}, summary: data?.summary || { USD: {}, KHR: {} }, rows: allRows };
  }

  const filteredRows = allRows.filter((row) => row.cashier_id === filters.cashier_id);
  const pageSize = Number(filters.page_size || 25);
  const page = Number(filters.page || 1);
  const start = (page - 1) * pageSize;
  const summary = { USD: {}, KHR: {} };
  for (const currency of ["USD", "KHR"]) {
    const rows = filteredRows.filter((row) => row.currency === currency);
    summary[currency] = rows.reduce((acc, row) => ({
      invoice_count: acc.invoice_count + 1,
      gross_sales: acc.gross_sales + Number(row.total_amount || 0),
      refunds: acc.refunds + Number(row.refunded_amount || 0),
      net_sales: acc.net_sales + Number(row.net_total || 0),
      paid_amount: acc.paid_amount + Number(row.paid_amount || 0),
      credit_outstanding: acc.credit_outstanding + Number(row.credit_outstanding || 0),
      gross_profit: acc.gross_profit + Number(row.gross_profit || 0),
      net_profit: acc.net_profit + Number(row.net_profit || 0)
    }), { invoice_count: 0, gross_sales: 0, refunds: 0, net_sales: 0, paid_amount: 0, credit_outstanding: 0, gross_profit: 0, net_profit: 0 });
  }
  return {
    meta: {
      ...(data?.meta || {}),
      page,
      page_size: pageSize,
      total_rows: filteredRows.length,
      total_pages: Math.max(1, Math.ceil(filteredRows.length / pageSize))
    },
    summary,
    rows: filteredRows.slice(start, start + pageSize)
  };
}

export async function fetchCompleteInvoice(supabase, invoiceOrIdOrNumber, fallbackData = null) {
  if (!supabase || (!invoiceOrIdOrNumber && !fallbackData)) return null;

  let invoiceId = null;
  let invoiceNumber = null;
  let seedObject = null;

  if (typeof invoiceOrIdOrNumber === "object" && invoiceOrIdOrNumber !== null) {
    seedObject = invoiceOrIdOrNumber;
    invoiceId = seedObject.id || null;
    invoiceNumber = seedObject.invoice_number || null;
  } else if (typeof invoiceOrIdOrNumber === "string") {
    if (invoiceOrIdOrNumber.startsWith("INV-")) {
      invoiceNumber = invoiceOrIdOrNumber;
    } else {
      invoiceId = invoiceOrIdOrNumber;
    }
  }

  if (!invoiceId && fallbackData?.id) invoiceId = fallbackData.id;
  if (!invoiceNumber && fallbackData?.invoice_number) invoiceNumber = fallbackData.invoice_number;

  let invoice = null;

  // 1. Try querying get_invoice_center using a safe date range (must not exceed 1095 days)
  if (invoiceNumber || invoiceId) {
    try {
      const searchTerm = invoiceNumber || invoiceId;
      const refDateStr = seedObject?.completed_at || seedObject?.created_at || fallbackData?.completed_at || fallbackData?.created_at;
      let fromDate;
      let toDate;
      if (refDateStr) {
        const d = new Date(refDateStr);
        const fromD = new Date(d.getTime() - 180 * 24 * 60 * 60 * 1000);
        const toD = new Date(d.getTime() + 180 * 24 * 60 * 60 * 1000);
        fromDate = fromD.toISOString().slice(0, 10);
        toDate = toD.toISOString().slice(0, 10);
      } else {
        const now = new Date();
        const fromD = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        const toD = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        fromDate = fromD.toISOString().slice(0, 10);
        toDate = toD.toISOString().slice(0, 10);
      }

      const { data, error } = await supabase.rpc("get_invoice_center", {
        p_from: fromDate,
        p_to: toDate,
        p_search: searchTerm,
        p_page: 1,
        p_page_size: 10
      });

      if (!error && Array.isArray(data?.rows) && data.rows.length > 0) {
        const match = data.rows.find(
          (row) => (invoiceNumber && row.invoice_number === invoiceNumber) || (invoiceId && row.id === invoiceId)
        ) || data.rows[0];
        if (match) {
          invoice = { ...match };
        }
      }
    } catch (err) {
      console.warn("Could not query get_invoice_center for invoice:", err.message);
    }
  }

  // 2. If seedObject already has fully loaded items WITH list_price or promotion details, reuse if invoice center wasn't found
  if (
    !invoice &&
    seedObject &&
    Array.isArray(seedObject.items) &&
    seedObject.items.length > 0 &&
    seedObject.items.some((item) => item.list_price !== undefined || item.promotion_discount_amount !== undefined || item.promotion_id)
  ) {
    invoice = { ...seedObject };
  }

  // 3. Fallback to passed object or fallbackData
  if (!invoice) {
    invoice = typeof invoiceOrIdOrNumber === "object" ? { ...invoiceOrIdOrNumber } : (fallbackData ? { ...fallbackData } : null);
  }

  const targetId = invoice?.id || invoiceId;

  if (targetId) {
    // If we don't have detailed sales info, fetch from sales table
    if (!invoice || !invoice.invoice_number) {
      try {
        const { data: saleData } = await supabase
          .from("sales")
          .select(`
            *,
            branch:branch_id (id, name, code),
            customer:customer_id (id, customer_code, customer_type, name, company_name, phone, email, address),
            cashier:cashier_id (id, full_name, role)
          `)
          .eq("id", targetId)
          .maybeSingle();

        if (saleData) {
          invoice = {
            ...saleData,
            branch_name: saleData.branch?.name,
            branch_code: saleData.branch?.code,
            customer: saleData.customer,
            cashier_name: saleData.cashier?.full_name || "POS Staff"
          };
        }
      } catch (err) {
        console.warn("Could not fetch sale from sales table:", err.message);
      }
    }

    // Ensure detailed sale_items with list_price and promotion_id are loaded from database
    let rawItems = invoice?.items || invoice?.sale_items || [];
    const missingDetailedItems = !rawItems.length || rawItems.some((item) => item.list_price === undefined || item.promotion_discount_amount === undefined);

    if (missingDetailedItems) {
      try {
        const { data: dbItems, error: itemsError } = await supabase
          .from("sale_items")
          .select(`
            id,
            sale_id,
            product_id,
            product_unit_id,
            product_name,
            barcode,
            quantity,
            base_quantity,
            sale_unit_name,
            unit_factor,
            unit_price,
            list_price,
            price_list_id,
            price_adjustment_amount,
            promotion_id,
            promotion_discount_amount,
            unit_cost,
            discount_amount,
            tax_amount,
            line_total,
            line_profit
          `)
          .eq("sale_id", targetId)
          .order("id");

        if (!itemsError && Array.isArray(dbItems) && dbItems.length > 0) {
          rawItems = dbItems;
        }
      } catch (err) {
        console.warn("Could not fetch sale_items:", err.message);
      }
    }

    // Load promotions details for all promotion_ids present
    const promoIds = Array.from(new Set(rawItems.map((item) => item.promotion_id).filter(Boolean)));
    let promoMap = {};
    if (promoIds.length > 0) {
      try {
        const { data: promoData } = await supabase
          .from("product_promotions")
          .select("id, name, discount_type, discount_value")
          .in("id", promoIds);

        if (Array.isArray(promoData)) {
          promoMap = Object.fromEntries(promoData.map((p) => [p.id, p]));
        }
      } catch (err) {
        console.warn("Could not fetch product_promotions:", err.message);
      }
    }

    // Load payments if missing
    let payments = Array.isArray(invoice?.payments) ? invoice.payments : [];
    if (payments.length === 0) {
      try {
        const { data: paymentsData } = await supabase
          .from("payments")
          .select(`
            id,
            method,
            currency,
            amount,
            tendered_amount,
            change_amount,
            reference_number,
            paid_at,
            notes,
            credit_payment_id,
            tender_currency,
            tender_amount,
            tender_change_amount,
            exchange_rate
          `)
          .eq("sale_id", targetId)
          .order("paid_at")
          .order("id");

        if (Array.isArray(paymentsData)) {
          payments = paymentsData;
        }
      } catch (err) {
        console.warn("Could not load payments for invoice:", err.message);
      }
    }

    // Load receipt context (Khmer translations, cashier name)
    let receiptContext = null;
    try {
      const { data: rcData } = await supabase.rpc("get_sale_receipt_context", {
        p_sale_id: targetId
      });
      if (rcData) {
        receiptContext = rcData;
      }
    } catch (err) {
      console.warn("Could not load receipt context for invoice:", err.message);
    }

    const khmerNames = receiptContext?.product_names_km || {};
    const productIds = Array.from(
      new Set(rawItems.map((item) => item.product_id).filter(Boolean))
    );
    const productsMetaMap = await fetchProductsMetaMap(supabase, productIds);

    const enrichedItems = rawItems.map((item) => {
      const meta = productsMetaMap[item.product_id] || {};
      const promo = item.promotion_id ? promoMap[item.promotion_id] : (item.active_promotion || item.promotion || null);

      const sellingPrice = Number(item.unit_price ?? item.selected_unit_price ?? item.selling_price ?? 0);
      const qty = Number(item.quantity || 1);
      const rawPromoDiscount = Number(item.promotion_discount_amount || 0);
      const rawListPrice = item.list_price ?? item.standard_unit_price ?? item.standard_price;

      let listPrice = rawListPrice !== undefined && rawListPrice !== null
        ? Number(rawListPrice)
        : (rawPromoDiscount > 0 && qty > 0 ? sellingPrice + (rawPromoDiscount / qty) : sellingPrice);

      let promoDiscount = rawPromoDiscount;
      if (promoDiscount === 0 && listPrice > sellingPrice && sellingPrice > 0 && qty > 0) {
        promoDiscount = (listPrice - sellingPrice) * qty;
      }

      let promoType = item.promotion_discount_type || promo?.discount_type;
      let promoValue = item.promotion_discount_value || promo?.discount_value;

      if (!promoType && listPrice > sellingPrice && sellingPrice > 0) {
        const unitDisc = listPrice - sellingPrice;
        const pct = Math.round((unitDisc / listPrice) * 100);
        if (Math.abs((unitDisc / listPrice) * 100 - pct) < 0.1 && pct > 0) {
          promoType = "percent";
          promoValue = pct;
        } else {
          promoType = "amount";
          promoValue = unitDisc;
        }
      }

      return {
        ...item,
        product_name: item.product_name || item.name || meta.name || "Product",
        product_name_km: item.product_name_km || khmerNames[item.product_id] || meta.name_km || null,
        image_url: item.image_url || item.image || item.product_image_url || meta.image_url || null,
        product_code: item.product_code || item.code || item.sku || item.barcode || meta.code || null,
        code: item.code || item.product_code || item.sku || item.barcode || meta.code || null,
        barcode: item.barcode || meta.barcode || null,
        unit_price: sellingPrice,
        selected_unit_price: sellingPrice,
        selling_price: sellingPrice,
        list_price: listPrice,
        standard_unit_price: listPrice,
        quantity: qty,
        sale_unit_name: item.sale_unit_name || item.selected_unit_name || item.unit_name || "pcs",
        promotion_id: item.promotion_id || promo?.id || null,
        promotion_discount_amount: promoDiscount,
        promotion_discount_type: promoType,
        promotion_discount_value: promoValue,
        active_promotion: promo || (promoType ? { discount_type: promoType, discount_value: promoValue } : null),
        line_total: item.line_total !== undefined ? Number(item.line_total) : (qty * sellingPrice)
      };
    });

    if (!invoice) {
      invoice = fallbackData || seedObject || {};
    }

    return {
      ...invoice,
      cashier_name: receiptContext?.cashier_name || invoice.cashier_name || "POS Staff",
      items: enrichedItems,
      sale_items: enrichedItems,
      payments: payments.map((payment) => ({
        ...payment,
        is_credit_collection: Boolean(payment.credit_payment_id)
      }))
    };
  }

  return invoice || fallbackData || seedObject;
}

export function buildInvoiceReceipt(invoice, shop) {
  const salePayments = (invoice.payments || [])
    .filter((payment) => !payment.is_credit_collection);
  const initialPayment = salePayments[0] || null;
  const receiptPayments = salePayments.map((payment) => ({
    id: payment.id,
    method: payment.method,
    settlement_currency: payment.currency || invoice.currency,
    settlement_amount: Number(payment.amount || 0),
    tender_currency: payment.tender_currency || payment.currency || invoice.currency,
    tender_amount: Number(
      payment.tender_amount
      ?? payment.tendered_amount
      ?? payment.amount
      ?? 0
    ),
    change_amount: Number(
      payment.tender_change_amount
      ?? payment.change_amount
      ?? 0
    ),
    exchange_rate: Number(
      payment.exchange_rate
      || shop?.usd_to_khr_rate
      || 4100
    ),
    reference_number: payment.reference_number || null
  }));

  const items = invoice.items || invoice.sale_items || [];

  return {
    invoiceNumber: invoice.invoice_number,
    sourceQuoteNumber: invoice.source_quote_number,
    completedAt: invoice.completed_at || invoice.created_at,
    shopName: shop?.shop_name || "Tiny POS",
    shopPhone: shop?.shop_phone,
    shopAddress: shop?.shop_address,
    footer: shop?.receipt_footer,
    cashierName: invoice.cashier_name || "POS Staff",
    customerName: invoice.customer?.name || invoice.customers?.name || null,
    customerCode: invoice.customer?.customer_code || invoice.customers?.customer_code || null,
    customerType: invoice.customer?.customer_type || invoice.customers?.customer_type || null,
    priceListName: invoice.price_list_name || null,
    priceAdjustmentAmount: Number(invoice.price_adjustment_amount || 0),
    promotionDiscountAmount: Math.max(
      Number(invoice.promotion_discount_amount || invoice.promotionDiscountAmount || 0),
      items.reduce((sum, item) => {
        const promoDiscount = Number(item.promotion_discount_amount || 0);
        if (promoDiscount > 0) return sum + promoDiscount;

        const qty = Number(item.quantity || 1);
        const sellingPrice = Number(item.unit_price ?? item.selected_unit_price ?? item.selling_price ?? 0);
        const rawListPrice = item.list_price ?? item.standard_unit_price ?? item.standard_price;
        if (rawListPrice !== undefined && rawListPrice !== null) {
          const stdPrice = Number(rawListPrice);
          if (stdPrice > sellingPrice && sellingPrice > 0) {
            return sum + ((stdPrice - sellingPrice) * qty);
          }
        }
        return sum;
      }, 0)
    ),
    couponCode: invoice.coupon_code || invoice.couponCode || null,
    couponName: invoice.coupon_name || invoice.couponName || null,
    cart: items.map((item) => {
      const sellingPrice = Number(item.unit_price ?? item.selected_unit_price ?? item.selling_price ?? 0);
      const promoDiscount = Number(item.promotion_discount_amount || 0);
      const qty = Number(item.quantity || 1);
      const rawListPrice = item.list_price ?? item.standard_unit_price ?? item.standard_price;
      const standardUnitPrice = rawListPrice !== undefined && rawListPrice !== null
        ? Number(rawListPrice)
        : (promoDiscount > 0 && qty > 0 ? sellingPrice + (promoDiscount / qty) : sellingPrice);

      return {
        id: item.id,
        product_id: item.product_id,
        code: item.product_code || item.code || item.sku || item.barcode || item.meta?.code || null,
        name: item.product_name || item.name,
        name_km: item.product_name_km || item.name_km || null,
        image_url: item.image_url || item.image || item.product_image_url || item.product_images || item.photo_url || item.thumbnail || null,
        quantity: Number(item.quantity || 0),
        unit_price: sellingPrice,
        selected_unit_price: sellingPrice,
        selling_price: sellingPrice,
        list_price: standardUnitPrice,
        selected_unit_name: item.sale_unit_name || item.selected_unit_name || item.unit_name || "pcs",
        sale_unit_name: item.sale_unit_name || item.selected_unit_name || item.unit_name || "pcs",
        standard_unit_price: standardUnitPrice,
        promotion_id: item.promotion_id || null,
        promotion_discount_amount: promoDiscount,
        promotion_discount_type: item.promotion_discount_type || item.active_promotion?.discount_type || item.promotion?.discount_type,
        promotion_discount_value: item.promotion_discount_value || item.active_promotion?.discount_value || item.promotion?.discount_value,
        line_total: item.line_total !== undefined ? Number(item.line_total) : (qty * sellingPrice),
        discount_amount: Number(item.discount_amount || 0),
        active_promotion: item.active_promotion || item.promotion || item.promo || null,
        currency: invoice.currency
      };
    }),
    subtotal: Number(invoice.subtotal || 0),
    discountAmount: Number(invoice.discount_amount || 0),
    taxAmount: Number(invoice.tax_amount || 0),
    totalAmount: Number(invoice.total_amount || 0),
    refundedAmount: Number(invoice.refunded_amount || 0),
    netTotal: Number(invoice.net_total ?? (Number(invoice.total_amount || 0) - Number(invoice.refunded_amount || 0))),
    amountReceived: invoice.credit_account_id
      ? 0
      : Number(initialPayment?.tendered_amount ?? initialPayment?.tender_amount ?? invoice.paid_amount ?? invoice.amountReceived ?? 0),
    changeAmount: invoice.credit_account_id
      ? 0
      : Number(initialPayment?.change_amount ?? invoice.change_amount ?? invoice.changeAmount ?? 0),
    paymentMethod: invoice.credit_account_id
      ? "credit"
      : receiptPayments.length > 1
        ? "split"
        : initialPayment?.method || invoice.payment_method || invoice.paymentMethod || "other",
    payments: receiptPayments.length > 0 ? receiptPayments : (invoice.payments || []),
    exchangeRate: Number(
      initialPayment?.exchange_rate
      || invoice.exchangeRate
      || shop?.usd_to_khr_rate
      || 4100
    ),
    creditDueDate: invoice.credit_due_date || invoice.creditDueDate || null,
    creditAmount: Number(invoice.credit_amount || invoice.creditAmount || 0),
    creditOutstanding: Number(invoice.credit_outstanding || invoice.creditOutstanding || 0),
    creditBalanceAfter: null,
    currency: invoice.currency,
    saleStatus: invoice.status
  };
}

function csvCell(value) {
  const text = value === null || value === undefined
    ? ""
    : String(value);

  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadInvoiceCsv(
  rows,
  filename = "tiny-pos-invoices.csv"
) {
  const headers = [
    "invoice_number",
    "completed_at",
    "branch",
    "customer_code",
    "customer_name",
    "customer_phone",
    "cashier",
    "sale_status",
    "payment_status",
    "payment_method",
    "currency",
    "subtotal",
    "price_list",
    "price_adjustment",
    "discount",
    "tax",
    "gross_total",
    "refunds",
    "net_total",
    "paid_amount",
    "credit_outstanding",
    "quotation",
    "payment_references"
  ];

  const body = rows.map((invoice) => [
    invoice.invoice_number,
    invoice.completed_at || invoice.created_at,
    invoice.branch_name,
    invoice.customer?.customer_code,
    invoice.customer?.name,
    invoice.customer?.phone,
    invoice.cashier_name,
    invoice.status,
    invoice.payment_status,
    invoice.payment_method,
    invoice.currency,
    invoice.subtotal,
    invoice.price_list_name,
    invoice.price_adjustment_amount,
    invoice.discount_amount,
    invoice.tax_amount,
    invoice.total_amount,
    invoice.refunded_amount,
    invoice.net_total,
    invoice.paid_amount,
    invoice.credit_outstanding,
    invoice.source_quote_number,
    (invoice.payments || [])
      .map((payment) => payment.reference_number)
      .filter(Boolean)
      .join(" | ")
  ]);

  const csv = [
    headers,
    ...body
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  const blob = new Blob(
    ["\uFEFF", csv],
    { type: "text/csv;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
