import { useEffect, useState } from "react";
import {
  getStockFundamentals,
  type StockFundamentalsResponse,
  type FundamentalMetricSet,
} from "../../api";

type Props = {
  ticker: string;
};

const percentageMetrics: {
  key: keyof FundamentalMetricSet;
  label: string;
}[] = [
  { key: "roe", label: "Return on equity" },
  { key: "roa", label: "Return on assets" },
  { key: "roce", label: "Return on capital" },
  { key: "operating_margin", label: "Operating margin" },
  { key: "net_margin", label: "Net margin" },
  { key: "revenue_growth_yoy", label: "Revenue growth YoY" },
  { key: "operating_income_growth_yoy", label: "Operating income growth" },
  { key: "net_income_growth_yoy", label: "Net income growth" },
  { key: "eps_growth_yoy", label: "EPS growth" },
  { key: "fcf_margin", label: "Free cash flow margin" },
];

const ratioMetrics: {
  key: keyof FundamentalMetricSet;
  label: string;
  suffix: string;
}[] = [
  { key: "debt_to_equity", label: "Debt / equity", suffix: "x" },
  { key: "current_ratio", label: "Current ratio", suffix: "x" },
  { key: "interest_coverage", label: "Interest coverage", suffix: "x" },
  { key: "cfo_to_net_income", label: "CFO / net income", suffix: "x" },
];

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(2)}%`;
}

function formatRatio(
  value: number | null,
  suffix: string,
): string {
  return value === null ? "—" : `${value.toFixed(2)}${suffix}`;
}

function formatMoney(
  value: number | null,
  currency: string | null,
): string {
  if (value === null) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="fundamental-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default function FundamentalsPanel({ ticker }: Props) {
  const [data, setData] = useState<StockFundamentalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ticker) {
      setData(null);
      return;
    }

    let active = true;

    setLoading(true);
    setError("");
    setData(null);

    getStockFundamentals(ticker)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load stock fundamentals.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ticker]);

  if (loading) {
    return (
      <section className="panel fundamentals-panel" id="fundamentals">
        <h2>Stock fundamentals</h2>
        <p className="chart-state" role="status">
          Loading annual financial statements for {ticker}…
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel fundamentals-panel" id="fundamentals">
        <h2>Stock fundamentals</h2>
        <p className="chart-state chart-error" role="alert">
          Unable to load fundamentals: {error}
        </p>
      </section>
    );
  }

  if (!data) return null;

  const analysis = data.analysis;
  const latestPeriod = analysis.periods[0];
  const latest = latestPeriod
    ? analysis.metrics[latestPeriod]
    : undefined;

  const financialCurrency = data.company.financial_currency;
  const quoteCurrency = data.company.currency;

  return (
    <section className="panel fundamentals-panel" id="fundamentals">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ANNUAL FINANCIALS</p>
          <h2>Stock fundamentals</h2>
          <p className="fundamentals-company">
            {data.company.name || ticker}
            {data.company.sector ? ` · ${data.company.sector}` : ""}
          </p>
        </div>

        <span className="panel-tag">
          {analysis.status === "supported"
            ? "Fundamentals available"
            : "Sector not supported"}
        </span>
      </div>

      <div className="fundamentals-meta">
        <span>Reporting currency: {financialCurrency || "Not provided"}</span>
        <span>Quote currency: {quoteCurrency || "Not provided"}</span>
        <span>{analysis.periods.length} annual periods</span>
      </div>

      {financialCurrency &&
        quoteCurrency &&
        financialCurrency !== quoteCurrency && (
          <p className="fundamentals-warning">
            Financial statements are reported in {financialCurrency}, while
            the stock quote is in {quoteCurrency}. Monetary figures below
            use the financial-statement currency. No FX conversion is applied.
          </p>
        )}

      {analysis.status === "unsupported_sector" ? (
        <div className="fundamentals-warning" role="status">
          {analysis.message ||
            "This sector requires a separate fundamental-analysis methodology."}
          <p>
            Financial statements are available, but industrial-company ratios
            are not calculated for this company.
          </p>
        </div>
      ) : latest ? (
        <>
          <div className="fundamentals-period">
            Latest reported period: <strong>{latestPeriod}</strong>
          </div>

          <h3 className="fundamentals-section-title">Profitability and growth</h3>
          <div className="fundamentals-metric-grid">
            {percentageMetrics.map(({ key, label }) => (
              <MetricCard
                key={key}
                label={label}
                value={formatPercent(latest[key] as number | null)}
              />
            ))}
          </div>

          <h3 className="fundamentals-section-title">Financial strength</h3>
          <div className="fundamentals-metric-grid">
            {ratioMetrics.map(({ key, label, suffix }) => (
              <MetricCard
                key={key}
                label={label}
                value={formatRatio(latest[key] as number | null, suffix)}
              />
            ))}
          </div>

          <h3 className="fundamentals-section-title">Cash flow</h3>
          <div className="fundamentals-metric-grid">
            <MetricCard
              label="Operating cash flow"
              value={formatMoney(
                latest.operating_cash_flow,
                financialCurrency || quoteCurrency,
              )}
            />
            <MetricCard
              label="Free cash flow"
              value={formatMoney(
                latest.free_cash_flow,
                financialCurrency || quoteCurrency,
              )}
            />
          </div>

          <h3 className="fundamentals-section-title">Historical metrics</h3>
          <div className="fundamentals-table-wrap">
            <table className="fundamentals-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  {analysis.periods.map((period) => (
                    <th key={period}>{period.slice(0, 4)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {percentageMetrics.map(({ key, label }) => (
                  <tr key={key}>
                    <td>{label}</td>
                    {analysis.periods.map((period) => (
                      <td key={period}>
                        {formatPercent(
                          analysis.metrics[period]?.[key] ?? null,
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="fundamentals-coverage">
            <strong>Data coverage</strong>
            <span>
              {analysis.coverage.available_periods} reporting periods
            </span>
            <span>
              Coverage is reported per metric; unavailable values are not
              treated as zero.
            </span>
          </div>
        </>
      ) : (
        <p className="chart-state">
          No calculated annual metrics are available.
        </p>
      )}

      <p className="fundamentals-footnote">
        Source: {data.provider}. Retrieved{" "}
        {new Date(data.fetched_at).toLocaleString()}. Metrics are calculated
        from provider-reported annual statements and are not an investment
        recommendation.
      </p>
    </section>
  );
}