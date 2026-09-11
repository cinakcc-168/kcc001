import {
  BadgePercent,
  Save,
  Search
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState
} from "react";
import Modal from "./Modal";
import { money, stockNumber } from "../lib/catalog";
import { useLanguage } from "../context/LanguageContext";

export default function PriceListItemsModal({
  priceList,
  products,
  busy,
  onClose,
  onSubmit
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [prices, setPrices] = useState({});
  const [percent, setPercent] = useState("10");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!priceList) return;

    const next = {};

    for (const item of priceList.price_list_items || []) {
      next[item.product_unit_id] = String(
        item.selling_price
      );
    }

    setPrices(next);
    setSearch("");
    setPercent("10");
    setError("");
  }, [priceList]);

  const rows = useMemo(() => {
    if (!priceList) return [];

    const needle = search
      .trim()
      .toLowerCase();

    const result = [];

    for (const product of products) {
      if (product.currency !== priceList.currency) {
        continue;
      }

      for (const unit of product.product_units || []) {
        const haystack = [
          product.name,
          product.name_km,
          product.sku,
          product.barcode,
          product.categories?.name,
          unit.name,
          unit.short_name,
          unit.barcode
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (needle && !haystack.includes(needle)) {
          continue;
        }

        result.push({
          product,
          unit
        });
      }
    }

    return result;
  }, [
    priceList,
    products,
    search
  ]);

  if (!priceList) return null;

  const overrideCount = Object.values(prices)
    .filter((value) => String(value).trim() !== "")
    .length;

  function setPrice(unitId, value) {
    setPrices((current) => ({
      ...current,
      [unitId]: value
    }));
    setError("");
  }

  function applyPercent(direction) {
    const value = Number(percent);

    if (!Number.isFinite(value) || value < 0) {
      setError(
        "Enter a valid percentage."
      );
      return;
    }

    const multiplier = direction === "lower"
      ? 1 - value / 100
      : 1 + value / 100;

    setPrices((current) => {
      const next = { ...current };

      for (const { unit } of rows) {
        next[unit.id] = String(
          Math.max(
            0,
            Math.round(
              Number(unit.selling_price || 0)
              * multiplier
              * 100
            ) / 100
          )
        );
      }

      return next;
    });
  }

  async function submit() {
    setError("");

    const payload = [];

    for (const product of products) {
      if (product.currency !== priceList.currency) {
        continue;
      }

      for (const unit of product.product_units || []) {
        const raw = String(prices[unit.id] ?? "").trim();
        if (!raw) continue;

        const value = Number(raw);

        if (!Number.isFinite(value) || value < 0) {
          setError(
            `${product.name} · ${unit.name} has an invalid price.`
          );
          return;
        }

        payload.push({
          product_unit_id: unit.id,
          selling_price: value
        });
      }
    }

    await onSubmit(priceList.id, payload);
  }

  return (
    <Modal
      title={`${priceList.code} · ${t("Unit prices")}`}
      onClose={() => !busy && onClose()}
      wide
    >
      <div className="price-list-items-modal">
        <section className="price-list-items-toolbar">
          <div className="search-box">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder={t("Search product, code, barcode, category or unit")}
            />
          </div>

          <div className="price-list-percent-tools">
            <label>
              <span>{t("Bulk percentage")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={percent}
                onChange={(event) =>
                  setPercent(event.target.value)
                }
              />
            </label>

            <button
              type="button"
              className="secondary-button"
              onClick={() => applyPercent("lower")}
            >
              <BadgePercent size={17} />
              {t("Lower visible")}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => applyPercent("higher")}
            >
              <BadgePercent size={17} />
              {t("Raise visible")}
            </button>
          </div>
        </section>

        <div className="notice info">
          {t("Blank means the normal selling price remains. Saving replaces all overrides for this list.")}
        </div>

        <div className="price-list-items-table-wrap">
          <table className="price-list-items-table">
            <thead>
              <tr>
                <th>{t("Product")}</th>
                <th>{t("Unit")}</th>
                <th>{t("Conversion")}</th>
                <th>{t("Normal price")}</th>
                <th>{t("List price")}</th>
                <th>{t("Difference")}</th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="6" className="po-empty-row">
                    {priceList.currency === "USD" ? t("No matching USD product units.") : t("No matching KHR product units.")}
                  </td>
                </tr>
              ) : rows.map(({ product, unit }) => {
                const raw = String(
                  prices[unit.id] ?? ""
                );

                const override = raw.trim() === ""
                  ? null
                  : Number(raw);

                const normal = Number(
                  unit.selling_price || 0
                );

                const difference = override === null
                  || !Number.isFinite(override)
                    ? 0
                    : normal - override;

                return (
                  <tr key={unit.id}>
                    <td data-label={t("Product")}>
                      <strong>{product.name}</strong>
                      <small>
                        {[product.sku, product.barcode]
                          .filter(Boolean)
                          .join(" · ") || t("No code")}
                      </small>
                    </td>

                    <td data-label={t("Unit")}>
                      <strong>{unit.name}</strong>
                      <small>
                        {unit.barcode || t("No unit barcode")}
                      </small>
                    </td>

                    <td data-label={t("Conversion")}>
                      1 {unit.name} = {stockNumber(
                        unit.conversion_factor
                      )} {product.unit_name}
                    </td>

                    <td data-label={t("Normal price")}>
                      {money(normal, priceList.currency)}
                    </td>

                    <td data-label={t("List price")}>
                      <input
                        type="number"
                        min="0"
                        step={
                          priceList.currency === "KHR"
                            ? "1"
                            : "0.01"
                        }
                        value={raw}
                        onChange={(event) =>
                          setPrice(
                            unit.id,
                            event.target.value
                          )
                        }
                        placeholder={String(normal)}
                      />
                    </td>

                    <td data-label={t("Difference")}>
                      {override === null ? (
                        <span className="muted">
                          {t("Standard")}
                        </span>
                      ) : (
                        <strong className={
                          difference >= 0
                            ? "price-saving"
                            : "price-markup"
                        }>
                          {difference > 0 ? "-" : difference < 0 ? "+" : ""}
                          {money(
                            Math.abs(difference),
                            priceList.currency
                          )}
                        </strong>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="notice error">
            {error}
          </div>
        )}

        <div className="modal-actions">
          <span className="muted">
            {overrideCount} {overrideCount === 1 ? t("price override") : t("price overrides")}
          </span>

          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            {t("Cancel")}
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={submit}
            disabled={busy}
          >
            <Save size={18} />
            {busy
              ? t("Saving prices...")
              : t("Save unit prices")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
