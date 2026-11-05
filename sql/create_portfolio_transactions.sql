CREATE TABLE IF NOT EXISTS portfolio_transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    instrument_id BIGINT NOT NULL
        REFERENCES instruments(id)
        ON DELETE RESTRICT,

    transaction_type VARCHAR(4) NOT NULL
        CHECK (transaction_type IN ('BUY', 'SELL')),

    quantity NUMERIC(20, 8) NOT NULL
        CHECK (quantity > 0),

    price_per_share NUMERIC(20, 8) NOT NULL
        CHECK (price_per_share > 0),

    transaction_date DATE NOT NULL,

    fees NUMERIC(20, 8) NOT NULL DEFAULT 0
        CHECK (fees >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
    idx_portfolio_transactions_instrument_date
ON portfolio_transactions (instrument_id, transaction_date, id);