import { useState } from "react";
import type {
  Stock,
  DataFreshness,
  RefreshStatus,
  RefreshStockResponse,
} from "../api";
import { refreshStock } from "../api";

type DataStatusPageProps = {
  stocks?: Stock[];
  selectedStock: string;
  onSelectStock?: (ticker: string) => void;
  freshness: DataFreshness | null;
  freshnessError: string | null;
  refreshStatus: RefreshStatus | null;
  refreshStatusError: string | null;
  onRefreshSuccess?: (refreshedData: RefreshStockResponse) => void;
};

export default function DataStatusPage({
  stocks = [],
  selectedStock,
  onSelectStock,
  freshness,
  freshnessError,
  refreshStatus,
  refreshStatusError,
  onRefreshSuccess,
}: DataStatusPageProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSuccessMessage, setRefreshSuccessMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [latestImportedDate, setLatestImportedDate] = useState<string | null>(null);

  const activeTicker = selectedStock || freshness?.ticker || "";

  async function handleTriggerRefresh() {
    if (!activeTicker) return;

    setRefreshing(true);
    setRefreshError(null);
    setRefreshSuccessMessage(null);

    try {
      const response = await refreshStock(activeTicker);
      setLatestImportedDate(response.latest_trade_date);
      setRefreshSuccessMessage(
        `${response.ticker} refreshed successfully: ${response.rows_imported.toLocaleString()} historical daily rows processed into PostgreSQL.`
      );
      onRefreshSuccess?.(response);
    } catch (err) {
      setRefreshError(
        err instanceof Error ? err.message : "Unable to execute data refresh pipeline."
      );
    } finally {
      setRefreshing(false);
    }
  }

  // Display either the newly refreshed trade date or the currently stored trade date
  const displayLatestTradeDate =
    latestImportedDate ?? freshness?.latest_trade_date;

  return (
    <>
      <section className="freshness-panel">
        <div className="freshness-heading">
          <div>
            <h2>Data Freshness &amp; Pipeline Status</h2>
            <p>Stored market data coverage, latest trading dates, and pipeline synchronization</p>
          </div>

          <div className="data-status-actions">
            {stocks.length > 0 && onSelectStock && (
              <div className="stock-picker-inline">
                <label htmlFor="status-ticker-select">Instrument:</label>
                <select
                  id="status-ticker-select"
                  value={selectedStock}
                  onChange={(event) => {
                    setRefreshSuccessMessage(null);
                    setRefreshError(null);
                    setLatestImportedDate(null);
                    onSelectStock(event.target.value);
                  }}
                  disabled={refreshing}
                >
                  {stocks.map((stock) => (
                    <option key={stock.ticker} value={stock.ticker}>
                      {stock.ticker} {stock.name ? `— ${stock.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              className="primary-button refresh-action-button"
              onClick={handleTriggerRefresh}
              disabled={refreshing || !activeTicker}
              aria-label={`Refresh market data pipeline for ${activeTicker || "ticker"}`}
            >
              {refreshing ? "Refreshing pipeline…" : `⟳ Refresh ${activeTicker || "Data"}`}
            </button>
          </div>
        </div>

        {refreshSuccessMessage && (
          <div className="data-refresh-banner data-refresh-banner--success" role="status">
            <span className="data-refresh-banner-badge">PIPELINE COMPLETE</span>
            <div className="data-refresh-banner-body">
              <p className="data-refresh-banner-title">{refreshSuccessMessage}</p>
              <p className="data-refresh-banner-sub">
                Latest imported trading date:{" "}
                <strong className="highlighted-trade-date">
                  {displayLatestTradeDate ?? "Not available"}
                </strong>
                {freshness?.last_successful_import && (
                  <span>
                    {" "}· Recorded at: {new Date(freshness.last_successful_import).toLocaleString()}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {refreshError && (
          <div className="data-refresh-banner data-refresh-banner--error" role="alert">
            <span className="data-refresh-banner-badge">REFRESH FAILED</span>
            <div className="data-refresh-banner-body">
              <p className="data-refresh-banner-title">{refreshError}</p>
            </div>
          </div>
        )}

        {freshness && (
          <div className="freshness-status-row">
            <span
              className={`freshness-status freshness-status--${freshness.freshness_status}`}
            >
              {
                (
                  {
                    stale: "STALE — PROVIDER IS NEWER",
                    matched: "DATES MATCH",
                    database_ahead: "DATABASE IS AHEAD",
                    no_data: "NO DATA",
                    unknown: "FRESHNESS UNKNOWN",
                  } as const
                )[freshness.freshness_status]
              }
            </span>
          </div>
        )}

        {freshnessError ? (
          <p className="freshness-error">{freshnessError}</p>
        ) : freshness ? (
          <div className="freshness-details">
            <div className="freshness-item">
              <span>Selected ticker</span>
              <strong>{freshness.ticker}</strong>
            </div>

            <div className="freshness-item">
              <span>Company / instrument</span>
              <strong>{freshness.name || freshness.ticker}</strong>
            </div>

            <div className="freshness-item">
              <span>Exchange / Currency</span>
              <strong>
                {freshness.exchange} / {freshness.currency}
              </strong>
            </div>

            <div className="freshness-item">
              <span>Stored rows</span>
              <strong>{freshness.stored_rows.toLocaleString()}</strong>
            </div>

            <div className="freshness-item freshness-item--highlight">
              <span>Latest imported date</span>
              <strong className="highlighted-trade-date">
                {displayLatestTradeDate ?? "Not available"}
              </strong>
            </div>

            <div className="freshness-item">
              <span>Provider latest trading date</span>
              <strong>
                {freshness.provider_latest_trade_date ?? "Not available"}
              </strong>
            </div>

            <div className="freshness-item">
              <span>Last successful import</span>
              <strong>
                {freshness.last_successful_import
                  ? new Date(freshness.last_successful_import).toLocaleString()
                  : "No successful import recorded"}
              </strong>
            </div>

            {freshness.database_import?.error_message && (
              <div className="freshness-item freshness-item--error">
                <span>Latest import error</span>
                <strong>{freshness.database_import.error_message}</strong>
              </div>
            )}

            {freshness.data_status === "no_data" && (
              <div className="freshness-item freshness-item--error">
                <span>Data availability</span>
                <strong>
                  No market data is currently stored for this ticker.
                </strong>
              </div>
            )}
          </div>
        ) : (
          <p className="freshness-loading">Loading data freshness…</p>
        )}
      </section>

      <section className="refresh-pipeline">
        <h3>Refresh Pipeline Details</h3>

        {refreshStatusError ? (
          <p className="freshness-error">{refreshStatusError}</p>
        ) : !refreshStatus ? (
          <p className="freshness-loading">Loading refresh status…</p>
        ) : (
          <div className="refresh-stage-grid">
            {(
              [
                {
                  key: "provider",
                  title: "Provider Download (Yahoo Finance)",
                  countLabel: "Rows downloaded",
                },
                {
                  key: "database_import",
                  title: "Database Import (PostgreSQL)",
                  countLabel: "Rows imported",
                },
              ] as const
            ).map((stage) => {
              const result = refreshStatus[stage.key];
              const status = result?.status ?? "unknown";
              const rowCount =
                stage.key === "provider"
                  ? result?.rows_downloaded
                  : result?.rows_imported;

              return (
                <div className="refresh-stage" key={stage.key}>
                  <div className="refresh-stage-heading">
                    <strong>{stage.title}</strong>
                    <span
                      className={`freshness-status freshness-status--${status}`}
                    >
                      {status.toUpperCase()}
                    </span>
                  </div>

                  <p>
                    {stage.countLabel}: {rowCount ?? "—"}
                  </p>

                  <p>Latest trading date: {result?.latest_trade_date ?? "—"}</p>

                  <p>
                    Last attempt:{" "}
                    {result?.completed_at
                      ? new Date(result.completed_at).toLocaleString()
                      : result?.started_at
                        ? new Date(result.started_at).toLocaleString()
                        : "No recorded attempt"}
                  </p>

                  {result?.error_message && (
                    <p className="freshness-error">{result.error_message}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
