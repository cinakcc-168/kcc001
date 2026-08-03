import { useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  Check,
  CirclePause,
  Minus,
  Plus,
  TicketPercent,
  FileText,
  Trash2,
  UserPlus,
  Wallet,
  X
} from "lucide-react";
import { money, stockNumber } from "../lib/catalog";

export default function SaleCart({
  cart,
  customers,
  customerId,
  creditAccount,
  onCustomerChange,
  onAddCustomer,
  discountType,
  discountValue,
  onDiscountTypeChange,
  onDiscountValueChange,
  couponCode,
  appliedCoupon,
  couponBusy,
  onCouponCodeChange,
  onApplyCoupon,
  onRemoveCoupon,
  notes,
  onNotesChange,
  totals,
  currency,
  exchangeRate = 4100,
  taxPercent,
  onQuantityChange,
  onUnitChange,
  onRemove,
  onClear,
  parkedCount = 0,
  onOpenParked,
  onPark,
  onSaveQuote,
  onPay,
  canSell,
  canDiscount = true,
  online = true,
  activeParkLabel,
  activeQuoteNumber,
  quoteEditable = true,
  priceListName = "",
  fulfillmentLocked = false,
  fulfillmentLabel = ""
}) {
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) || null,
    [customers, customerId]
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  useEffect(() => {
    if (selectedCustomer) {
      setCustomerSearch(
        `${selectedCustomer.name}${selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ""}`
      );
    } else if (!customerPickerOpen) {
      setCustomerSearch("");
    }
  }, [selectedCustomer, customerPickerOpen]);

  const customerMatches = useMemo(() => {
    const needle = customerSearch.trim().toLowerCase();
    if (!needle) return customers.slice(0, 12);
    return customers.filter((customer) =>
      [customer.name, customer.phone, customer.email, customer.customer_code]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    ).slice(0, 12);
  }, [customers, customerSearch]);

  function selectCustomer(customer) {
    onCustomerChange(customer?.id || "");
    setCustomerSearch(customer
      ? `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}`
      : "");
    setCustomerPickerOpen(false);
  }

  return (
    <aside className="sale-cart panel">
      <div className="sale-cart-heading">
        <div>
          <p className="eyebrow">CURRENT BILL</p>
          <h2>
            {fulfillmentLabel
              || activeParkLabel
              || activeQuoteNumber
              || "New sale"}
          </h2>
        </div>

        <div className="sale-cart-heading-actions">
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={onOpenParked}
            disabled={!online || fulfillmentLocked}
          >
            <CirclePause size={17} />
            Parked ({parkedCount})
          </button>

          {cart.length > 0 && !fulfillmentLocked && (
            <button
              type="button"
              className="text-button danger-text"
              onClick={onClear}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="customer-select-row">
        <label
          className="customer-search-picker"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setCustomerPickerOpen(false);
              if (!selectedCustomer) setCustomerSearch("");
            }
          }}
        >
          <span>Customer</span>
          <input
            value={customerSearch}
            onFocus={() => setCustomerPickerOpen(true)}
            onChange={(event) => {
              const value = event.target.value;
              setCustomerSearch(value);
              setCustomerPickerOpen(true);
              if (customerId) onCustomerChange("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setCustomerPickerOpen(false);
              if (event.key === "Enter" && customerMatches[0]) {
                event.preventDefault();
                selectCustomer(customerMatches[0]);
              }
            }}
            disabled={fulfillmentLocked}
            placeholder="Walk-in or type customer name / phone"
            autoComplete="off"
          />
          {customerPickerOpen && !fulfillmentLocked && (
            <div className="customer-search-results">
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectCustomer(null)}>
                <strong>Walk-in customer</strong><small>No customer account</small>
              </button>
              {customerMatches.map((customer) => (
                <button type="button" key={customer.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectCustomer(customer)}>
                  <strong>{customer.name}</strong>
                  <small>{[customer.phone, customer.email, customer.customer_code].filter(Boolean).join(" · ") || "Customer"}</small>
                </button>
              ))}
              {customerMatches.length === 0 && <span>No matching customer</span>}
            </div>
          )}
        </label>
        <button
          type="button"
          className="icon-button customer-add-button"
          onClick={onAddCustomer}
          disabled={!online || fulfillmentLocked}
          aria-label="Add customer"
          title="Add customer"
        >
          <UserPlus size={20} />
        </button>
      </div>

      {customerId && creditAccount && (
        <div className={`sale-customer-credit-strip ${creditAccount.is_on_hold ? "hold" : ""}`}>
          <span>
            Credit due {money(
              creditAccount.balance_due || 0,
              creditAccount.currency
            )}
          </span>
          <strong>
            Available {creditAccount.allow_unlimited_credit
              ? "Unlimited"
              : money(
                  Math.max(
                    0,
                    Number(creditAccount.credit_limit || 0)
                      - Number(creditAccount.balance_due || 0)
                  ),
                  creditAccount.currency
                )}
          </strong>
          {creditAccount.is_on_hold && <b>ON HOLD</b>}
        </div>
      )}

      {priceListName && (
        <div className="sale-price-list-strip">
          <BadgeDollarSign size={17} />
          <span>Price list</span>
          <strong>{priceListName}</strong>
        </div>
      )}

      <div className="sale-cart-lines">
        {cart.length === 0 ? (
          <div className="cart-empty">
            <Wallet size={42} />
            <strong>No products in this bill</strong>
            <span>Tap a product or scan a barcode.</span>
          </div>
        ) : (
          cart.map((item, index) => {
            const units = (item.product_units || item.units || [])
              .filter((unit) => unit.is_active || unit.is_base)
              .sort(
                (a, b) =>
                  Number(b.is_base) - Number(a.is_base)
                  || Number(a.sort_order || 0) - Number(b.sort_order || 0)
              );
            const factor = Number(item.selected_unit_factor || 1);
            const selectedPrice = Number(
              item.selected_unit_price ?? item.selling_price ?? 0
            );
            const standardPrice = Number(
              item.standard_unit_price
              ?? selectedPrice
            );
            const availableSelectedUnits = factor > 0
              ? Number(item.stock_quantity || 0) / factor
              : Number(item.stock_quantity || 0);

            return (
              <article
                className="sale-cart-line"
                key={item.cart_line_id || `${item.id}:${item.selected_unit_id || "base"}:${index}`}
              >
                <div className="cart-line-main">
                  <div className="cart-line-number">{index + 1}</div>

                  <strong className="cart-line-name" title={item.name}>
                    {item.name}
                  </strong>

                  <span className="cart-line-math">
                    {standardPrice !== selectedPrice && (
                      <del>{money(standardPrice, item.currency)}</del>
                    )}
                    {money(selectedPrice, item.currency)} × {stockNumber(item.quantity)} ={" "}
                    <b>{money(selectedPrice * Number(item.quantity), item.currency)}</b>
                  </span>

                  <div className="cart-line-unit-control">
                    {units.length > 1 ? (
                      <select
                        value={item.selected_unit_id || ""}
                        onChange={(event) => onUnitChange(item.cart_line_id || `${item.id}:${item.selected_unit_id || "base"}`, event.target.value)}
                        aria-label={`${item.name} selling unit`}
                        disabled={fulfillmentLocked}
                      >
                        {units.map((unit) => (
                          <option value={unit.id} key={unit.id}>
                            {unit.name} · {money(unit.selling_price, item.currency)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="single-unit-label">
                        {item.selected_unit_name || item.unit_name}
                      </span>
                    )}
                  </div>

                  <div className="cart-quantity-controls">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onQuantityChange(item.cart_line_id || `${item.id}:${item.selected_unit_id || "base"}`, Number(item.quantity) - 1)}
                      disabled={fulfillmentLocked}
                      aria-label={`Reduce ${item.name}`}
                    >
                      <Minus size={17} />
                    </button>
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantity}
                      onChange={(event) => onQuantityChange(item.cart_line_id || `${item.id}:${item.selected_unit_id || "base"}`, event.target.value)}
                      disabled={fulfillmentLocked}
                      aria-label={`${item.name} quantity`}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onQuantityChange(item.cart_line_id || `${item.id}:${item.selected_unit_id || "base"}`, Number(item.quantity) + 1)}
                      disabled={fulfillmentLocked}
                      aria-label={`Add ${item.name}`}
                    >
                      <Plus size={17} />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger-icon"
                      onClick={() => onRemove(item.cart_line_id || `${item.id}:${item.selected_unit_id || "base"}`)}
                      disabled={fulfillmentLocked}
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>

                <div className="cart-line-stock">
                  <small>
                    Available: {item.track_stock
                      ? `${stockNumber(availableSelectedUnits)} ${item.selected_unit_name || item.unit_name}`
                      : "Not tracked"}
                  </small>
                  {factor !== 1 && (
                    <small>
                      1 {item.selected_unit_name || item.unit_name} = {stockNumber(factor)} {item.unit_name}
                    </small>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="sale-cart-options">
        <div className="discount-row">
          <label>
            <span>Manual discount</span>
            <select
              value={discountType}
              onChange={(event) =>
                onDiscountTypeChange(event.target.value)
              }
              disabled={
                Boolean(appliedCoupon)
                || !canDiscount
                || fulfillmentLocked
              }
            >
              <option value="none">No discount</option>
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </label>
          <label>
            <span>
              {discountType === "percent" ? "Percent" : "Amount"}
            </span>
            <input
              type="number"
              min="0"
              max={discountType === "percent" ? "100" : undefined}
              step="0.01"
              value={discountValue}
              onChange={(event) =>
                onDiscountValueChange(event.target.value)
              }
              disabled={
                discountType === "none"
                || Boolean(appliedCoupon)
                || !canDiscount
                || fulfillmentLocked
              }
            />
          </label>
        </div>

        {!canDiscount && (
          <small className="permission-inline-note">
            Manual discounts are hidden for your account.
          </small>
        )}

        <div className="sale-coupon-block">
          <label>
            <span>Coupon code</span>
            <div className="sale-coupon-input-row">
              <TicketPercent size={18} />
              <input
                value={couponCode}
                onChange={(event) =>
                  onCouponCodeChange(event.target.value.toUpperCase())
                }
                placeholder="Enter coupon"
                disabled={couponBusy || Boolean(appliedCoupon) || fulfillmentLocked}
              />
              {appliedCoupon ? (
                <button
                  type="button"
                  className="icon-button"
                  onClick={onRemoveCoupon}
                  title="Remove coupon"
                >
                  <X size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary-button coupon-apply-button"
                  onClick={onApplyCoupon}
                  disabled={
                    couponBusy
                    || cart.length === 0
                    || !couponCode.trim()
                    || !online
                    || fulfillmentLocked
                  }
                >
                  {couponBusy ? "Checking..." : "Apply"}
                </button>
              )}
            </div>
          </label>

          {appliedCoupon && (
            <div className="applied-coupon">
              <Check size={18} />
              <div>
                <strong>{appliedCoupon.code} · {appliedCoupon.name}</strong>
                <span>
                  Coupon discount {money(appliedCoupon.discount_amount, currency)}
                </span>
              </div>
            </div>
          )}
        </div>

        <label>
          <span>Remark</span>
          <input
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            disabled={fulfillmentLocked}
            placeholder="Optional sale note"
          />
        </label>
      </div>

      <div className="sale-total-block">
        <div>
          <span>Subtotal</span>
          <strong>{money(totals.subtotal, currency)}</strong>
        </div>
        <div>
          <span>{appliedCoupon ? "Coupon discount" : "Discount"}</span>
          <strong>-{money(totals.discountAmount, currency)}</strong>
        </div>
        {Number(taxPercent) > 0 && (
          <div>
            <span>Tax ({Number(taxPercent)}%)</span>
            <strong>{money(totals.taxAmount, currency)}</strong>
          </div>
        )}
        <div className="grand-total">
          <span>Total</span>
          <strong>{money(totals.total, currency)}</strong>
          <small>
            ≈ {money(
              currency === "USD"
                ? Number(totals.total || 0) * Number(exchangeRate || 4100)
                : Number(totals.total || 0) / Number(exchangeRate || 4100),
              currency === "USD" ? "KHR" : "USD"
            )}
          </small>
        </div>
      </div>

      {!online && (
        <div className="sale-cart-offline-note">
          This bill is saved locally. Reconnect to park or pay.
        </div>
      )}

      <div className="sale-cart-actions quote-enabled">
        <button
          type="button"
          className="secondary-button"
          onClick={onPark}
          disabled={
            !canSell
            || !online
            || cart.length === 0
            || Boolean(activeQuoteNumber)
            || fulfillmentLocked
          }
          title={
            activeQuoteNumber
              ? "A quotation cannot also be parked"
              : "Park sale"
          }
        >
          <CirclePause size={19} />
          Park sale
        </button>

        <button
          type="button"
          className="secondary-button quote-save-button"
          onClick={onSaveQuote}
          disabled={
            !canSell
            || !online
            || cart.length === 0
            || !quoteEditable
            || fulfillmentLocked
          }
          title={
            !quoteEditable
              ? "Accepted quotations cannot be edited"
              : activeQuoteNumber
                ? "Update quotation"
                : "Save quotation"
          }
        >
          <FileText size={19} />
          {activeQuoteNumber
            ? "Update Quote"
            : "Save Quote"}
        </button>

        <button
          type="button"
          className="primary-button pay-button"
          onClick={onPay}
          disabled={!canSell || !online || cart.length === 0}
        >
          <Wallet size={20} />
          Pay {money(totals.total, currency)}
        </button>
      </div>
    </aside>
  );
}
