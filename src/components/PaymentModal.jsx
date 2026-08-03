import {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Banknote,
  Building2,
  CreditCard,
  HandCoins,
  QrCode,
  Wallet
} from "lucide-react";
import Modal from "./Modal";
import { money } from "../lib/catalog";

const methods = [
  ["cash", "Cash", Banknote],
  ["bank", "Bank", Building2],
  ["khqr", "KHQR", QrCode],
  ["card", "Card", CreditCard],
  ["credit", "Credit", HandCoins],
  ["other", "Other", Wallet]
];

function dueDateFromTerms(days) {
  const date = new Date();
  date.setDate(
    date.getDate() + Number(days || 0)
  );
  return date;
}

export default function PaymentModal({
  open,
  busy,
  totals,
  currency,
  customerName,
  creditAccount,
  cashRegisterOpen = true,
  offline = false,
  onClose,
  onSubmit
}) {
  const [method, setMethod] = useState("cash");
  const [amountReceived, setAmountReceived] =
    useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");

  const unlimitedCredit = Boolean(
    creditAccount?.allow_unlimited_credit
  );

  const creditAvailable = unlimitedCredit
    ? Number.POSITIVE_INFINITY
    : Math.max(
        0,
        Number(creditAccount?.credit_limit || 0)
          - Number(creditAccount?.balance_due || 0)
      );

  const creditAllowed = Boolean(
    customerName
    && creditAccount
    && !creditAccount.is_on_hold
    && (
      unlimitedCredit
      || Number(creditAccount.credit_limit || 0) > 0
    )
    && !offline
    && Number(totals.total || 0) > 0
    && (
      unlimitedCredit
      || creditAvailable >= Number(totals.total || 0)
    )
  );

  useEffect(() => {
    if (!open) return;

    setMethod(cashRegisterOpen ? "cash" : "bank");
    setAmountReceived(String(totals.total));
    setReference("");
    setError("");
  }, [
    open,
    totals.total,
    cashRegisterOpen
  ]);

  useEffect(() => {
    if (method === "credit" && !creditAllowed) {
      setMethod(cashRegisterOpen ? "cash" : "bank");
    }
  }, [
    method,
    creditAllowed,
    cashRegisterOpen
  ]);

  useEffect(() => {
    if (method === "credit") {
      setAmountReceived("0");
      setReference("");
      return;
    }

    if (method !== "cash") {
      setAmountReceived(String(totals.total));
    }
  }, [method, totals.total]);

  const change = useMemo(
    () =>
      method === "cash"
        ? Math.max(
            0,
            Number(amountReceived || 0)
              - Number(totals.total || 0)
          )
        : 0,
    [method, amountReceived, totals.total]
  );

  if (!open) return null;

  function submit(event) {
    event.preventDefault();
    setError("");

    if (method === "credit") {
      if (!customerName) {
        setError(
          "Choose a customer before using Credit Account."
        );
        return;
      }

      if (!creditAccount) {
        setError(
          `This customer has no ${currency} credit account.`
        );
        return;
      }

      if (creditAccount.is_on_hold) {
        setError(
          "This customer credit account is on hold."
        );
        return;
      }

      if (
        !unlimitedCredit
        && creditAvailable < Number(totals.total)
      ) {
        setError(
          `Available credit is only ${money(
            creditAvailable,
            currency
          )}.`
        );
        return;
      }

      onSubmit({
        payment_method: "credit",
        amount_received: 0,
        payment_reference: ""
      });
      return;
    }

    const received = Number(amountReceived || 0);

    if (method === "cash" && !cashRegisterOpen) {
      setError(
        "Open the cash register before accepting cash."
      );
      return;
    }

    if (
      !Number.isFinite(received)
      || received < Number(totals.total)
    ) {
      setError(
        `Amount received must be at least ${money(
          totals.total,
          currency
        )}.`
      );
      return;
    }

    onSubmit({
      payment_method: method,
      amount_received: received,
      payment_reference: reference.trim()
    });
  }

  const roundedUp = Math.ceil(
    Number(totals.total || 0)
  );
  const cashIncrements =
    currency === "KHR"
      ? [1000, 5000, 10000]
      : [10, 20, 50];

  return (
    <Modal
      title="Complete payment"
      onClose={() => !busy && onClose()}
    >
      <form
        className="payment-form"
        onSubmit={submit}
      >
        <div className="payment-total-card">
          <span>Amount due</span>
          <strong>
            {money(totals.total, currency)}
          </strong>
          <small>
            {customerName || "Walk-in customer"}
          </small>
        </div>

        {offline && (
          <div className="notice warning payment-register-warning">
            Offline payment creates a pending-sync receipt. Credit, coupons and manual discounts are unavailable until reconnected.
          </div>
        )}

        {!cashRegisterOpen && (
          <div className="notice warning payment-register-warning">
            Cash is disabled because this branch has
            no open register. Bank, KHQR, card,
            customer credit and other payments remain
            available when eligible.
          </div>
        )}

        <div className="payment-method-grid credit-sale-method-grid">
          {methods.map(([value, label, Icon]) => {
            const disabled =
              (value === "cash" && !cashRegisterOpen)
              || (value === "credit" && !creditAllowed);

            let title;

            if (value === "cash" && !cashRegisterOpen) {
              title = "Open the cash register first";
            } else if (value === "credit") {
              if (!customerName) {
                title = "Choose a customer first";
              } else if (!creditAccount) {
                title = `No ${currency} credit account`;
              } else if (creditAccount.is_on_hold) {
                title = "Credit account is on hold";
              } else if (
                !unlimitedCredit
                && creditAvailable < Number(totals.total)
              ) {
                title = "Available credit is too low";
              }
            }

            return (
              <button
                type="button"
                key={value}
                className={
                  method === value ? "active" : ""
                }
                onClick={() => setMethod(value)}
                disabled={disabled}
                title={title}
              >
                <Icon size={22} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {method === "credit" ? (
          <section className="credit-sale-summary">
            <div>
              <span>Current balance</span>
              <strong>
                {money(
                  creditAccount?.balance_due || 0,
                  currency
                )}
              </strong>
            </div>
            <div>
              <span>Available credit</span>
              <strong>
                {unlimitedCredit
                  ? "Unlimited"
                  : money(creditAvailable, currency)}
              </strong>
            </div>
            <div>
              <span>Balance after sale</span>
              <strong>
                {money(
                  Number(
                    creditAccount?.balance_due || 0
                  ) + Number(totals.total || 0),
                  currency
                )}
              </strong>
            </div>
            <div>
              <span>Due date</span>
              <strong>
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium"
                }).format(
                  dueDateFromTerms(
                    creditAccount?.payment_terms_days
                  )
                )}
              </strong>
            </div>
          </section>
        ) : (
          <label>
            <span>
              {method === "cash"
                ? "Cash received"
                : "Amount paid"}
            </span>
            <input
              type="number"
              min={totals.total}
              step="0.01"
              value={amountReceived}
              onChange={(event) =>
                setAmountReceived(event.target.value)
              }
              disabled={method !== "cash"}
              autoFocus
            />
          </label>
        )}

        {method === "cash" && (
          <div className="cash-shortcuts">
            <button
              type="button"
              onClick={() =>
                setAmountReceived(String(totals.total))
              }
            >
              Exact
            </button>

            {roundedUp > Number(totals.total) && (
              <button
                type="button"
                onClick={() =>
                  setAmountReceived(String(roundedUp))
                }
              >
                {money(roundedUp, currency)}
              </button>
            )}

            {cashIncrements.map((increment) => (
              <button
                type="button"
                key={increment}
                onClick={() =>
                  setAmountReceived(
                    String(roundedUp + increment)
                  )
                }
              >
                {money(
                  roundedUp + increment,
                  currency
                )}
              </button>
            ))}
          </div>
        )}

        {method !== "cash"
          && method !== "credit" && (
            <label>
              <span>Reference number</span>
              <input
                value={reference}
                onChange={(event) =>
                  setReference(event.target.value)
                }
                placeholder="Optional bank, KHQR or card reference"
              />
            </label>
          )}

        <div className="payment-change-row">
          <span>
            {method === "credit"
              ? "Paid now"
              : "Change"}
          </span>
          <strong>
            {money(
              method === "credit" ? 0 : change,
              currency
            )}
          </strong>
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
            Cancel
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={busy}
          >
            {busy
              ? "Completing..."
              : method === "credit"
                ? "Complete credit sale"
                : "Complete sale"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
