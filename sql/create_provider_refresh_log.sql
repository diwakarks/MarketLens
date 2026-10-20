CREATE TABLE IF NOT EXISTS provider_refresh_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticker VARCHAR(32) NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'yfinance',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    rows_downloaded INTEGER NOT NULL DEFAULT 0,
    latest_trade_date DATE,
    error_message TEXT,

    CONSTRAINT chk_provider_refresh_status
        CHECK (status IN ('running', 'success', 'failed')),

    CONSTRAINT chk_provider_rows_downloaded
        CHECK (rows_downloaded >= 0)
);

CREATE INDEX IF NOT EXISTS idx_provider_refresh_ticker_started
    ON provider_refresh_log (ticker, started_at DESC);