import { Suspense } from "react";
import type { Dispatch, SetStateAction } from "react";

import type {
  Stock,
  PortfolioAnalyticsResponse,
  PortfolioScenarioResponse,
  HistoricalPortfolioScenarioResponse,
  PortfolioBenchmarkComparisonResponse,
  HistoricalPortfolioStressResponse,
} from "../api";

import { formatPercent } from "../utils/formatters";
import {ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

type PortfolioAsset = {
  ticker: string;
  weight: string;
};

type Period = "1M" | "3M" | "6M" | "1Y" | "ALL";

type PortfolioAnalysisPageProps = {
  stocks: Stock[];
  selectedPeriod: Period;
  setSelectedPeriod: (period: Period) => void;
  startDate?: string;
  endDate?: string;
  latestAvailableDate: string;

  portfolioAssets: PortfolioAsset[];
  portfolioInitialValue: string;
  setPortfolioInitialValue: (value: string) => void;
  portfolioRiskFreeRate: string;
  setPortfolioRiskFreeRate: (value: string) => void;
  portfolioWeightTotal: number;
  portfolioWeightsValid: boolean;
  addPortfolioAsset: (ticker: string) => void;
  updatePortfolioWeight: (ticker: string, weight: string) => void;
  removePortfolioAsset: (ticker: string) => void;

  portfolioResult: PortfolioAnalyticsResponse | null;
  setPortfolioResult: (value: PortfolioAnalyticsResponse | null) => void;
  portfolioLoading: boolean;
  portfolioError: string;
  runPortfolioAnalysis: () => void | Promise<void>;

  scenarioShocks: Record<string, string>;
  setScenarioShocks: Dispatch<SetStateAction<Record<string, string>>>;
  scenarioResult: PortfolioScenarioResponse | null;
  setScenarioResult: (value: PortfolioScenarioResponse | null) => void;
  scenarioLoading: boolean;
  scenarioError: string;
  setScenarioError: (value: string) => void;
  runScenarioAnalysis: () => void | Promise<void>;

  historicalStartDate: string;
  setHistoricalStartDate: (value: string) => void;
  historicalEndDate: string;
  setHistoricalEndDate: (value: string) => void;
  historicalResult: HistoricalPortfolioScenarioResponse | null;
  setHistoricalResult: (value: HistoricalPortfolioScenarioResponse | null) => void;
  historicalLoading: boolean;
  historicalError: string;
  setHistoricalError: (value: string) => void;
  runHistoricalBacktest: () => void | Promise<void>;

  historicalStressResult: HistoricalPortfolioStressResponse | null;
  historicalStressLoading: boolean;
  historicalStressError: string;
  runHistoricalStressTest: () => void | Promise<void>;

  portfolioBenchmarkResult: PortfolioBenchmarkComparisonResponse | null;
  portfolioBenchmarkLoading: boolean;
  portfolioBenchmarkError: string;
  runPortfolioBenchmarkComparison: () => void | Promise<void>;
};


export default function PortfolioAnalysisPage({
  stocks,
  selectedPeriod,
  setSelectedPeriod,
  startDate,
  endDate,
  latestAvailableDate,
  portfolioAssets,
  portfolioInitialValue,
  setPortfolioInitialValue,
  portfolioRiskFreeRate,
  setPortfolioRiskFreeRate,
  portfolioWeightTotal,
  portfolioWeightsValid,
  addPortfolioAsset,
  updatePortfolioWeight,
  removePortfolioAsset,
  portfolioResult,
  setPortfolioResult,
  portfolioLoading,
  portfolioError,
  runPortfolioAnalysis,
  scenarioShocks,
  setScenarioShocks,
  scenarioResult,
  setScenarioResult,
  scenarioLoading,
  scenarioError,
  setScenarioError,
  runScenarioAnalysis,
  historicalStartDate,
  setHistoricalStartDate,
  historicalEndDate,
  setHistoricalEndDate,
  historicalResult,
  setHistoricalResult,
  historicalLoading,
  historicalError,
  setHistoricalError,
  runHistoricalBacktest,
  historicalStressResult,
  historicalStressLoading,
  historicalStressError,
  runHistoricalStressTest,
  portfolioBenchmarkResult,
  portfolioBenchmarkLoading,
  portfolioBenchmarkError,
  runPortfolioBenchmarkComparison,
}: PortfolioAnalysisPageProps) {


  const isIndianPortfolio =
    portfolioAssets.length === 0 ||
    portfolioAssets.every((asset) =>
      /\.(NS|BO)$/i.test(asset.ticker.trim()),
    );

  const portfolioCurrency = isIndianPortfolio ? "INR" : "USD";

  const formatPortfolioMoney = (value: number) =>
    new Intl.NumberFormat(
      portfolioCurrency === "INR" ? "en-IN" : "en-US",
      {
        style: "currency",
        currency: portfolioCurrency,
        maximumFractionDigits: 2,
      },
    ).format(value);

  return (
    <>
      <section className="welcome-row portfolio-context-row">
                <div>
                  <h2>Portfolio research</h2>
                  <p>
                    Choose the historical window used for portfolio analytics.
                  </p>
                </div>
                <label className="stock-picker">
                  <span>ANALYSIS PERIOD</span>
                  <select
                    value={selectedPeriod}
                    onChange={(event) =>
                      setSelectedPeriod(event.target.value as Period)
                    }
                  >
                    <option value="1M">1 Month</option>
                    <option value="3M">3 Months</option>
                    <option value="6M">6 Months</option>
                    <option value="1Y">1 Year</option>
                    <option value="ALL">All Available data</option>
                  </select>
                </label>
              </section>

              <section className="panel portfolio-builder" id="portfolio">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">PORTFOLIO WORKSPACE</p>
                    <h2>Portfolio Builder</h2>
                  </div>
                  <span className="panel-tag">Daily rebalanced</span>
                </div>

                <p className="analytics-description">
                  Construct a multi-asset portfolio and measure its historical
                  performance and downside risk.
                </p>

                <div className="portfolio-settings">
                  <label className="portfolio-field">
                    <span>
                      INITIAL INVESTMENT (
                      {portfolioAssets.length === 0 ||
                      portfolioAssets.every((asset) =>
                        /\.(NS|BO)$/i.test(asset.ticker.trim())
                      )
                        ? "₹"
                        : "$"}
                      )
                    </span>
                    <input
                      type="number"
                      min="0.01"
                      step="100"
                      value={portfolioInitialValue}
                      onChange={(event) => {
                        setPortfolioInitialValue(event.target.value);
                        setPortfolioResult(null);
                      }}
                    />
                  </label>

                  <label className="portfolio-field">
                    <span>RISK-FREE RATE (%)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={portfolioRiskFreeRate}
                      onChange={(event) => {
                        setPortfolioRiskFreeRate(event.target.value);
                        setPortfolioResult(null);
                      }}
                    />
                  </label>
                </div>

                <div className="portfolio-section-heading">
                  <div>
                    <h3>Asset allocation</h3>
                    <p>Assign a target weight to each holding.</p>
                  </div>
                  <strong
                    className={
                      portfolioWeightsValid
                        ? "weight-total weight-total--valid"
                        : "weight-total"
                    }
                  >
                    {portfolioWeightTotal.toFixed(2)}%
                  </strong>
                </div>

                <div className="portfolio-asset-list">
                  {portfolioAssets.map((asset) => (
                    <div className="portfolio-asset-row" key={asset.ticker}>
                      <div className="portfolio-asset-name">
                        <span className="portfolio-asset-symbol">
                          {asset.ticker.slice(0, 1)}
                        </span>
                        <div>
                          <strong>{asset.ticker}</strong>
                          <span>Portfolio holding</span>
                        </div>
                      </div>

                      <label className="portfolio-weight-input">
                        <span className="sr-only">
                          Weight percentage for {asset.ticker}
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={asset.weight}
                          onChange={(event) =>
                            updatePortfolioWeight(
                              asset.ticker,
                              event.target.value,
                            )
                          }
                          aria-label={`${asset.ticker} weight percentage`}
                        />
                        <span>%</span>
                      </label>

                      <button
                        type="button"
                        className="portfolio-remove-button"
                        onClick={() => removePortfolioAsset(asset.ticker)}
                        aria-label={`Remove ${asset.ticker}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div className="portfolio-add-row">
                  <label className="portfolio-field portfolio-add-field">
                    <span>ADD AN ASSET</span>
                    <select
                      value=""
                      onChange={(event) => addPortfolioAsset(event.target.value)}
                    >
                      <option value="">Choose available stockâ€¦</option>
                      {stocks
                        .filter(
                          (stock) =>
                            !portfolioAssets.some(
                              (asset) => asset.ticker === stock.ticker,
                            ),
                        )
                        .map((stock) => (
                          <option key={stock.ticker} value={stock.ticker}>
                            {stock.ticker}
                            {stock.name ? ` â€” ${stock.name}` : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <div
                  className={`portfolio-weight-status ${
                    portfolioWeightsValid ? "is-valid" : "is-invalid"
                  }`}
                  role="status"
                >
                  {portfolioWeightsValid
                    ? "Allocation complete — weights total 100%."
                    : `Allocation incomplete — adjust weights to reach 100%. Current total: ${portfolioWeightTotal.toFixed(2)}%.`}
                </div>

                <div className="portfolio-run-row">
                  <p>
                    Period: {startDate ?? "Earliest available"} to{" "}
                    {endDate ?? latestAvailableDate}
                  </p>
                  <button
                    type="button"
                    className="portfolio-run-button"
                    disabled={
                      portfolioLoading ||
                      !portfolioWeightsValid ||
                      !latestAvailableDate
                    }
                    onClick={() => void runPortfolioAnalysis()}
                  >
                    {portfolioLoading ? "Analysingâ€¦" : "Run portfolio analysis"}
                  </button>
                </div>

                {portfolioError && (
                  <div className="error-notice" role="alert">
                    {portfolioError}
                  </div>
                )}

                {portfolioResult && (
                  <div className="portfolio-results">
                    <div className="portfolio-results-heading">
                      <div>
                        <p className="eyebrow">ANALYSIS RESULTS</p>
                        <h3>Your portfolio performance</h3>
                      </div>
                      <span className="panel-tag">
                        {portfolioResult.shared_trading_dates} observations
                      </span>
                    </div>

                    <div className="portfolio-metrics-grid">
                      <article className="portfolio-metric">
                        <span>Final value</span>
                        <strong>
                          {formatPortfolioMoney(portfolioResult.final_value)}
                        </strong>
                        <small>
                          Initial: {formatPortfolioMoney(portfolioResult.initial_value)}
                        </small>
                      </article>

                      <article className="portfolio-metric">
                        <span>Total return</span>
                        <strong
                          className={
                            portfolioResult.total_return >= 0
                              ? "portfolio-positive"
                              : "portfolio-negative"
                          }
                        >
                          {formatPercent(portfolioResult.total_return)}
                        </strong>
                        <small>Historical period return</small>
                      </article>

                      <article className="portfolio-metric">
                        <span>Annualized volatility</span>
                        <strong>
                          {formatPercent(portfolioResult.annualized_volatility)}
                        </strong>
                        <small>Annualized daily-return volatility</small>
                      </article>

                      <article className="portfolio-metric">
                        <span>Sharpe ratio</span>
                        <strong>
                          {portfolioResult.sharpe_ratio == null
                            ? "N/A"
                            : portfolioResult.sharpe_ratio.toFixed(2)}
                        </strong>
                        <small>At selected risk-free rate</small>
                      </article>

                      <article className="portfolio-metric">
                        <span>Maximum drawdown</span>
                        <strong className="portfolio-negative">
                          {formatPercent(portfolioResult.maximum_drawdown)}
                        </strong>
                        <small>
                          Trough: {portfolioResult.maximum_drawdown_date}
                        </small>
                      </article>

                      <article className="portfolio-metric">
                        <span>Profit / loss</span>
                        <strong
                          className={
                            portfolioResult.final_value >=
                            portfolioResult.initial_value
                              ? "portfolio-positive"
                              : "portfolio-negative"
                          }
                        >
                          {formatPortfolioMoney(
                            portfolioResult.final_value -
                              portfolioResult.initial_value,
                          )}
                        </strong>
                        <small>Before fees and taxes</small>
                      </article>
                    </div>

                    <div className="portfolio-chart-heading">
                      <h3>Portfolio value over time</h3>
                      <span>
                        {portfolioResult.start_date} â€”{" "}
                        {portfolioResult.end_date}
                      </span>
                    </div>

                    <div className="advanced-chart portfolio-value-chart">
                      <Suspense
                        fallback={<p className="chart-state">Loading chartâ€¦</p>}
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={portfolioResult.series}
                            margin={{ top: 12, right: 18, left: 8, bottom: 8 }}
                          >
                            <CartesianGrid
                              stroke="#263243"
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="date"
                              tickFormatter={(date: string) => date.slice(5)}
                              minTickGap={35}
                              tick={{ fill: "#93a1b6", fontSize: 11 }}
                              axisLine={{ stroke: "#334153" }}
                              tickLine={false}
                            />
                            <YAxis
                              width={78}
                              tickFormatter={(value: number) => formatPortfolioMoney(value)}
                              tick={{ fill: "#93a1b6", fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#111b28",
                                border: "1px solid #334153",
                                borderRadius: 8,
                                color: "#e8edf6",
                              }}
                              labelStyle={{ color: "#a5f3cf" }}
                              labelFormatter={(label) => `Date: ${label}`}
                              formatter={(value) => [
                                typeof value === "number"
                                  ? formatPortfolioMoney(value)
                                  : value,
                                "Portfolio value",
                              ]}
                            />
                            <Line
                              type="monotone"
                              dataKey="portfolio_value"
                              name="Portfolio value"
                              stroke="#a5f3cf"
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </Suspense>
                    </div>

                    <div className="portfolio-assumptions">
                      <strong>Model assumptions</strong>
                      <p>
                        Daily rebalancing to target weights; equal shared trading
                        dates; no transaction costs, taxes, or slippage. Results
                        describe historical performance and do not predict future
                        returns.
                      </p>
                    </div>
                  </div>
                )}
              </section>

              {portfolioResult && (
                <section
                  className="panel risk-decomposition-panel"
                  id="risk-decomposition"
                >
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">PORTFOLIO RISK ENGINE</p>
                      <h2>Risk Decomposition</h2>
                    </div>
                    <span className="panel-tag">Historical analysis</span>
                  </div>

                  <p className="analytics-description">
                    Understand how your portfolio is allocated, how its assets
                    move together, and how each holding contributes to overall
                    volatility.
                  </p>

                  <div className="risk-summary-grid">
                    <article className="risk-summary-card">
                      <span>Concentration index (HHI)</span>
                      <strong>
                        {portfolioResult.concentration.herfindahl_hirschman_index.toFixed(
                          3,
                        )}
                      </strong>
                      <small>
                        Lower generally means more evenly distributed weights.
                      </small>
                    </article>

                    <article className="risk-summary-card">
                      <span>Effective holdings</span>
                      <strong>
                        {portfolioResult.concentration
                          .effective_number_of_holdings == null
                          ? "N/A"
                          : portfolioResult.concentration.effective_number_of_holdings.toFixed(
                              2,
                            )}
                      </strong>
                      <small>
                        Number of equally weighted holdings with equivalent
                        concentration.
                      </small>
                    </article>

                    <article className="risk-summary-card">
                      <span>Covariance-based volatility</span>
                      <strong>
                        {formatPercent(
                          portfolioResult.annualized_covariance_volatility,
                        )}
                      </strong>
                      <small>
                        Annualized estimate from historical asset return
                        covariance.
                      </small>
                    </article>
                  </div>

                  <div className="risk-section">
                    <div className="risk-section-heading">
                      <div>
                        <h3>Asset correlation matrix</h3>
                        <p>
                          Historical daily-return correlations over the selected
                          period.
                        </p>
                      </div>
                    </div>

                    <div className="correlation-table-wrap">
                      <table className="correlation-table">
                        <thead>
                          <tr>
                            <th>Asset</th>
                            {Object.keys(portfolioResult.correlation_matrix).map(
                              (ticker) => (
                                <th key={ticker}>{ticker}</th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(portfolioResult.correlation_matrix).map(
                            ([ticker, correlations]) => (
                              <tr key={ticker}>
                                <th scope="row">{ticker}</th>
                                {Object.keys(
                                  portfolioResult.correlation_matrix,
                                ).map((otherTicker) => {
                                  const value = correlations[otherTicker];
                                  const tone =
                                    value == null
                                      ? "correlation-unknown"
                                      : value >= 0.7
                                        ? "correlation-high-positive"
                                        : value >= 0.2
                                          ? "correlation-positive"
                                          : value <= -0.7
                                            ? "correlation-high-negative"
                                            : value <= -0.2
                                              ? "correlation-negative"
                                              : "correlation-neutral";

                                  return (
                                    <td
                                      key={otherTicker}
                                      className={`correlation-cell ${tone}`}
                                    >
                                      {value == null ? "N/A" : value.toFixed(2)}
                                    </td>
                                  );
                                })}
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="correlation-legend">
                      <span>
                        <i className="legend-dot legend-positive" /> Positive
                      </span>
                      <span>
                        <i className="legend-dot legend-neutral" /> Weak / near
                        zero
                      </span>
                      <span>
                        <i className="legend-dot legend-negative" /> Negative
                      </span>
                    </div>

                    <p className="risk-explanation">
                      Correlation ranges from -1 to +1. Values near +1 indicate
                      assets that historically moved together; values near -1
                      indicate opposite movement. Correlation alone does not
                      guarantee diversification during market stress.
                    </p>
                  </div>

                  <div className="risk-section">
                    <div className="risk-section-heading">
                      <div>
                        <h3>Who contributes to portfolio risk?</h3>
                        <p>
                          Compare target portfolio weights with each holding's
                          contribution to annualized portfolio volatility.
                        </p>
                      </div>
                    </div>

                    <div className="risk-contribution-list">
                      {Object.entries(
                        portfolioResult.asset_risk_contributions,
                      ).map(([ticker, contribution]) => {
                        const percentage = contribution.risk_contribution_percent;
                        const magnitude = Math.min(
                          Math.abs(percentage ?? 0),
                          100,
                        );

                        return (
                          <article className="risk-contribution-row" key={ticker}>
                            <div className="risk-contribution-title">
                              <strong>{ticker}</strong>
                              <span>
                                Portfolio weight:{" "}
                                {formatPercent(contribution.weight)}
                              </span>
                            </div>

                            <div className="risk-contribution-track">
                              <div
                                className={`risk-contribution-bar ${
                                  (percentage ?? 0) < 0
                                    ? "risk-contribution-bar--negative"
                                    : "risk-contribution-bar--positive"
                                }`}
                                style={{ width: `${magnitude}%` }}
                              />
                            </div>

                            <div className="risk-contribution-values">
                              <span>Volatility contribution</span>
                              <strong>
                                {percentage == null
                                  ? "N/A"
                                  : `${percentage.toFixed(2)}%`}
                              </strong>
                            </div>

                            <p className="risk-contribution-detail">
                              Annualized contribution:{" "}
                              {formatPercent(
                                contribution.annualized_volatility_contribution,
                              )}
                            </p>
                          </article>
                        );
                      })}
                    </div>

                    <p className="risk-explanation">
                      Risk contribution percentages sum to approximately 100% when
                      portfolio volatility is nonzero. A negative contribution
                      means an asset reduces total portfolio volatility under the
                      estimated covariance model.
                    </p>
                  </div>

                  <div className="portfolio-assumptions">
                    <strong>Interpretation and limitations</strong>
                    <p>
                      These measures use historical daily returns over shared
                      trading dates. Correlations and risk contributions can
                      change over time. HHI measures weight concentration, not the
                      underlying similarity or business exposure of holdings. This
                      analysis is informational and does not predict future
                      performance.
                    </p>
                  </div>
                </section>
              )}

              <section
                className="panel portfolio-benchmark-panel"
                id="portfolio-benchmark"
              >
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">RELATIVE PERFORMANCE</p>
                    <h2>
                      Portfolio vs.{" "}
                      {portfolioAssets.length > 0 &&
                      portfolioAssets.every((asset) =>
                        /\.(NS|BO)$/i.test(asset.ticker.trim())
                      )
                        ? "NIFTY 50"
                        : "S&P 500"}
                    </h2>
                    <p>
                      Compare your portfolio with the market over the same
                      historical period and starting investment.
                    </p>
                  </div>
                  <span className="panel-tag">Buy and hold</span>
                </div>

                <div className="portfolio-benchmark-context">
                  <span>
                    Period: {historicalStartDate || "â€”"} to{" "}
                    {historicalEndDate || "â€”"}
                  </span>
                  <span>
                    Starting investment:{" "}
                    {formatPortfolioMoney(Number(portfolioInitialValue))}
                  </span>
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={runPortfolioBenchmarkComparison}
                  disabled={
                    portfolioBenchmarkLoading ||
                    portfolioAssets.length === 0 ||
                    !portfolioWeightsValid
                  }
                >
                  {portfolioBenchmarkLoading
                    ? "Comparing performanceâ€¦"
                    : `Compare with ${portfolioBenchmarkResult?.benchmark_name ?? "Benchmark"}`}
                </button>

                {portfolioBenchmarkError && (
                  <p className="error-message" role="alert">
                    {portfolioBenchmarkError}
                  </p>
                )}

                {portfolioBenchmarkResult && (
                  <div className="portfolio-benchmark-results">
                    <div className="portfolio-benchmark-grid">
                      <article className="portfolio-benchmark-metric">
                        <span>Portfolio return</span>
                        <strong
                          className={
                            portfolioBenchmarkResult.portfolio.return >= 0
                              ? "positive-value"
                              : "negative-value"
                          }
                        >
                          {formatPercent(
                            portfolioBenchmarkResult.portfolio.return,
                          )}
                        </strong>
                        <small>
                          Ending value:{" "}
                          {formatPortfolioMoney(
                            portfolioBenchmarkResult.portfolio.final_value,
                          )}
                        </small>
                      </article>

                      <article className="portfolio-benchmark-metric">
                        <span>
                          {portfolioBenchmarkResult.benchmark_name} return
                        </span>
                        <strong
                          className={
                            portfolioBenchmarkResult.benchmark.return >= 0
                              ? "positive-value"
                              : "negative-value"
                          }
                        >
                          {formatPercent(
                            portfolioBenchmarkResult.benchmark.return,
                          )}
                        </strong>
                        <small>
                          Ending value:{" "}
                          {formatPortfolioMoney(
                            portfolioBenchmarkResult.benchmark.final_value,
                          )}
                        </small>
                      </article>

                      <article className="portfolio-benchmark-metric">
                        <span>Excess return</span>
                        <strong
                          className={
                            portfolioBenchmarkResult.excess_return >= 0
                              ? "positive-value"
                              : "negative-value"
                          }
                        >
                          {portfolioBenchmarkResult.excess_return > 0 ? "+" : ""}
                          {formatPercent(portfolioBenchmarkResult.excess_return)}
                        </strong>
                        <small>
                          {portfolioBenchmarkResult.excess_return > 0
                            ? "Portfolio outperformed the benchmark"
                            : portfolioBenchmarkResult.excess_return < 0
                              ? "Portfolio underperformed the benchmark"
                              : "Portfolio matched the benchmark"}
                        </small>
                      </article>

                      <article className="portfolio-benchmark-metric">
                        <span>Ending-value difference</span>
                        <strong
                          className={
                            portfolioBenchmarkResult.ending_value_difference >= 0
                              ? "positive-value"
                              : "negative-value"
                          }
                        >
                          {portfolioBenchmarkResult.ending_value_difference > 0
                            ? "+"
                            : ""}
                          {formatPortfolioMoney(
                            portfolioBenchmarkResult.ending_value_difference,
                          )}
                        </strong>
                        <small>Portfolio value minus benchmark value</small>
                      </article>
                    </div>

                    <div className="portfolio-benchmark-summary">
                      <h3>What does this mean?</h3>
                      <p>
                        {portfolioBenchmarkResult.excess_return > 0
                          ? `Your portfolio returned ${formatPercent(
                              portfolioBenchmarkResult.excess_return,
                            )} more than the ${portfolioBenchmarkResult.benchmark_name} over this period.`
                          : portfolioBenchmarkResult.excess_return < 0
                            ? `Your portfolio returned ${formatPercent(
                                Math.abs(portfolioBenchmarkResult.excess_return),
                              )}less than the ${portfolioBenchmarkResult.benchmark_name} over this period.`
                            : `Your portfolio and the ${portfolioBenchmarkResult.benchmark_name} had the same holding-period return.`}
                      </p>
                      <p>
                        Comparison dates: {portfolioBenchmarkResult.start_date} to{" "}
                        {portfolioBenchmarkResult.end_date}. Shared trading dates:{" "}
                        {portfolioBenchmarkResult.shared_trading_dates}.
                      </p>
                    </div>

                    <div className="portfolio-benchmark-assumptions">
                      <h3>Method and assumptions</h3>
                      <ul>
                        {portfolioBenchmarkResult.assumptions.map(
                          (assumption) => (
                            <li key={assumption}>{assumption}</li>
                          ),
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </section>

              <section
                className="panel historical-stress-panel"
                id="historical-stress"
              >
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">PORTFOLIO RISK</p>
                    <h2>Historical Stress Testing</h2>
                    <p>
                      Analyze portfolio losses, drawdowns, and recovery during a
                      selected historical period.
                    </p>
                  </div>
                </div>

                <p className="historical-stress-period">
                  Period: {historicalStartDate || "â€”"} to{" "}
                  {historicalEndDate || "â€”"}
                </p>

                <button
                  type="button"
                  className="primary-button"
                  onClick={runHistoricalStressTest}
                  disabled={
                    historicalStressLoading ||
                    portfolioAssets.length === 0 ||
                    !portfolioWeightsValid
                  }
                >
                  {historicalStressLoading
                    ? "Analyzing historical periodâ€¦"
                    : "Run Historical Stress Test"}
                </button>

                {historicalStressError && (
                  <p className="error-message" role="alert">
                    {historicalStressError}
                  </p>
                )}

                {historicalStressResult && (
                  <div className="historical-stress-results">
                    <div className="historical-stress-grid">
                      <article className="historical-stress-metric">
                        <span>Period return</span>
                        <strong>
                          {formatPercent(
                            historicalStressResult.historical_return,
                          )}
                        </strong>
                        <small>
                          P&amp;L:{" "}
                          {formatPortfolioMoney(historicalStressResult.estimated_pnl)}
                        </small>
                      </article>

                      <article className="historical-stress-metric">
                        <span>Maximum drawdown</span>
                        <strong>
                          {formatPercent(historicalStressResult.maximum_drawdown)}
                        </strong>
                        <small>
                          Trough date:{" "}
                          {historicalStressResult.maximum_drawdown_date}
                        </small>
                      </article>

                      <article className="historical-stress-metric">
                        <span>Ending portfolio value</span>
                        <strong>
                          {formatPortfolioMoney(historicalStressResult.final_value)}
                        </strong>
                        <small>
                          Starting value:{" "}
                          {formatPortfolioMoney(historicalStressResult.initial_value)}
                        </small>
                      </article>

                      <article className="historical-stress-metric">
                        <span>Recovery status</span>
                        <strong>
                          {historicalStressResult.recovered_within_period
                            ? "Recovered"
                            : "Not recovered"}
                        </strong>
                        <small>
                          {historicalStressResult.recovery_date
                            ? `Recovery date: ${historicalStressResult.recovery_date}`
                            : "No recovery observed within the selected period"}
                        </small>
                      </article>
                    </div>

                    <div className="historical-stress-breakdown">
                      <h3>Asset-level impact</h3>
                      <div className="historical-stress-table-wrap">
                        <table className="historical-stress-table">
                          <thead>
                            <tr>
                              <th>Holding</th>
                              <th>Weight</th>
                              <th>Asset return</th>
                              <th>P&amp;L impact</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historicalStressResult.asset_impacts.map((asset) => (
                              <tr key={asset.ticker}>
                                <td>{asset.ticker}</td>
                                <td>{formatPercent(asset.weight)}</td>
                                <td>{formatPercent(asset.historical_return)}</td>
                                <td>{formatPortfolioMoney(asset.pnl_impact)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="historical-stress-assumptions">
                      <h3>Assumptions and limitations</h3>
                      <p>
                        {historicalStressResult.shared_trading_dates} shared
                        trading dates. The portfolio is buy-and-hold with no
                        rebalancing.
                      </p>
                      <ul>
                        {historicalStressResult.assumptions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </section>

              <section className="panel scenario-panel" id="scenario-analysis">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">WHAT-IF ANALYSIS</p>
                    <h2>Scenario Analysis</h2>
                  </div>
                  <span className="panel-tag">Hypothetical shocks</span>
                </div>

                <p className="analytics-description">
                  Apply a hypothetical gain or loss to each holding and calculate
                  its immediate impact on your portfolio.
                </p>

                <div className="scenario-input-list">
                  {portfolioAssets.map((asset) => (
                    <div className="scenario-input-row" key={asset.ticker}>
                      <div className="scenario-asset">
                        <strong>{asset.ticker}</strong>
                        <span>Weight: {asset.weight}%</span>
                      </div>

                      <label className="scenario-shock-field">
                        <span>Hypothetical change (%)</span>
                        <input
                          type="number"
                          min="-100"
                          step="1"
                          value={scenarioShocks[asset.ticker] ?? "-10"}
                          onChange={(event) => {
                            setScenarioShocks((current) => ({
                              ...current,
                              [asset.ticker]: event.target.value,
                            }));
                            setScenarioResult(null);
                            setScenarioError("");
                          }}
                          aria-label={`${asset.ticker} hypothetical percentage change`}
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <div className="scenario-actions">
                  <p>
                    Investment amount:{" "}
                    {formatPortfolioMoney(Number(portfolioInitialValue) || 0)}
                  </p>
                  <button
                    type="button"
                    className="portfolio-run-button"
                    disabled={
                      scenarioLoading ||
                      !portfolioWeightsValid ||
                      portfolioAssets.length === 0
                    }
                    onClick={() => void runScenarioAnalysis()}
                  >
                    {scenarioLoading ? "Calculatingâ€¦" : "Run stress scenario"}
                  </button>
                </div>

                {scenarioError && (
                  <div className="error-notice" role="alert">
                    {scenarioError}
                  </div>
                )}

                {scenarioResult && (
                  <div className="scenario-results">
                    <div className="scenario-results-heading">
                      <div>
                        <p className="eyebrow">SCENARIO RESULTS</p>
                        <h3>Estimated portfolio impact</h3>
                      </div>
                      <span className="panel-tag">Instantaneous shock</span>
                    </div>

                    <div className="scenario-metrics-grid">
                      <article className="scenario-metric">
                        <span>Scenario return</span>
                        <strong
                          className={
                            scenarioResult.portfolio_shock_return >= 0
                              ? "portfolio-positive"
                              : "portfolio-negative"
                          }
                        >
                          {formatPercent(scenarioResult.portfolio_shock_return)}
                        </strong>
                      </article>

                      <article className="scenario-metric">
                        <span>Estimated P&amp;L</span>
                        <strong
                          className={
                            scenarioResult.estimated_pnl >= 0
                              ? "portfolio-positive"
                              : "portfolio-negative"
                          }
                        >
                          {formatPortfolioMoney(scenarioResult.estimated_pnl)}
                        </strong>
                      </article>

                      <article className="scenario-metric">
                        <span>Post-shock value</span>
                        <strong>{formatPortfolioMoney(scenarioResult.final_value)}</strong>
                      </article>
                    </div>

                    <div className="risk-section">
                      <div className="risk-section-heading">
                        <div>
                          <h3>Impact by holding</h3>
                          <p>
                            How each hypothetical shock contributes to portfolio
                            P&amp;L.
                          </p>
                        </div>
                      </div>

                      <div className="scenario-impact-list">
                        {Object.entries(scenarioResult.asset_impacts).map(
                          ([ticker, impact]) => (
                            <div className="scenario-impact-row" key={ticker}>
                              <div>
                                <strong>{ticker}</strong>
                                <span>
                                  {formatPercent(impact.shock_return)} shock Â·{" "}
                                  {formatPercent(impact.weight)} weight
                                </span>
                              </div>
                              <strong
                                className={
                                  impact.pnl_impact >= 0
                                    ? "portfolio-positive"
                                    : "portfolio-negative"
                                }
                              >
                                {formatPortfolioMoney(impact.pnl_impact)}
                              </strong>
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    <div className="portfolio-assumptions">
                      <strong>Scenario assumptions</strong>
                      <p>
                        The calculation applies the entered returns to current
                        portfolio weights as a single instantaneous shock. It
                        assumes no rebalancing, fees, taxes, slippage, or
                        secondary market effects. It is a hypothetical sensitivity
                        analysis, not a forecast.
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <section
                className="panel historical-backtest-panel"
                id="historical-backtest"
              >
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">HISTORICAL PERFORMANCE TEST</p>
                    <h2>Historical Backtesting</h2>
                  </div>
                  <span className="panel-tag">Buy and hold</span>
                </div>

                <p className="analytics-description">
                  Measure how your current portfolio allocation would have
                  performed over a selected historical period, without
                  rebalancing.
                </p>

                <div className="historical-date-grid">
                  <label className="portfolio-field">
                    <span>START DATE</span>
                    <input
                      type="date"
                      value={historicalStartDate}
                      max={historicalEndDate || latestAvailableDate}
                      onChange={(event) => {
                        setHistoricalStartDate(event.target.value);
                        setHistoricalResult(null);
                        setHistoricalError("");
                      }}
                    />
                  </label>

                  <label className="portfolio-field">
                    <span>END DATE</span>
                    <input
                      type="date"
                      value={historicalEndDate}
                      min={historicalStartDate || undefined}
                      max={latestAvailableDate || undefined}
                      onChange={(event) => {
                        setHistoricalEndDate(event.target.value);
                        setHistoricalResult(null);
                        setHistoricalError("");
                      }}
                    />
                  </label>
                </div>

                <div className="scenario-actions">
                  <p>
                    Starting investment:{" "}
                    {formatPortfolioMoney(Number(portfolioInitialValue) || 0)}
                  </p>

                  <button
                    type="button"
                    className="portfolio-run-button"
                    disabled={
                      historicalLoading ||
                      !portfolioWeightsValid ||
                      portfolioAssets.length === 0 ||
                      !historicalStartDate ||
                      !historicalEndDate ||
                      !latestAvailableDate
                    }
                    onClick={() => void runHistoricalBacktest()}
                  >
                    {historicalLoading
                      ? "Backtestingâ€¦"
                      : "Run historical backtest"}
                  </button>
                </div>

                {historicalError && (
                  <div className="error-notice" role="alert">
                    {historicalError}
                  </div>
                )}

                {historicalResult && (
                  <div className="historical-results">
                    <div className="scenario-results-heading">
                      <div>
                        <p className="eyebrow">BACKTEST RESULTS</p>
                        <h3>Historical portfolio outcome</h3>
                      </div>
                      <span className="panel-tag">
                        {historicalResult.shared_trading_dates} shared dates
                      </span>
                    </div>

                    <div className="scenario-metrics-grid">
                      <article className="scenario-metric">
                        <span>Historical return</span>
                        <strong
                          className={
                            historicalResult.historical_return >= 0
                              ? "portfolio-positive"
                              : "portfolio-negative"
                          }
                        >
                          {formatPercent(historicalResult.historical_return)}
                        </strong>
                      </article>

                      <article className="scenario-metric">
                        <span>Estimated P&amp;L</span>
                        <strong
                          className={
                            historicalResult.estimated_pnl >= 0
                              ? "portfolio-positive"
                              : "portfolio-negative"
                          }
                        >
                          {formatPortfolioMoney(historicalResult.estimated_pnl)}
                        </strong>
                      </article>

                      <article className="scenario-metric">
                        <span>Ending value</span>
                        <strong>
                          {formatPortfolioMoney(historicalResult.final_value)}
                        </strong>
                      </article>
                    </div>

                    <div className="historical-period-summary">
                      <div>
                        <span>Requested period</span>
                        <strong>
                          {historicalResult.requested_start_date} â€“{" "}
                          {historicalResult.requested_end_date}
                        </strong>
                      </div>
                      <div>
                        <span>Actual price period</span>
                        <strong>
                          {historicalResult.actual_start_date} â€“{" "}
                          {historicalResult.actual_end_date}
                        </strong>
                      </div>
                    </div>

                    <div className="risk-section">
                      <div className="risk-section-heading">
                        <div>
                          <h3>Contribution by holding</h3>
                          <p>
                            Each holding's contribution to the total historical
                            portfolio return and estimated profit or loss.
                          </p>
                        </div>
                      </div>

                      <div className="scenario-impact-list">
                        {Object.entries(historicalResult.asset_impacts).map(
                          ([ticker, impact]) => (
                            <div className="scenario-impact-row" key={ticker}>
                              <div>
                                <strong>{ticker}</strong>
                                <span>
                                  Weight: {formatPercent(impact.weight)} Â·
                                  Return:{" "}
                                  {formatPercent(impact.historical_return)}
                                </span>
                                <span>
                                  Price: {impact.start_price.toFixed(2)} â†’{" "}
                                  {impact.end_price.toFixed(2)}
                                </span>
                              </div>

                              <div className="historical-impact-values">
                                <strong
                                  className={
                                    impact.pnl_impact >= 0
                                      ? "portfolio-positive"
                                      : "portfolio-negative"
                                  }
                                >
                                  {formatPortfolioMoney(impact.pnl_impact)}
                                </strong>
                                <span>
                                  Portfolio return contribution:{" "}
                                  {formatPercent(
                                    impact.portfolio_return_contribution,
                                  )}
                                </span>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    <div className="portfolio-assumptions">
                      <strong>Model assumptions and limitations</strong>
                      <ul>
                        {historicalResult.assumptions.map((assumption, index) => (
                          <li key={`${index}-${assumption}`}>{assumption}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </section>
    </>
  );
}
