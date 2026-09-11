import {
  ClipboardCheck,
  Search
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState
} from "react";
import Modal from "./Modal";
import { stockNumber } from "../lib/catalog";
import { useLanguage } from "../context/LanguageContext";

export default function StockCountStartModal({
  open,
  products,
  categories,
  busy,
  onClose,
  onSubmit
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [scope, setScope] = useState("all");
  const [categoryId, setCategoryId] =
    useState("");
  const [selectedIds, setSelectedIds] =
    useState(new Set());
  const [search, setSearch] = useState("");
  const [blindCount, setBlindCount] =
    useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    const now = new Date();

    setName(
      `Stock Count ${now.toLocaleDateString(
        "en-US"
      )}`
    );
    setScope("all");
    setCategoryId("");
    setSelectedIds(new Set());
    setSearch("");
    setBlindCount(false);
    setNotes("");
    setError("");
  }, [open]);

  const visibleProducts = useMemo(() => {
    const needle = search
      .trim()
      .toLowerCase();

    return products.filter((product) => {
      if (!needle) return true;

      return [
        product.name,
        product.name_km,
        product.sku,
        product.barcode,
        product.categories?.name
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [products, search]);

  const includedCount = useMemo(() => {
    if (scope === "all") {
      return products.length;
    }

    if (scope === "category") {
      return products.filter(
        (product) =>
          product.category_id === categoryId
      ).length;
    }

    return selectedIds.size;
  }, [
    scope,
    products,
    categoryId,
    selectedIds
  ]);

  if (!open) return null;

  function toggleProduct(productId) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }

      return next;
    });
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError(t("Stock count name is required."));
      return;
    }

    if (
      scope === "category"
      && !categoryId
    ) {
      setError(t("Choose a category."));
      return;
    }

    if (
      scope === "selected"
      && selectedIds.size === 0
    ) {
      setError(
        t("Choose at least one product.")
      );
      return;
    }

    if (includedCount === 0) {
      setError(
        t("No stock-tracked products match this scope.")
      );
      return;
    }

    await onSubmit({
      name,
      scope,
      category_id: categoryId,
      product_ids: [...selectedIds],
      blind_count: blindCount,
      notes
    });
  }

  return (
    <Modal
      title={t("Start stock count")}
      onClose={onClose}
      wide
    >
      <form
        className="stock-count-start-form"
        onSubmit={submit}
      >
        <div className="form-grid two">
          <label>
            <span>{t("Count name")}</span>
            <input
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              autoFocus
            />
          </label>

          <label>
            <span>{t("Count scope")}</span>
            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value);
                setError("");
              }}
            >
              <option value="all">
                {t("All tracked products")}
              </option>
              <option value="category">
                {t("One category")}
              </option>
              <option value="selected">
                {t("Selected products")}
              </option>
            </select>
          </label>
        </div>

        {scope === "category" && (
          <label>
            <span>{t("Category")}</span>
            <select
              value={categoryId}
              onChange={(event) =>
                setCategoryId(
                  event.target.value
                )
              }
            >
              <option value="">
                {t("Choose category")}
              </option>
              {categories.map((category) => (
                <option
                  value={category.id}
                  key={category.id}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {scope === "selected" && (
          <section className="stock-count-product-picker">
            <div className="search-box">
              <Search size={18} />
              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder={t("Search products to include")}
              />
            </div>

            <div className="stock-count-product-options">
              {visibleProducts.map((product) => (
                <label key={product.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(
                      product.id
                    )}
                    onChange={() =>
                      toggleProduct(product.id)
                    }
                  />

                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {[
                        product.sku,
                        product.barcode,
                        product.categories?.name,
                        `${stockNumber(
                          product.stock_quantity
                        )} ${product.unit_name}`
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        <section className="stock-count-start-summary">
          <ClipboardCheck size={23} />
          <div>
            <strong>
              {includedCount} {includedCount === 1 ? t("product") : t("products")} {t("will be counted")}
            </strong>
            <span>
              {t("System quantities are captured when the count starts.")}
            </span>
          </div>
        </section>

        <label className="check-row">
          <input
            type="checkbox"
            checked={blindCount}
            onChange={(event) =>
              setBlindCount(
                event.target.checked
              )
            }
          />
          <span>
            {t("Blind count: hide expected stock and variance until completion")}
          </span>
        </label>

        <label>
          <span>{t("Opening note")}</span>
          <textarea
            rows="3"
            value={notes}
            onChange={(event) =>
              setNotes(event.target.value)
            }
            placeholder={t("Optional instructions, shelf area or count team")}
          />
        </label>

        {error && (
          <div className="notice error">
            {error}
          </div>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            {t("Cancel")}
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={busy}
          >
            <ClipboardCheck size={18} />
            {busy
              ? t("Starting count...")
              : t("Start stock count")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
