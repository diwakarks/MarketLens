
CREATE TABLE IF NOT EXISTS portfolio_cash_flows (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    flow_type VARCHAR(11) NOT NULL
        CHECK (flow_type IN ('DEPOSIT', 'WITHDRAWAL')),

    amount NUMERIC(20, 8) NOT NULL
        CHECK (amount > 0),

    flow_date DATE NOT NULL,

    description VARCHAR(500),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
    idx_portfolio_cash_flows_date
ON portfolio_cash_flows (flow_date, id);
