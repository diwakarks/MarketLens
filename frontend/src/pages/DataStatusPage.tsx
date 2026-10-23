
import type { DataFreshness, RefreshStatus } from "../api";

type DataStatusPageProps = {
  freshness: DataFreshness | null;
  freshnessError: string | null;
  refreshStatus: RefreshStatus | null;
  refreshStatusError: string | null;
};

export default function DataStatusPage({
  freshness,
  freshnessError,
  refreshStatus,
  refreshStatusError,
}: DataStatusPageProps) {
  return (
    <>
      <section className="freshness-panel">
        <div className="freshness-heading">
          <div>
            <h2>Data Freshness</h2>
            <p>Stored market data and database import status</p>
          </div>

          {freshness && (
            <span
              className={`freshness-status freshness-status--${
                freshness.database_import?.status ??
                (freshness.data_status === "available"
                  ? "success"
                  : "unknown")
              }`}
            >
              {(
                freshness.database_import?.status ?? freshness.data_status
              )
                .toUpperCase()
                .replace("_", " ")}
            </span>
          )}
        </div>

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

            <div className="freshness-item">
              <span>Latest trading date</span>
              <strong>{freshness.latest_trade_date ?? "Not available"}</strong>
            </div>

            <div className="freshness-item">
              <span>Last successful import</span>
              <strong>
                {freshness.last_successful_import
                  ? new Date(
                      freshness.last_successful_import,
                    ).toLocaleString()
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
        <h3>Refresh Pipeline</h3>

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
                  title: "Provider Download",
                  countLabel: "Rows downloaded",
                },
                {
                  key: "database_import",
                  title: "Database Import",
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

                  <p>
                    Latest trading date: {result?.latest_trade_date ?? "—"}
                  </p>

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
