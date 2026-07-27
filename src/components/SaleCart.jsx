import {
  Check,
  CirclePause,
  Minus,
  Plus,
  TicketPercent,
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
  taxPercent,
  onQuantityChange,
  onUnitChange,
  onRemove,
  onClear,
  onPark,
  onPay,
  canSell,
  online = true,
  activeParkLabel
}) {
  return (
    <aside className="sale-cart panel">
      <div className="sale-cart-heading">
        <div>
          <p className="eyebrow">CURRENT BILL</p>
          <h2>{activeParkLabel || "New sale"}</h2>
        </div>
        {cart.length > 0 && (
          <button
            type="button"
            className="text-button danger-text"
            onClick={onClear}
          >
            Clear
          </button>
        )}
      </div>

      <div className="customer-select-row">
        <label>
          <span>Customer</span>
          <select
            value={customerId}
            onChange={(event) => onCustomerChange(event.target.value)}
          >
            <option value="">Walk-in customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.phone ? ` · ${customer.phone}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="icon-button customer-add-button"
          onClick={onAddCustomer}
          disabled={!online}
          aria-label="Add customer"
          title="Add customer"
        >
          <UserPlus size={20} />
        </button>
      </div>

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
            const availableSelectedUnits = factor > 0
              ? Number(item.stock_quantity || 0) / factor
              : Number(item.stock_quantity || 0);

            return (
              <article className="sale-cart-line" key={item.id}>
                <div className="cart-line-number">{index + 1}</div>
                <div className="cart-line-info">
                  <strong>{item.name}</strong>
                  <span>
                    {money(selectedPrice, item.currency)} × {stockNumber(item.quantity)} ={" "}
                    <b>{money(selectedPrice * Number(item.quantity), item.currency)}</b>
                  </span>

                  <div className="cart-unit-row">
                    {units.length > 1 ? (
                      <select
                        value={item.selected_unit_id || ""}
                        onChange={(event) => onUnitChange(item.id, event.target.value)}
                        aria-label={`${item.name} selling unit`}
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
                    <small>
                      1 {item.selected_unit_name || item.unit_name} = {stockNumber(factor)} {item.unit_name}
                    </small>
                  </div>

                  <small>
                    Available: {item.track_stock
                      ? `${stockNumber(availableSelectedUnits)} ${item.selected_unit_name || item.unit_name}`
                      : "Not tracked"}
                  </small>
                </div>
                <div className="cart-quantity-controls">
                  <button type="button" className="icon-button" onClick={() => onQuantityChange(item.id, Number(item.quantity) - 1)} aria-label={`Reduce ${item.name}`}>
                    <Minus size={17} />
                  </button>
                  <input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => onQuantityChange(item.id, event.target.value)} aria-label={`${item.name} quantity`} />
                  <button type="button" className="icon-button" onClick={() => onQuantityChange(item.id, Number(item.quantity) + 1)} aria-label={`Add ${item.name}`}>
                    <Plus size={17} />
                  </button>
                  <button type="button" className="icon-button danger-icon" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name}`}>
                    <Trash2 size={17} />
                  </button>
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
              disabled={Boolean(appliedCoupon)}
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
              disabled={discountType === "none" || Boolean(appliedCoupon)}
            />
          </label>
        </div>

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
                disabled={couponBusy || Boolean(appliedCoupon)}
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
        </div>
      </div>

      {!online && (
        <div className="sale-cart-offline-note">
          This bill is saved locally. Reconnect to park or pay.
        </div>
      )}

      <div className="sale-cart-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onPark}
          disabled={!canSell || !online || cart.length === 0}
        >
          <CirclePause size={19} /> Park sale
        </button>
        <button
          type="button"
          className="primary-button pay-button"
          onClick={onPay}
          disabled={!canSell || !online || cart.length === 0}
        >
          <Wallet size={20} /> Pay {money(totals.total, currency)}
        </button>
      </div>
    </aside>
  );
}
