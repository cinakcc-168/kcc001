import {
  useEffect,
  useMemo,
  useState
} from "react";
import { useLanguage } from "../context/LanguageContext";
import {
  HandCoins,
  RotateCcw,
  Undo2
} from "lucide-react";
import Modal from "./Modal";
import { money, stockNumber } from "../lib/catalog";
import { estimateRefund } from "../lib/returns";

const normalPaymentMethods = [
  ["cash", "Cash"],
  ["bank", "Bank"],
  ["khqr", "KHQR"],
  ["card", "Card"],
  ["other", "Other"]
];

export default function RefundModal({
  sale,
  busy,
  onClose,
  onSubmit
}) {
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [refundMethod, setRefundMethod] =
    useState("cash");
  const [refundReference, setRefundReference] =
    useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const creditOutstanding = Math.max(
    0,
    Number(sale?.credit_amount || 0)
      - Number(sale?.paid_amount || 0)
  );

  const isCreditInvoice = Boolean(
    sale?.credit_account_id
  );

  const paymentMethods = useMemo(
    () =>
      isCreditInvoice && creditOutstanding > 0
        ? [
            ["credit", "Credit Account"],
            ...normalPaymentMethods
          ]
        : normalPaymentMethods,
    [isCreditInvoice, creditOutstanding]
  );

  const localizedPaymentMethods = useMemo(
    () => paymentMethods.map(([value, label]) => [value, t(label)]),
    [paymentMethods, t]
  );

  useEffect(() => {
    if (!sale) return;

    const rawItems = sale.sale_items || sale.items || [];
    setItems(
      rawItems.map((item) => {
        const available = item.returnable_quantity !== undefined
          ? Number(item.returnable_quantity || 0)
          : Math.max(0, Number(item.quantity || 0) - Number(item.returned_quantity || 0));
        return {
          sale_item_id: item.id,
          quantity: 0,
          restock: Boolean(item.product_id),
          available,
          product_name: item.product_name,
          unit_name:
            item.sale_unit_name || item.unit_name || "pcs"
        };
      })
    );

    setRefundMethod(
      isCreditInvoice && creditOutstanding > 0
        ? "credit"
        : sale.payments?.[0]?.method || "cash"
    );
    setRefundReference("");
    setReason("");
    setError("");
  }, [
    sale,
    isCreditInvoice,
    creditOutstanding
  ]);

  const selectedItems = useMemo(
    () =>
      items
        .filter(
          (item) =>
            Number(item.quantity || 0) > 0
        )
        .map((item) => ({
          sale_item_id: item.sale_item_id,
          quantity: Number(item.quantity),
          restock: item.restock
        })),
    [items]
  );

  const estimate = useMemo(
    () => estimateRefund(sale, selectedItems),
    [sale, selectedItems]
  );

  if (!sale) return null;

  function updateItem(saleItemId, changes) {
    setItems((current) =>
      current.map((item) =>
        item.sale_item_id === saleItemId
          ? { ...item, ...changes }
          : item
      )
    );
    setError("");
  }

  function selectAll() {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        quantity: item.available
      }))
    );
  }

  function clearAll() {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        quantity: 0
      }))
    );
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (selectedItems.length === 0) {
      setError(
        t("Choose at least one item and quantity to refund.")
      );
      return;
    }

    for (const selected of selectedItems) {
      const source = items.find(
        (item) =>
          item.sale_item_id
          === selected.sale_item_id
      );

      if (
        !Number.isFinite(selected.quantity)
        || selected.quantity <= 0
        || selected.quantity > source.available
      ) {
        setError(
          t("Refund quantity for {name} is not valid.", { name: source.product_name })
        );
        return;
      }
    }

    if (reason.trim().length < 3) {
      setError(t("Enter a refund reason."));
      return;
    }

    if (
      refundMethod === "credit"
      && estimate.totalRefund > creditOutstanding
    ) {
      setError(
        t("Credit Account refund cannot exceed the unpaid invoice balance of {balance}.", {
          balance: money(creditOutstanding, sale.currency)
        })
      );
      return;
    }

    if (
      isCreditInvoice
      && creditOutstanding > 0
      && refundMethod !== "credit"
    ) {
      setError(
        t("This invoice still has an unpaid credit balance. Use Credit Account as the refund method.")
      );
      return;
    }

    try {
      await onSubmit({
        sale_id: sale.id,
        items: selectedItems,
        refund_method: refundMethod,
        refund_reference: refundReference,
        reason
      });
    } catch (submitError) {
      setError(submitError?.message || "Unable to process this refund.");
    }
  }

  return (
    <Modal
      title={`${t("Refund")} ${sale.invoice_number}`}
      onClose={onClose}
      wide
    >
      <form
        className="refund-form"
        onSubmit={submit}
      >
        <div className="refund-sale-summary">
          <div>
            <span>{t("Customer")}</span>
            <strong>
              {sale.customers?.name || t("Walk-in")}
            </strong>
          </div>
          <div>
            <span>{t("Sale total")}</span>
            <strong>
              {money(
                sale.total_amount,
                sale.currency
              )}
            </strong>
          </div>
          <div>
            <span>{t("Already refunded")}</span>
            <strong>
              {money(
                sale.refunded_amount,
                sale.currency
              )}
            </strong>
          </div>
          <div>
            <span>{t("Status")}</span>
            <strong>
              {t(String(sale.status).replaceAll(
                "_",
                " "
              ))}
            </strong>
          </div>
        </div>

        {isCreditInvoice && (
          <section className="credit-refund-summary">
            <HandCoins size={22} />
            <div>
              <strong>{t("Credit invoice")}</strong>
              <span>
                {t("Unpaid credit balance")}: {money(
                  creditOutstanding,
                  sale.currency
                )}
              </span>
            </div>
          </section>
        )}

        <div className="refund-toolbar">
          <p className="muted">
            {t("Enter only the quantity being returned now.")}
          </p>
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={clearAll}
            >
              {t("Clear")}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={selectAll}
            >
              <Undo2 size={17} />
              {t("Select all remaining")}
            </button>
          </div>
        </div>

        <div className="refund-items">
          {(sale.sale_items || sale.items || []).map(
            (saleItem) => {
              const current = items.find(
                (item) =>
                  item.sale_item_id === saleItem.id
              );
              const available = saleItem.returnable_quantity !== undefined
                ? Number(saleItem.returnable_quantity || 0)
                : Math.max(0, Number(saleItem.quantity || 0) - Number(saleItem.returned_quantity || 0));

              return (
                <article
                  className={`refund-item ${
                    available <= 0
                      ? "fully-refunded"
                      : ""
                  }`}
                  key={saleItem.id}
                >
                  <div className="refund-item-name">
                    <strong>
                      {saleItem.product_name}
                    </strong>
                    <span>
                      {t("Sold")} {stockNumber(
                        saleItem.quantity
                      )}{" "}
                      {t(saleItem.sale_unit_name || "pcs")}
                      {" · "}
                      {t("Returned")} {stockNumber(
                        saleItem.returned_quantity
                      )}{" "}
                      {t(saleItem.sale_unit_name || "pcs")}
                      {" · "}
                      {t("Available")} {stockNumber(available)}{" "}
                      {t(saleItem.sale_unit_name || "pcs")}
                    </span>
                  </div>

                  <label>
                    <span>{t("Refund quantity")}</span>
                    <input
                      type="number"
                      min="0"
                      max={available}
                      step="0.001"
                      disabled={available <= 0}
                      value={
                        current?.quantity ?? 0
                      }
                      onChange={(event) =>
                        updateItem(
                          saleItem.id,
                          {
                            quantity:
                              event.target.value
                          }
                        )
                      }
                    />
                  </label>

                  <label className="refund-restock">
                    <span>{t("Return to stock")}</span>
                    <input
                      type="checkbox"
                      disabled={
                        available <= 0
                        || !saleItem.product_id
                      }
                      checked={Boolean(
                        current?.restock
                      )}
                      onChange={(event) =>
                        updateItem(
                          saleItem.id,
                          {
                            restock:
                              event.target.checked
                          }
                        )
                      }
                    />
                  </label>

                  <div className="refund-line-value">
                    <span>{t("Original line")}</span>
                    <strong>
                      {money(
                        saleItem.line_total,
                        sale.currency
                      )}
                    </strong>
                  </div>
                </article>
              );
            }
          )}
        </div>

        <div className="refund-details-grid">
          <label>
            <span>{t("Refund method")}</span>
            <select
              value={refundMethod}
              onChange={(event) =>
                setRefundMethod(event.target.value)
              }
            >
              {localizedPaymentMethods.map(
                ([value, label]) => (
                  <option
                    value={value}
                    key={value}
                  >
                    {label}
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            <span>{t("Reference number")}</span>
            <input
              value={refundReference}
              onChange={(event) =>
                setRefundReference(
                  event.target.value
                )
              }
              placeholder={t("Optional bank or payment reference")}
              disabled={refundMethod === "credit"}
            />
          </label>

          <label className="refund-reason-field">
            <span>{t("Reason")}</span>
            <textarea
              rows="3"
              value={reason}
              onChange={(event) =>
                setReason(event.target.value)
              }
              placeholder={t("Why is the customer returning these items?")}
            />
          </label>
        </div>

        <div className="refund-estimate">
          <div>
            <span>{t("Net merchandise refund")}</span>
            <strong>
              {money(
                estimate.netRefund,
                sale.currency
              )}
            </strong>
          </div>
          <div>
            <span>{t("Tax refund")}</span>
            <strong>
              {money(
                estimate.taxRefund,
                sale.currency
              )}
            </strong>
          </div>
          <div className="refund-estimate-total">
            <span>
              {refundMethod === "credit"
                ? t("Credit balance reduction")
                : t("Estimated refund")}
            </span>
            <strong>
              {money(
                estimate.totalRefund,
                sale.currency
              )}
            </strong>
          </div>
        </div>

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
            className="danger-button refund-submit"
            disabled={
              busy || selectedItems.length === 0
            }
          >
            <RotateCcw size={18} />
            {busy
              ? t("Processing refund...")
              : refundMethod === "credit"
                ? t("Reduce credit balance")
                : t("Process refund")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
