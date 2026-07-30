import { useEffect, useMemo, useState } from "react";

function primaryImage(product) {
  return [...(product?.product_images || [])]
    .sort(
      (a, b) =>
        Number(b.is_primary)
        - Number(a.is_primary)
        || Number(a.sort_order)
        - Number(b.sort_order)
    )[0]?.secure_url;
}

export default function OnlineProductModal({
  open,
  product,
  busy,
  onClose,
  onSave
}) {
  const [values, setValues] = useState({
    online_enabled: false,
    online_featured: false,
    online_description: "",
    online_sort_order: 0
  });

  useEffect(() => {
    if (!open || !product) return;

    setValues({
      online_enabled:
        Boolean(product.online_enabled),
      online_featured:
        Boolean(product.online_featured),
      online_description:
        product.online_description || "",
      online_sort_order:
        Number(product.online_sort_order || 0)
    });
  }, [open, product]);

  const activeUnits = useMemo(
    () =>
      (product?.product_units || [])
        .filter((unit) => unit.is_active)
        .sort(
          (a, b) =>
            Number(b.is_base)
            - Number(a.is_base)
            || Number(a.sort_order)
            - Number(b.sort_order)
        ),
    [product]
  );

  if (!open || !product) return null;

  async function submit(event) {
    event.preventDefault();
    await onSave(product.id, values);
  }

  const image = primaryImage(product);

  return (
    <div className="modal-backdrop">
      <form
        className="modal online-product-modal"
        onSubmit={submit}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">
              PUBLIC PRODUCT
            </p>
            <h2>{product.name}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="online-product-preview">
          {image ? (
            <img
              src={image}
              alt=""
            />
          ) : (
            <div className="online-image-placeholder">
              No photo
            </div>
          )}
          <div>
            <strong>{product.name}</strong>
            <p className="muted">
              {product.categories?.name
                || "Uncategorized"}
            </p>
            <p>
              Currency: {product.currency}
            </p>
          </div>
        </div>

        <label className="publish-store-toggle">
          <input
            type="checkbox"
            checked={values.online_enabled}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                online_enabled:
                  event.target.checked
              }))
            }
          />
          <span>
            <strong>Publish this product</strong>
            <small>
              Active selling units become available
              in the online catalog.
            </small>
          </span>
        </label>

        <label className="publish-store-toggle">
          <input
            type="checkbox"
            checked={values.online_featured}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                online_featured:
                  event.target.checked
              }))
            }
          />
          <span>
            <strong>Featured product</strong>
            <small>
              Show this product before normal catalog
              items.
            </small>
          </span>
        </label>

        <label>
          Online description
          <textarea
            rows={4}
            value={values.online_description}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                online_description:
                  event.target.value
              }))
            }
            placeholder={
              product.description
              || "Describe this product for customers"
            }
          />
        </label>

        <label>
          Catalog sort order
          <input
            type="number"
            value={values.online_sort_order}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                online_sort_order:
                  Number(event.target.value || 0)
              }))
            }
          />
        </label>

        <div className="online-unit-list">
          <strong>Published selling units</strong>
          {activeUnits.length ? (
            activeUnits.map((unit) => (
              <div
                key={unit.id}
                className="online-unit-row"
              >
                <span>{unit.name}</span>
                <b>
                  {new Intl.NumberFormat(
                    "en-US",
                    {
                      style: "currency",
                      currency: product.currency,
                      maximumFractionDigits:
                        product.currency === "KHR"
                          ? 0
                          : 2
                    }
                  ).format(
                    Number(unit.selling_price || 0)
                  )}
                </b>
              </div>
            ))
          ) : (
            <p className="muted">
              Add at least one active selling unit
              before publishing.
            </p>
          )}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !activeUnits.length}
          >
            {busy
              ? "Saving…"
              : "Save product"}
          </button>
        </div>
      </form>
    </div>
  );
}
