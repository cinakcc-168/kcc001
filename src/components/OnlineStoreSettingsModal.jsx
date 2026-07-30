import { useEffect, useState } from "react";

function defaults(settings, profile) {
  const fallbackSlug = String(
    profile?.branches?.code
    || profile?.branches?.name
    || "tiny-pos-store"
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 55);

  return {
    slug:
      settings?.slug
      || fallbackSlug
      || "tiny-pos-store",
    is_published:
      Boolean(settings?.is_published),
    store_title:
      settings?.store_title
      || profile?.branches?.name
      || "Tiny POS Online Store",
    store_description:
      settings?.store_description || "",
    contact_phone:
      settings?.contact_phone || "",
    address: settings?.address || "",
    allow_pickup:
      settings?.allow_pickup ?? true,
    allow_delivery:
      settings?.allow_delivery ?? false,
    delivery_fee_usd:
      settings?.delivery_fee_usd ?? 0,
    delivery_fee_khr:
      settings?.delivery_fee_khr ?? 0,
    minimum_order_usd:
      settings?.minimum_order_usd ?? 0,
    minimum_order_khr:
      settings?.minimum_order_khr ?? 0,
    allow_pay_at_store:
      settings?.allow_pay_at_store
      ?? true,
    allow_cash_on_delivery:
      settings?.allow_cash_on_delivery
      ?? true,
    allow_bank_transfer:
      settings?.allow_bank_transfer
      ?? false,
    bank_instructions:
      settings?.bank_instructions || "",
    customer_message:
      settings?.customer_message || "",
    expected_ready_days:
      settings?.expected_ready_days ?? 1
  };
}

export default function OnlineStoreSettingsModal({
  open,
  settings,
  profile,
  busy,
  onClose,
  onSave
}) {
  const [values, setValues] = useState(
    defaults(settings, profile)
  );

  useEffect(() => {
    if (open) {
      setValues(defaults(settings, profile));
    }
  }, [open, settings, profile]);

  if (!open) return null;

  function update(name, value) {
    setValues((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function submit(event) {
    event.preventDefault();
    await onSave(values);
  }

  return (
    <div className="modal-backdrop">
      <form
        className="modal wide online-settings-modal"
        onSubmit={submit}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">
              PUBLIC CUSTOMER ORDERING
            </p>
            <h2>Online Store Settings</h2>
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

        <div className="form-grid two">
          <label>
            Store address
            <div className="store-slug-input">
              <span>/shop/</span>
              <input
                value={values.slug}
                onChange={(event) =>
                  update(
                    "slug",
                    event.target.value
                      .toLowerCase()
                      .replace(
                        /[^a-z0-9-]/g,
                        ""
                      )
                  )
                }
                required
                minLength={3}
                maxLength={60}
              />
            </div>
          </label>

          <label>
            Store title
            <input
              value={values.store_title}
              onChange={(event) =>
                update(
                  "store_title",
                  event.target.value
                )
              }
              required
            />
          </label>

          <label className="full">
            Store description
            <textarea
              rows={3}
              value={values.store_description}
              onChange={(event) =>
                update(
                  "store_description",
                  event.target.value
                )
              }
            />
          </label>

          <label>
            Customer contact phone
            <input
              value={values.contact_phone}
              onChange={(event) =>
                update(
                  "contact_phone",
                  event.target.value
                )
              }
            />
          </label>

          <label>
            Pickup / delivery address
            <input
              value={values.address}
              onChange={(event) =>
                update(
                  "address",
                  event.target.value
                )
              }
            />
          </label>
        </div>

        <section className="online-settings-section">
          <h3>Order fulfilment</h3>
          <div className="form-grid two">
            <label className="check-row">
              <input
                type="checkbox"
                checked={values.allow_pickup}
                onChange={(event) =>
                  update(
                    "allow_pickup",
                    event.target.checked
                  )
                }
              />
              Allow branch pickup
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={values.allow_delivery}
                onChange={(event) =>
                  update(
                    "allow_delivery",
                    event.target.checked
                  )
                }
              />
              Allow delivery
            </label>

            <label>
              Delivery fee USD
              <input
                type="number"
                min="0"
                step="0.01"
                value={values.delivery_fee_usd}
                onChange={(event) =>
                  update(
                    "delivery_fee_usd",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Delivery fee KHR
              <input
                type="number"
                min="0"
                step="1"
                value={values.delivery_fee_khr}
                onChange={(event) =>
                  update(
                    "delivery_fee_khr",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Minimum order USD
              <input
                type="number"
                min="0"
                step="0.01"
                value={values.minimum_order_usd}
                onChange={(event) =>
                  update(
                    "minimum_order_usd",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Minimum order KHR
              <input
                type="number"
                min="0"
                step="1"
                value={values.minimum_order_khr}
                onChange={(event) =>
                  update(
                    "minimum_order_khr",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Expected ready time
              <select
                value={values.expected_ready_days}
                onChange={(event) =>
                  update(
                    "expected_ready_days",
                    Number(event.target.value)
                  )
                }
              >
                <option value={0}>Same day</option>
                <option value={1}>1 day</option>
                <option value={2}>2 days</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
              </select>
            </label>
          </div>
        </section>

        <section className="online-settings-section">
          <h3>Payment choices</h3>
          <div className="form-grid two">
            <label className="check-row">
              <input
                type="checkbox"
                checked={
                  values.allow_pay_at_store
                }
                onChange={(event) =>
                  update(
                    "allow_pay_at_store",
                    event.target.checked
                  )
                }
              />
              Pay at store for pickup
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={
                  values.allow_cash_on_delivery
                }
                onChange={(event) =>
                  update(
                    "allow_cash_on_delivery",
                    event.target.checked
                  )
                }
              />
              Cash on delivery / pickup
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={
                  values.allow_bank_transfer
                }
                onChange={(event) =>
                  update(
                    "allow_bank_transfer",
                    event.target.checked
                  )
                }
              />
              Bank transfer
            </label>

            <label className="full">
              Bank-transfer instructions
              <textarea
                rows={3}
                value={values.bank_instructions}
                onChange={(event) =>
                  update(
                    "bank_instructions",
                    event.target.value
                  )
                }
              />
            </label>

            <label className="full">
              Message shown after ordering
              <textarea
                rows={2}
                value={values.customer_message}
                onChange={(event) =>
                  update(
                    "customer_message",
                    event.target.value
                  )
                }
              />
            </label>
          </div>
        </section>

        <label className="publish-store-toggle">
          <input
            type="checkbox"
            checked={values.is_published}
            onChange={(event) =>
              update(
                "is_published",
                event.target.checked
              )
            }
          />
          <span>
            <strong>Publish online store</strong>
            <small>
              Customers can open the public link and
              submit orders.
            </small>
          </span>
        </label>

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
            disabled={busy}
          >
            {busy
              ? "Saving…"
              : "Save online store"}
          </button>
        </div>
      </form>
    </div>
  );
}
