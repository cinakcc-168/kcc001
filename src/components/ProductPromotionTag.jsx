import React from "react";

export function formatDiscountValue(promotion, currency = "USD") {
  if (!promotion) return "";
  const val = Number(promotion.discount_value || 0);
  if (promotion.discount_type === "percent") {
    return `${val}% off`;
  }
  if (currency === "KHR") {
    return `-${val.toLocaleString("en-US")}៛ OFF`;
  }
  const formatted = val % 1 === 0 ? val.toString() : val.toFixed(2);
  return `-${formatted} OFF`;
}

export default function ProductPromotionTag({ promotion, currency = "USD" }) {
  if (!promotion) return null;

  const isPercent = promotion.discount_type === "percent";
  const rawUnitName = String(promotion.unit_name || promotion.product_unit_name || "").trim();
  const unitTitle = rawUnitName ? rawUnitName.toUpperCase() : "PROMOTION";
  const unitLabel = rawUnitName ? ` (${rawUnitName})` : "";

  if (isPercent) {
    const percentVal = Number(promotion.discount_value || 0);
    return (
      <div
        className="promo-tag-red-container no-translate"
        data-i18n-skip="true"
        title={`${promotion.name || "Promotion"}${unitLabel}`}
        aria-label={`Promotion ${percentVal}% off${unitLabel}`}
      >
        <div className="promo-tag-red-fold" aria-hidden="true" />
        <div className="promo-tag-red-body">
          <span
            className="promo-tag-red-title"
            style={unitTitle.length > 8 ? { fontSize: "8.5px" } : undefined}
            title={unitTitle}
          >
            {unitTitle}
          </span>
          <strong className="promo-tag-red-value">{percentVal}% off</strong>
          <svg
            className="promo-tag-red-gold-trim"
            viewBox="0 0 100 24"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              points="0,0 50,22 100,0"
              fill="none"
              stroke="url(#promoGoldGradient)"
              strokeWidth="5.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="promoGoldGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="35%" stopColor="#fbbf24" />
                <stop offset="70%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    );
  }

  // Fixed Amount Off (Green Diagonal Sash style)
  const discountText = formatDiscountValue(promotion, currency);
  return (
    <div
      className="promo-tag-green-container no-translate"
      data-i18n-skip="true"
      title={`${promotion.name || "Promotion"}${unitLabel}`}
      aria-label={`Promotion ${discountText}${unitLabel}`}
    >
      <div className="promo-tag-green-wrap">
        <div className="promo-tag-green-sash">
          <div className="promo-tag-green-title">
            <svg className="promo-bolt" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M13 2L3 14h7l-2 8 11-12h-7l2-8z" />
            </svg>
            <span style={unitTitle.length > 8 ? { fontSize: "6.5px" } : undefined}>{unitTitle}</span>
            <svg className="promo-bolt" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M13 2L3 14h7l-2 8 11-12h-7l2-8z" />
            </svg>
          </div>
          <strong className="promo-tag-green-value">{discountText}</strong>
        </div>
      </div>
      <div className="promo-tag-green-fold-top" aria-hidden="true" />
      <div className="promo-tag-green-fold-left" aria-hidden="true" />
    </div>
  );
}
