import {
  CalendarClock,
  CheckCircle2,
  Edit3,
  RefreshCw,
  Search,
  TicketPercent,
  ToggleLeft,
  ToggleRight
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import CouponFormModal from "../components/CouponFormModal";
import { money } from "../lib/catalog";
import {
  loadCouponsWorkspace,
  saveCoupon,
  setCouponActive
} from "../lib/coupons";

function dateTime(value, t) {
  if (!value) return t ? t("No end date") : "No end date";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function readable(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CouponsPage() {
  const { supabase, profile, shop, can } = useAuth();
  const { t } = useLanguage();
  const canManage = can("coupons.manage");

  const [coupons, setCoupons] = useState([]);
  const [branches, setBranches] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.organization_id || !canManage) return;

    try {
      setLoading(true);
      const data = await loadCouponsWorkspace(supabase, profile);
      setCoupons(data.coupons);
      setBranches(data.branches);
      setRedemptions(data.redemptions);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile, canManage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visibleCoupons = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return coupons.filter((coupon) => {
      const matchesSearch =
        !needle ||
        [coupon.code, coupon.name, coupon.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      const matchesStatus =
        status === "all" || coupon.computed_status === status;
      const matchesBranch =
        branchId === "all" ||
        (branchId === "global"
          ? !coupon.branch_id
          : coupon.branch_id === branchId);
      const matchesCurrency =
        currency === "all" || coupon.currency === currency;

      return matchesSearch && matchesStatus && matchesBranch && matchesCurrency;
    });
  }, [coupons, search, status, branchId, currency]);

  const metrics = useMemo(() => {
    const active = coupons.filter(
      (coupon) => coupon.computed_status === "active"
    ).length;
    const scheduled = coupons.filter(
      (coupon) => coupon.computed_status === "scheduled"
    ).length;
    const totalRedemptions = coupons.reduce(
      (sum, coupon) => sum + Number(coupon.usage_count || 0),
      0
    );
    const discountByCurrency = redemptions.reduce((map, redemption) => {
      const code = redemption.currency || "USD";
      map[code] = Number(map[code] || 0) + Number(redemption.discount_amount || 0);
      return map;
    }, {});

    return { active, scheduled, totalRedemptions, discountByCurrency };
  }, [coupons, redemptions]);

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  async function submitCoupon(values) {
    try {
      setBusy(true);
      const saved = await saveCoupon(supabase, profile, values);
      announce(
        "success",
        `${saved.code} ${values.id ? "updated" : "created"}.`
      );
      setFormOpen(false);
      setEditing(null);
      await refresh();
    } catch (error) {
      announce("error", error.message);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function toggleCoupon(coupon) {
    try {
      setBusy(true);
      await setCouponActive(
        supabase,
        profile,
        coupon.id,
        !coupon.is_active
      );
      announce(
        "success",
        `${coupon.code} ${coupon.is_active ? "deactivated" : "activated"}.`
      );
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <section className="panel empty-state">
        <TicketPercent size={46} />
        <h2>Promotion access is restricted</h2>
        <p>Only an owner, admin, or manager can manage coupons.</p>
      </section>
    );
  }

  return (
    <div className="page-stack coupons-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("PROMOTIONS")}</p>
          <h1>{t("Coupons")}</h1>
          <p className="muted">
            {t("Create controlled percentage or fixed discounts for checkout.")}
          </p>
        </div>

        <div className="heading-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? "spin" : ""} />
            {t("Refresh")}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <TicketPercent size={18} />
            {t("New coupon")}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`notice ${messageType}`}
          onClick={() => setMessage("")}
        >
          {message}
        </div>
      )}

      <div className="coupon-metrics">
        <article>
          <CheckCircle2 size={22} />
          <span>{t("Active coupons")}</span>
          <strong>{metrics.active}</strong>
        </article>
        <article>
          <CalendarClock size={22} />
          <span>{t("Scheduled")}</span>
          <strong>{metrics.scheduled}</strong>
        </article>
        <article>
          <TicketPercent size={22} />
          <span>{t("Total redemptions")}</span>
          <strong>{metrics.totalRedemptions}</strong>
        </article>
        <article>
          <TicketPercent size={22} />
          <span>{t("Discounts given")}</span>
          <strong className="coupon-currency-summary">
            {Object.keys(metrics.discountByCurrency).length === 0
              ? money(0, shop?.base_currency || "USD")
              : Object.entries(metrics.discountByCurrency)
                  .map(([code, amount]) => money(amount, code))
                  .join(" · ")}
          </strong>
        </article>
      </div>

      <section className="panel coupon-filter-panel">
        <label className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Search code, name or description")}
          />
        </label>

        <label>
          <span>{t("Status")}</span>
          <select
            className="text-center"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">{t("All statuses")}</option>
            <option value="active">{t("Active")}</option>
            <option value="scheduled">{t("Scheduled")}</option>
            <option value="expired">{t("Expired")}</option>
            <option value="used_up">{t("Used up")}</option>
            <option value="inactive">{t("Inactive")}</option>
          </select>
        </label>

        <label>
          <span>{t("Branch")}</span>
          <select
            className="text-center"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
          >
            <option value="all">{t("All branches")}</option>
            <option value="global">{t("All-branch coupons")}</option>
            {branches.map((branch) => (
              <option value={branch.id} key={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{t("Currency")}</span>
          <select
            className="text-center"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          >
            <option value="all">{t("All currencies")}</option>
            <option value="USD">USD</option>
            <option value="KHR">KHR</option>
          </select>
        </label>
      </section>

      <section className="panel coupon-list-panel">
        {loading ? (
          <div className="empty-state">
            <RefreshCw className="spin" />
            <p>{t("Loading coupons...")}</p>
          </div>
        ) : visibleCoupons.length === 0 ? (
          <div className="empty-state">
            <TicketPercent size={46} />
            <h2>{t("No coupons found")}</h2>
            <p>{t("Create a coupon or change the filters.")}</p>
          </div>
        ) : (
          <div className="coupon-table-wrap">
            <table className="coupon-table">
              <thead>
                <tr>
                  <th>{t("Coupon")}</th>
                  <th>{t("Discount")}</th>
                  <th>{t("Validity")}</th>
                  <th>{t("Branch / Customer")}</th>
                  <th>{t("Usage")}</th>
                  <th>{t("Status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleCoupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td data-label={t("Coupon")}>
                      <strong className="coupon-code">{coupon.code}</strong>
                      <span>{coupon.name}</span>
                    </td>
                    <td data-label={t("Discount")}>
                      <strong>
                        {coupon.discount_type === "percent"
                          ? `${Number(coupon.discount_value)}%`
                          : money(coupon.discount_value, coupon.currency)}
                      </strong>
                      <small>
                        {t("Minimum")} {money(coupon.minimum_spend, coupon.currency)}
                        {coupon.max_discount_amount
                          ? ` · ${t("Max")} ${money(
                              coupon.max_discount_amount,
                              coupon.currency
                            )}`
                          : ""}
                      </small>
                    </td>
                    <td data-label={t("Validity")}>
                      <strong>{dateTime(coupon.starts_at, t)}</strong>
                      <small>{t("to")} {dateTime(coupon.ends_at, t)}</small>
                    </td>
                    <td data-label={t("Branch / Customer")}>
                      <strong>{coupon.branches?.name || t("All branches")}</strong>
                      <small>
                        {coupon.customer_type
                          ? t(`${readable(coupon.customer_type)} customers`)
                          : t("All customers")}
                      </small>
                    </td>
                    <td data-label={t("Usage")}>
                      <strong>
                        {coupon.usage_count}
                        {coupon.usage_limit
                          ? ` / ${coupon.usage_limit}`
                          : ""}
                      </strong>
                      <small>
                        {money(coupon.discount_total, coupon.currency)} {t("given")}
                      </small>
                    </td>
                    <td data-label={t("Status")}>
                      <span
                        className={`status-pill ${
                          coupon.computed_status === "active"
                            ? "active"
                            : "inactive"
                        } text-center text-xs`}
                      >
                        {t(readable(coupon.computed_status))}
                      </span>
                    </td>
                    <td data-label={t("Actions") || ""}>
                      <div className="coupon-row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          title={t("Edit coupon")}
                          onClick={() => {
                            setEditing(coupon);
                            setFormOpen(true);
                          }}
                        >
                          <Edit3 size={18} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          title={coupon.is_active ? t("Deactivate") : t("Activate")}
                          onClick={() => toggleCoupon(coupon)}
                          disabled={busy}
                        >
                          {coupon.is_active ? (
                            <ToggleRight size={21} />
                          ) : (
                            <ToggleLeft size={21} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formOpen && (
        <CouponFormModal
          coupon={editing}
          branches={branches}
          baseCurrency={shop?.base_currency || "USD"}
          busy={busy}
          onClose={() => {
            if (busy) return;
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={submitCoupon}
        />
      )}
    </div>
  );
}
