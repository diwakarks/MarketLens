import { useCallback, useEffect, useState } from "react";
import {
  createPortfolioTransaction,
  getPortfolioValuation,
  getPortfolioTransactions,
  updatePortfolioTransaction,
  deletePortfolioTransaction,
  type PortfolioTransaction,
  type PortfolioTransactionRequest,
  type PortfolioValuationResponse,
  type PortfolioNumericValue,
  type Stock,
} from "./api";

function getLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toNumber(value: PortfolioNumericValue): number {
  return Number(value);
}

function formatMoney(
  value: PortfolioNumericValue | null,
  currency: string,
): string {
  if (value === null || !Number.isFinite(Number(value))) {
    return "—";
  }

  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatQuantity(value: PortfolioNumericValue): string {
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 8,
  });
}

export default function PortfolioValuationPanel({
  stocks,
  onPortfolioChanged,
}: {
  stocks: Stock[];
  onPortfolioChanged: () => Promise<void>;
}) {
  const [valuation, setValuation] = useState<PortfolioValuationResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [ticker, setTicker] = useState("");
  const [transactionType, setTransactionType] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("");
  const [pricePerShare, setPricePerShare] = useState("");
  const [transactionDate, setTransactionDate] = useState(getLocalDate);
  const [fees, setFees] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [editingTransaction, setEditingTransaction] =
  useState<PortfolioTransaction | null>(null);
  const [editType, setEditType] = useState<"BUY" | "SELL">("BUY");
  const [editQuantity, setEditQuantity] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editFees, setEditFees] = useState("0");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editMessage, setEditMessage] = useState("");

  const loadValuation = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const result = await getPortfolioValuation();
      setValuation(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load portfolio valuation.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const result = await getPortfolioTransactions();
      setTransactions(result);
    } catch (err) {
      setHistoryError(
        err instanceof Error
          ? err.message
          : "Unable to load transaction history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleTransactionSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setTransactionMessage("");
    setTransactionError("");

    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(pricePerShare);
    const parsedFees = Number(fees);

    if (
      !ticker ||
      !Number.isFinite(parsedQuantity) ||
      parsedQuantity <= 0 ||
      !Number.isFinite(parsedPrice) ||
      parsedPrice <= 0 ||
      !Number.isFinite(parsedFees) ||
      parsedFees < 0 ||
      !transactionDate
    ) {
      setTransactionError(
        "Enter a valid ticker, quantity, price, date, and fees.",
      );
      return;
    }

    const payload: PortfolioTransactionRequest = {
      ticker,
      transaction_type: transactionType,
      quantity: parsedQuantity,
      price_per_share: parsedPrice,
      transaction_date: transactionDate,
      fees: parsedFees,
    };

    setSubmitting(true);

    try {
      await createPortfolioTransaction(payload);

      setTransactionMessage(
        `${transactionType} transaction recorded successfully.`,
      );
      setQuantity("");
      setPricePerShare("");
      setFees("0");

      await Promise.all([loadValuation(true), loadTransactions(), onPortfolioChanged(),]);
    } catch (err) {
      setTransactionError(
        err instanceof Error
          ? err.message
          : "Unable to record the transaction.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (transaction: PortfolioTransaction) => {
  setEditingTransaction(transaction);
  setEditType(transaction.transaction_type);
  setEditQuantity(String(transaction.quantity));
  setEditPrice(String(transaction.price_per_share));
  setEditDate(transaction.transaction_date);
  setEditFees(String(transaction.fees));
  setEditError("");
  setEditMessage("");
};

const handleEditSubmit = async (
  event: React.FormEvent<HTMLFormElement>,
) => {
  event.preventDefault();

  if (!editingTransaction) return;

  const parsedQuantity = Number(editQuantity);
  const parsedPrice = Number(editPrice);
  const parsedFees = Number(editFees);

  if (
    !Number.isFinite(parsedQuantity) ||
    parsedQuantity <= 0 ||
    !Number.isFinite(parsedPrice) ||
    parsedPrice <= 0 ||
    !Number.isFinite(parsedFees) ||
    parsedFees < 0 ||
    !editDate
  ) {
    setEditError("Enter a valid quantity, price, date, and fees.");
    return;
  }

  setEditSaving(true);
  setEditError("");

  try {
    await updatePortfolioTransaction(editingTransaction.id, {
      transaction_type: editType,
      quantity: parsedQuantity,
      price_per_share: parsedPrice,
      transaction_date: editDate,
      fees: parsedFees,
    });

    setEditingTransaction(null);
    setEditMessage("Transaction updated successfully.");

    await Promise.all([loadValuation(true), loadTransactions(), onPortfolioChanged(),]);
  } catch (err) {
    setEditError(
      err instanceof Error ? err.message : "Unable to update transaction.",
    );
  } finally {
    setEditSaving(false);
  }
};

const handleDeleteTransaction = async (
  transaction: PortfolioTransaction,
) => {
  const confirmed = window.confirm(
    `Delete the ${transaction.transaction_type} transaction for ` +
      `${transaction.ticker} dated ${transaction.transaction_date}? ` +
      "This cannot be undone.",
  );

  if (!confirmed) return;

  setDeletingId(transaction.id);
  setHistoryError("");
  setEditMessage("");

  try {
    await deletePortfolioTransaction(transaction.id);

    if (editingTransaction?.id === transaction.id) {
      setEditingTransaction(null);
    }

    setEditMessage("Transaction deleted successfully.");

    await Promise.all([loadValuation(true), loadTransactions(),onPortfolioChanged(),]);
  } catch (err) {
    setHistoryError(
      err instanceof Error ? err.message : "Unable to delete transaction.",
    );
  } finally {
    setDeletingId(null);
  }
};

  useEffect(() => {
    void loadValuation();
    void loadTransactions();
  }, [loadValuation, loadTransactions]);

  const positions = valuation?.positions ?? [];

  const isIndianPortfolio =
    positions.length === 0 ||
    positions.every((position) => /\.(NS|BO)$/i.test(position.ticker));

  const currency = isIndianPortfolio ? "INR" : "USD";

  const metrics = [
    {
      label: "MARKET VALUE",
      value: valuation
        ? formatMoney(valuation.total_market_value, currency)
        : "—",
      description: "Current value of priced holdings",
    },
    {
      label: "TOTAL COST BASIS",
      value: valuation
        ? formatMoney(valuation.total_cost_basis, currency)
        : "—",
      description: "Remaining average-cost basis",
    },
    {
      label: "REALIZED P/L",
      value: valuation
        ? formatMoney(valuation.total_realized_pnl, currency)
        : "—",
      description: "Profit or loss from completed sales",
    },
    {
      label: "UNREALIZED P/L",
      value: valuation
        ? formatMoney(valuation.total_unrealized_pnl, currency)
        : "—",
      description: "Profit or loss on current holdings",
    },
  ];

  return (
    <section className="panel portfolio-valuation" id="portfolio-valuation">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">TRANSACTION LEDGER</p>
          <h2>Portfolio Valuation</h2>
        </div>

        <button
          type="button"
          className="valuation-refresh"
          onClick={() => void loadValuation(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <p className="analytics-description">
        Track your transaction-based holdings, current market value, and
        realized and unrealized profit or loss.
      </p>

      <form className="transaction-form" onSubmit={handleTransactionSubmit}>
        <div className="panel-heading transaction-form-heading">
          <div>
            <p className="eyebrow">TRADE MANAGEMENT</p>
            <h2>Record Transaction</h2>
          </div>
        </div>

        <div className="transaction-form-grid">
          <label className="portfolio-field">
            <span>STOCK</span>
            <select
              value={ticker}
              onChange={(event) => setTicker(event.target.value)}
              required
            >
              <option value="">Choose a stock</option>
              {stocks.map((stock) => (
                <option key={stock.ticker} value={stock.ticker}>
                  {stock.ticker}
                  {stock.name ? ` — ${stock.name}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="portfolio-field">
            <span>TRANSACTION TYPE</span>
            <select
              value={transactionType}
              onChange={(event) =>
                setTransactionType(event.target.value as "BUY" | "SELL")
              }
            >
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>

          <label className="portfolio-field">
            <span>QUANTITY</span>
            <input
              type="number"
              min="0.00000001"
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="e.g. 10"
              required
            />
          </label>

          <label className="portfolio-field">
            <span>PRICE PER SHARE</span>
            <input
              type="number"
              min="0.00000001"
              step="any"
              value={pricePerShare}
              onChange={(event) => setPricePerShare(event.target.value)}
              placeholder="e.g. 150.50"
              required
            />
          </label>

          <label className="portfolio-field">
            <span>TRANSACTION DATE</span>
            <input
              type="date"
              value={transactionDate}
              onChange={(event) => setTransactionDate(event.target.value)}
              required
            />
          </label>

          <label className="portfolio-field">
            <span>FEES</span>
            <input
              type="number"
              min="0"
              step="any"
              value={fees}
              onChange={(event) => setFees(event.target.value)}
              required
            />
          </label>
        </div>

        {transactionError && (
          <p className="valuation-error" role="alert">
            {transactionError}
          </p>
        )}

        {transactionMessage && (
          <p className="valuation-positive" role="status">
            {transactionMessage}
          </p>
        )}

        <button
          type="submit"
          className="valuation-refresh transaction-submit"
          disabled={submitting || stocks.length === 0}
        >
          {submitting ? "Recording..." : "Record Transaction"}
        </button>
      </form>

      {error && (
        <div className="valuation-message valuation-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="valuation-refresh"
            onClick={() => void loadValuation()}
          >
            Try again
          </button>
        </div>
      )}

      {loading && !valuation && !error && (
        <p className="valuation-message">Loading portfolio valuation...</p>
      )}

      {!loading && !error && valuation && (
        <>
          <div className="metrics-grid valuation-metrics">
            {metrics.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <p>{metric.label}</p>
                <h3>{metric.value}</h3>
                <span>{metric.description}</span>
              </article>
            ))}
          </div>

          {valuation.total_pnl !== null && (
            <p className="valuation-total-pnl">
              Total P/L:{" "}
              <strong>{formatMoney(valuation.total_pnl, currency)}</strong>
            </p>
          )}

          {valuation.unpriced_tickers.length > 0 && (
            <p className="valuation-message valuation-warning">
              Latest prices are unavailable for:{" "}
              {valuation.unpriced_tickers.join(", ")}. Total unrealized P/L
              cannot be calculated completely.
            </p>
          )}

          <div className="valuation-table-wrap">
            <table className="valuation-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Quantity</th>
                  <th>Average Cost</th>
                  <th>Latest Price</th>
                  <th>Market Value</th>
                  <th>Unrealized P/L</th>
                </tr>
              </thead>

              <tbody>
                {positions.map((position) => (
                  <tr key={position.ticker}>
                    <td>
                      <strong>{position.ticker}</strong>
                    </td>
                    <td>{formatQuantity(position.quantity)}</td>
                    <td>{formatMoney(position.average_cost, currency)}</td>
                    <td>{formatMoney(position.latest_price, currency)}</td>
                    <td>{formatMoney(position.market_value, currency)}</td>
                    <td
                      className={
                        position.unrealized_pnl === null
                          ? ""
                          : toNumber(position.unrealized_pnl) >= 0
                            ? "valuation-positive"
                            : "valuation-negative"
                      }
                    >
                      {formatMoney(position.unrealized_pnl, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="transaction-history">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">LEDGER RECORDS</p>
                <h3>Transaction History</h3>
              </div>
              <button
                type="button"
                className="valuation-refresh"
                onClick={() => void loadTransactions()}
                disabled={historyLoading}
              >
                {historyLoading ? "Loading..." : "Refresh History"}
              </button>
            </div>

            {historyError && (
              <p className="valuation-error" role="alert">
                {historyError}
              </p>
            )}
            {editMessage && (
  <p className="valuation-message" role="status">
    {editMessage}
  </p>
)}

{editingTransaction && (
  <form className="transaction-form" onSubmit={handleEditSubmit}>
    <div className="panel-heading">
      <div>
        <p className="eyebrow">CORRECT LEDGER ENTRY</p>
        <h3>
          Edit {editingTransaction.ticker} transaction
        </h3>
      </div>
    </div>

    <div className="transaction-form-grid">
      <label>
        Ticker
        <input value={editingTransaction.ticker} disabled />
      </label>

      <label>
        Transaction Type
        <select
          value={editType}
          onChange={(event) =>
            setEditType(event.target.value as "BUY" | "SELL")
          }
        >
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
      </label>

      <label>
        Quantity
        <input
          type="number"
          min="0.00000001"
          step="any"
          value={editQuantity}
          onChange={(event) => setEditQuantity(event.target.value)}
          required
        />
      </label>

      <label>
        Price per Share
        <input
          type="number"
          min="0.00000001"
          step="any"
          value={editPrice}
          onChange={(event) => setEditPrice(event.target.value)}
          required
        />
      </label>

      <label>
        Transaction Date
        <input
          type="date"
          value={editDate}
          onChange={(event) => setEditDate(event.target.value)}
          required
        />
      </label>

      <label>
        Fees
        <input
          type="number"
          min="0"
          step="any"
          value={editFees}
          onChange={(event) => setEditFees(event.target.value)}
          required
        />
      </label>
    </div>

    {editError && (
      <p className="valuation-error" role="alert">
        {editError}
      </p>
    )}

    <div className="transaction-form-actions">
      <button type="submit" disabled={editSaving}>
        {editSaving ? "Saving..." : "Save Changes"}
      </button>

      <button
        type="button"
        className="valuation-refresh"
        disabled={editSaving}
        onClick={() => {
          setEditingTransaction(null);
          setEditError("");
        }}
      >
        Cancel
      </button>
    </div>
  </form>
)}

            {historyLoading ? (
              <p className="valuation-message">Loading transactions...</p>
            ) : transactions.length === 0 ? (
              <p className="valuation-message">
                No transactions have been recorded yet.
              </p>
            ) : (
              <div className="valuation-table-wrap">
                <table className="valuation-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Ticker</th>
                      <th>Type</th>
                      <th>Quantity</th>
                      <th>Price / Share</th>
                      <th>Fees</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td>{transaction.transaction_date}</td>
                        <td>
                          <strong>{transaction.ticker}</strong>
                        </td>
                        <td>
                          <span
                            className={
                              transaction.transaction_type === "BUY"
                                ? "valuation-positive"
                                : "valuation-negative"
                            }
                          >
                            {transaction.transaction_type}
                          </span>
                        </td>
                        <td>{formatQuantity(transaction.quantity)}</td>
                        <td>
                          {formatMoney(transaction.price_per_share, currency)}
                        </td>
                        <td>{formatMoney(transaction.fees, currency)}</td>
<td>
  <div className="transaction-form-actions">
    <button
      type="button"
      className="valuation-refresh"
      onClick={() => startEditing(transaction)}
      disabled={editSaving || deletingId !== null}
    >
      Edit
    </button>

    <button
      type="button"
      className="valuation-refresh"
      onClick={() => void handleDeleteTransaction(transaction)}
      disabled={editSaving || deletingId !== null}
    >
      {deletingId === transaction.id ? "Deleting..." : "Delete"}
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

          {positions.length === 0 && (
            <p className="valuation-message">
              No active holdings yet. Record a buy transaction to start tracking
              your portfolio.
            </p>
          )}
        </>
      )}
    </section>
  );
}
