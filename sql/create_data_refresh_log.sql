
CREATE TABLE IF NOT EXISTS data_refresh_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticker VARCHAR(32) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    rows_imported INTEGER NOT NULL DEFAULT 0,
    latest_trade_date DATE,
    error_message TEXT,

    CONSTRAINT data_refresh_log_status_check
        CHECK (status IN ('running', 'success', 'failed')),

    CONSTRAINT data_refresh_log_rows_check
        CHECK (rows_imported >= 0)
);

CREATE INDEX IF NOT EXISTS idx_data_refresh_log_ticker_started
    ON data_refresh_log (ticker, started_at DESC);
