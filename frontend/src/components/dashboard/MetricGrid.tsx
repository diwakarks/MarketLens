import type { StockMetrics } from "../../api";
import { formatPrice, formatPercent } from "../../utils/formatters";

type MetricGridProps = {
  metrics: StockMetrics | null;
  currency: string;
  benchmarkName: string;
};


export default function MetricGrid({
  metrics,
  currency,
  benchmarkName,
}: MetricGridProps) {
  return (
    <section className="metrics-grid" aria-label="Key market metrics">
      <article className="metric-card">
        <p>Starting price</p>
        <h3>
          {metrics ? formatPrice(metrics.starting_close, currency) : "—"}
        </h3>
        <span>First observation</span>
      </article>

      <article className="metric-card">
        <p>Latest price</p>
        <h3>
          {metrics ? formatPrice(metrics.ending_close, currency) : "—"}
        </h3>
        <span>Most recent observation</span>
      </article>

      <article className="metric-card">
        <p>Total return</p>
        <h3>{metrics ? formatPercent(metrics.total_return) : "—"}</h3>
        <span>Historical price performance</span>
      </article>

      <article className="metric-card">
        <p>Annualized volatility</p>
        <h3>
          {metrics ? formatPercent(metrics.annualized_volatility) : "—"}
        </h3>
        <span>Annualized daily-return risk</span>
      </article>

      <article className="metric-card">
        <p>Sharpe Ratio</p>
        <h3>
          {metrics?.sharpe_ratio != null
            ? metrics.sharpe_ratio.toFixed(2)
            : "—"}
        </h3>
        <span>Risk-adjusted return · 0% risk-free rate</span>
      </article>

      <article className="metric-card">
        <p>Beta</p>
        <h3>{metrics?.beta != null ? metrics.beta.toFixed(2) : "—"}</h3>
        <span>Sensitivity to {benchmarkName} returns</span>
      </article>

      <article className="metric-card">
        <p>Annualized Alpha</p>
        <h3>
          {metrics?.alpha_annual != null
            ? formatPercent(metrics.alpha_annual)
            : "—"}
        </h3>
        <span>Annualized excess return beyond market exposure</span>
      </article>

      <article className="metric-card">
        <p>Daily VaR (95%)</p>
        <h3>
          {metrics?.value_at_risk_95 != null
            ? formatPercent(metrics.value_at_risk_95)
            : "—"}
        </h3>
        <span>Historical daily loss threshold</span>
      </article>

      <article className="metric-card">
        <p>Expected Shortfall (95%)</p>
        <h3>
          {metrics?.expected_shortfall_95 != null
            ? formatPercent(metrics.expected_shortfall_95)
            : "—"}
        </h3>
        <span>
          Average loss in the worst 5% of historical daily returns
        </span>
      </article>
    </section>
  );
}
