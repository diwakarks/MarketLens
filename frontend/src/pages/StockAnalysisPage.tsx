import { Suspense } from "react";
import StockSearch from "../StockSearch";
import MetricGrid from "../components/dashboard/MetricGrid";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type {
  Stock,
  StockMetrics,
  DailyPrice,
  AnalyticsPoint,
  BenchmarkPoint,
  DrawdownRecoveryResponse,
  MarketInsightsResponse,
  BenchmarkComparisonResponse,
} from "../api";
import { formatPrice, formatPercent } from "../utils/formatters";

type Period = "1M" | "3M" | "6M" | "1Y" | "ALL";

type StockAnalysisPageProps = {
  stocks: Stock[];
  selectedStock: string;
  selectedPeriod: Period;
  setSelectedStock: (ticker: string) => void;
  setSelectedPeriod: (period: Period) => void;
  loadStocks: () => Promise<void>;
  stocksLoading: boolean;
  stocksError: string;
  metrics: StockMetrics | null;
  metricsBenchmarkName: string;
  metricsLoading: boolean;
  metricsError: string;
  currency: string;
  history: DailyPrice[];
  historyLoading: boolean;
  historyError: string;
  analyticsSeries: AnalyticsPoint[];
  analyticsLoading: boolean;
  analyticsError: string;
  benchmarkSeries: BenchmarkPoint[];
  benchmarkComparison: BenchmarkComparisonResponse | null;
  benchmarkLoading: boolean;
  benchmarkError: string;
  drawdownRecovery: DrawdownRecoveryResponse | null;
  drawdownRecoveryLoading: boolean;
  drawdownRecoveryError: string;
  marketInsights: MarketInsightsResponse | null;
  marketInsightsLoading: boolean;
  marketInsightsError: string;
};



export default function StockAnalysisPage({
  stocks,
  selectedStock,
  selectedPeriod,
  setSelectedStock,
  setSelectedPeriod,
  loadStocks,
  stocksLoading,
  stocksError,
  metrics,
  metricsBenchmarkName,
  metricsLoading,
  metricsError,
  currency,
  history,
  historyLoading,
  historyError,
  analyticsSeries,
  analyticsLoading,
  analyticsError,
  benchmarkSeries,
  benchmarkComparison,
  benchmarkLoading,
  benchmarkError,
  drawdownRecovery,
  drawdownRecoveryLoading,
  drawdownRecoveryError,
  marketInsights,
  marketInsightsLoading,
  marketInsightsError,
}: StockAnalysisPageProps) {
  return (
    <>
<>
            <StockSearch
              onStockImported={async (ticker) => {
                await loadStocks();
                setSelectedStock(ticker);
              }}
            />

            <section className="welcome-row">
              <div>
                <h2>Understand the market.</h2>
                <p>
                  Explore historical performance and quantify investment risk.
                </p>
              </div>
              <label className="stock-picker">
                <span>SELECT ASSET</span>
                <select
                  value={selectedStock}
                  onChange={(event) => setSelectedStock(event.target.value)}
                  disabled={stocksLoading || stocks.length === 0}
                >
                  {stocks.length === 0 && (
                    <option value="">No stocks available</option>
                  )}
                  {stocks.map((stock) => (
                    <option key={stock.ticker} value={stock.ticker}>
                      {stock.ticker}
                    </option>
                  ))}
                </select>
              </label>
              <label className="stock-picker">
                <span>DATE RANGE</span>
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
          </>

<>
            {stocksLoading && (
              <div className="preview-notice" role="status">
                Loading registered stocks from the APIâ€¦
              </div>
            )}
            {stocksError && (
              <div className="error-notice" role="alert">
                Unable to load stocks: {stocksError}
              </div>
            )}
            {metricsLoading && (
              <div className="preview-notice" role="status">
                Loading {selectedStock} metrics from PostgreSQLâ€¦
              </div>
            )}
            {metricsError && (
              <div className="error-notice" role="alert">
                Unable to load {selectedStock} metrics: {metricsError}
              </div>
            )}
            {!metricsLoading && !metricsError && metrics && (
              <div className="preview-notice">
                <span>i</span> Showing {metrics.observations} daily observations
                for <strong>{selectedStock}</strong>, from {metrics.start_date}{" "}
                to {metrics.end_date}.
              </div>
            )}
          </>

<>
            <MetricGrid
              metrics={metrics}
              currency={currency}
              benchmarkName={metricsBenchmarkName}
            />

            <section className="analysis-grid" id="performance">
              <article className="panel performance-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">PRICE HISTORY</p>
                    <h2>Historical performance</h2>
                  </div>
                  <span className="panel-tag">
                    {selectedStock || "â€”"} Â· {selectedPeriod}
                  </span>
                </div>
                <div className="chart-container">
                  {historyLoading && (
                    <p className="chart-state" role="status">
                      Loading historical pricesâ€¦
                    </p>
                  )}
                  {!historyLoading && historyError && (
                    <p className="chart-state chart-error" role="alert">
                      Could not load price history: {historyError}
                    </p>
                  )}
                  {!historyLoading && !historyError && history.length === 0 && (
                    <p className="chart-state">
                      No historical prices are available.
                    </p>
                  )}
                  {!historyLoading && !historyError && history.length > 0 && (
                    <Suspense
                      fallback={<p className="chart-state">Loading chartâ€¦</p>}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={history}
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
                            domain={["auto", "auto"]}
                            width={65}
                            tickFormatter={(price: number) =>
                              `$${price.toFixed(0)}`
                            }
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
                                ? formatPrice(value, currency)
                                : value,
                              "Closing price",
                            ]}
                          />
                          <Line
                            type="monotone"
                            dataKey="Close"
                            name="Closing price"
                            stroke="#a5f3cf"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{
                              r: 5,
                              fill: "#a5f3cf",
                              stroke: "#0d141f",
                            }}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Suspense>
                  )}
                </div>
              </article>

              <article className="panel risk-panel" id="risk">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">DOWNSIDE RISK</p>
                    <h2>Risk snapshot</h2>
                  </div>
                </div>
                <div className="risk-row">
                  <div>
                    <span>Maximum drawdown</span>
                    <p>Largest peak-to-trough decline</p>
                  </div>
                  <strong>
                    {metrics ? formatPercent(metrics.maximum_drawdown) : "â€”"}
                  </strong>
                </div>
                <div className="risk-row">
                  <div>
                    <span>Annualized volatility</span>
                    <p>Dispersion of daily returns</p>
                  </div>
                  <strong>
                    {metrics
                      ? formatPercent(metrics.annualized_volatility)
                      : "â€”"}
                  </strong>
                </div>
                <div className="risk-note">
                  <strong>Why this matters</strong>
                  <p>
                    Returns describe performance. Risk metrics help put that
                    performance into context.
                  </p>
                </div>
              </article>
            </section>

            <section className="analytics-grid" aria-label="Advanced analytics">
              {analyticsLoading && (
                <div className="panel analytics-panel" role="status">
                  Loading cumulative returns and drawdownâ€¦
                </div>
              )}
              {!analyticsLoading && analyticsError && (
                <div className="panel analytics-panel chart-error" role="alert">
                  Unable to load advanced analytics: {analyticsError}
                </div>
              )}
              {!analyticsLoading &&
                !analyticsError &&
                analyticsSeries.length > 0 && (
                  <>
                    <article className="panel analytics-panel">
                      <div className="panel-heading">
                        <div>
                          <p className="eyebrow">PERFORMANCE</p>
                          <h2>Cumulative returns</h2>
                        </div>
                        <span className="panel-tag">
                          {selectedStock} Â· {selectedPeriod}
                        </span>
                      </div>
                      <p className="analytics-description">
                        Percentage change from the first observed closing price.
                      </p>
                      <div className="advanced-chart">
                        <Suspense
                          fallback={
                            <p className="chart-state">Loading chartâ€¦</p>
                          }
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={analyticsSeries}
                              margin={{
                                top: 12,
                                right: 18,
                                left: 8,
                                bottom: 8,
                              }}
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
                                width={65}
                                tickFormatter={(value: number) =>
                                  `${(value * 100).toFixed(0)}%`
                                }
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
                                    ? formatPercent(value)
                                    : value,
                                  "Cumulative return",
                                ]}
                              />
                              <Line
                                type="monotone"
                                dataKey="Cumulative_Return"
                                name="Cumulative return"
                                stroke="#a5f3cf"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4 }}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </Suspense>
                      </div>
                    </article>
                    <article className="panel analytics-panel">
                      <div className="panel-heading">
                        <div>
                          <p className="eyebrow">DOWNSIDE RISK</p>
                          <h2>Drawdown over time</h2>
                        </div>
                        <span className="panel-tag">
                          {selectedStock} Â· {selectedPeriod}
                        </span>
                      </div>
                      <p className="analytics-description">
                        Percentage below the highest closing price observed up
                        to each date.
                      </p>
                      <div className="advanced-chart">
                        <Suspense
                          fallback={
                            <p className="chart-state">Loading chartâ€¦</p>
                          }
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={analyticsSeries}
                              margin={{
                                top: 12,
                                right: 18,
                                left: 8,
                                bottom: 8,
                              }}
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
                                width={65}
                                tickFormatter={(value: number) =>
                                  `${(value * 100).toFixed(0)}%`
                                }
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
                                    ? formatPercent(value)
                                    : value,
                                  "Drawdown",
                                ]}
                              />
                              <Line
                                type="monotone"
                                dataKey="Drawdown"
                                name="Drawdown"
                                stroke="#f28b82"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4 }}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </Suspense>
                      </div>
                    </article>
                  </>
                )}
            </section>

            <section className="panel analytics-panel market-insights-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">MARKET INTELLIGENCE</p>
                  <h2>Market Insights</h2>
                </div>
                <span className="panel-tag">
                  {selectedStock} Â· {selectedPeriod}
                </span>
              </div>

              <p className="analytics-description">
                Evidence-based observations about performance, downside risk,
                and recovery relative to{" "}
                {marketInsights?.benchmark_name ?? "the selected benchmark"}.
              </p>

              {marketInsightsLoading && (
                <p className="chart-state" role="status">
                  Analysing historical performanceâ€¦
                </p>
              )}

              {!marketInsightsLoading && marketInsightsError && (
                <p className="chart-state chart-error" role="alert">
                  Unable to load insights: {marketInsightsError}
                </p>
              )}

              {!marketInsightsLoading &&
                !marketInsightsError &&
                marketInsights &&
                marketInsights.insights.length === 0 && (
                  <p className="chart-state">
                    Not enough evidence to generate insights for this period.
                  </p>
                )}

              {!marketInsightsLoading &&
                !marketInsightsError &&
                marketInsights && (
                  <>
                    <div className="market-insight-list">
                      {marketInsights.insights.map((insight, index) => (
                        <article
                          className="market-insight"
                          key={`${insight.category}-${index}`}
                        >
                          <div className="market-insight-heading">
                            <span className="insight-number">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <p className="eyebrow">
                                {insight.category.toUpperCase()}
                              </p>
                              <h3>{insight.title}</h3>
                            </div>
                          </div>

                          <p className="market-insight-message">
                            {insight.message}
                          </p>

                          <details className="insight-evidence">
                            <summary>View supporting evidence</summary>
                            <dl>
                              {Object.entries(insight.evidence).map(
                                ([key, value]) => (
                                  <div className="evidence-row" key={key}>
                                    <dt>
                                      {key
                                        .replace(/_/g, " ")
                                        .replace(/\b\w/g, (letter) =>
                                          letter.toUpperCase(),
                                        )}
                                    </dt>
                                    <dd>
                                      {typeof value === "number"
                                        ? key.includes("return") ||
                                          key.includes("drawdown") ||
                                          key.includes(
                                            "difference_percentage_points",
                                          )
                                          ? `${(value * 100).toFixed(2)}%`
                                          : Number.isInteger(value)
                                            ? value.toLocaleString()
                                            : value.toFixed(3)
                                        : value === null
                                          ? "Not available"
                                          : String(value)}
                                    </dd>
                                  </div>
                                ),
                              )}
                            </dl>
                          </details>
                        </article>
                      ))}
                    </div>

                    <p className="market-insights-disclaimer">
                      {marketInsights.disclaimer}
                    </p>
                    <p className="market-insights-meta">
                      Analysis period: {marketInsights.start_date} to{" "}
                      {marketInsights.end_date} Â·{" "}
                      {marketInsights.shared_trading_dates} shared trading dates
                    </p>
                  </>
                )}
            </section>
          </>

<>
            <section className="panel analytics-panel drawdown-recovery-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">DRAWDOWN &amp; RECOVERY</p>
                  <h2>How severe was the worst decline?</h2>
                </div>
                <span className="panel-tag">
                  {selectedStock} Â· {selectedPeriod}
                </span>
              </div>

              <p className="analytics-description">
                Peak-to-trough losses for the selected stock and its benchmark,
                calculated on shared trading dates.
              </p>

              {drawdownRecoveryLoading && (
                <p className="chart-state" role="status">
                  Calculating drawdown and recoveryâ€¦
                </p>
              )}

              {!drawdownRecoveryLoading && drawdownRecoveryError && (
                <p className="chart-state chart-error" role="alert">
                  Unable to load drawdown analysis: {drawdownRecoveryError}
                </p>
              )}

              {!drawdownRecoveryLoading &&
                !drawdownRecoveryError &&
                drawdownRecovery && (
                  <>
                    <div className="advanced-chart">
                      <Suspense
                        fallback={
                          <p className="chart-state">Loading chartâ€¦</p>
                        }
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={drawdownRecovery.series}
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
                              width={65}
                              tickFormatter={(value: number) =>
                                `${(value * 100).toFixed(0)}%`
                              }
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
                              formatter={(value, name) => [
                                typeof value === "number"
                                  ? formatPercent(value)
                                  : value,
                                name,
                              ]}
                            />
                            <Line
                              type="monotone"
                              dataKey="stock_drawdown"
                              name={selectedStock}
                              stroke="#f28b82"
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="benchmark_drawdown"
                              name={
                                drawdownRecovery?.benchmark_name ?? "Benchmark"
                              }
                              stroke="#7aa7ff"
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </Suspense>
                    </div>

                    <div className="drawdown-summary-grid">
                      {(
                        [
                          {
                            title: selectedStock,
                            summary: drawdownRecovery.stock,
                          },
                          {
                            title:
                              drawdownRecovery.benchmark_name ?? "Benchmark",
                            summary: drawdownRecovery.benchmark_analysis,
                          },
                        ] as const
                      ).map(({ title, summary }) => (
                        <div className="drawdown-summary" key={title}>
                          <h3>{title}</h3>

                          <div className="risk-row">
                            <div>
                              <span>Maximum drawdown</span>
                              <p>Largest peak-to-trough decline</p>
                            </div>
                            <strong>
                              {formatPercent(summary.maximum_drawdown)}
                            </strong>
                          </div>

                          {summary.status === "no_drawdown" ? (
                            <p className="drawdown-explanation">
                              No peak-to-trough decline occurred in this period.
                            </p>
                          ) : (
                            <>
                              <div className="risk-row">
                                <div>
                                  <span>Peak â†’ trough</span>
                                  <p>
                                    {summary.peak_date} â†’{" "}
                                    {summary.trough_date}
                                  </p>
                                </div>
                                <strong>
                                  {summary.peak_to_trough_days} days
                                </strong>
                              </div>

                              <div className="risk-row">
                                <div>
                                  <span>Recovery</span>
                                  <p>
                                    {summary.recovered
                                      ? `Recovered on ${summary.recovery_date}`
                                      : "Prior peak not reached again"}
                                  </p>
                                </div>
                                <strong>
                                  {summary.recovered
                                    ? `${summary.recovery_days} days`
                                    : "Pending"}
                                </strong>
                              </div>

                              <p className="drawdown-explanation">
                                {summary.recovered
                                  ? `It took ${summary.recovery_trading_sessions} trading sessions from peak to recovery.`
                                  : "Recovery duration cannot be determined until the prior peak is reached again."}
                              </p>
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="risk-note">
                      <strong>What the comparison tells you</strong>
                      <p>
                        {drawdownRecovery.maximum_drawdown_difference > 0
                          ? `${selectedStock} experienced a smaller maximum drawdown than ${drawdownRecovery.benchmark_name} by ${formatPercent(drawdownRecovery.maximum_drawdown_difference)}.`
                          : drawdownRecovery.maximum_drawdown_difference < 0
                            ? `${selectedStock} experienced a larger maximum drawdown than ${drawdownRecovery.benchmark_name} by ${formatPercent(Math.abs(drawdownRecovery.maximum_drawdown_difference))}.`
                            : `The stock and ${drawdownRecovery.benchmark_name} had the same maximum drawdown in this period.`}
                      </p>
                      <p>
                        This describes the selected historical period; it does
                        not predict future performance.
                      </p>
                    </div>
                  </>
                )}
            </section>

            <section className="panel analytics-panel benchmark-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">RELATIVE PERFORMANCE</p>
                  <h2>
                    Stock vs{" "}
                    {benchmarkComparison?.benchmark_name ?? "Benchmark"}
                  </h2>
                </div>
                <span className="panel-tag">{selectedPeriod}</span>
              </div>

              <p className="analytics-description">
                Cumulative returns from the first shared trading date.
              </p>

              {benchmarkLoading && (
                <p className="chart-state" role="status">
                  Loading benchmark comparisonâ€¦
                </p>
              )}

              {!benchmarkLoading && benchmarkError && (
                <p className="chart-state chart-error" role="alert">
                  Unable to load benchmark comparison: {benchmarkError}
                </p>
              )}

              {!benchmarkLoading &&
                !benchmarkError &&
                benchmarkSeries.length > 0 && (
                  <>
                    <div className="advanced-chart">
                      <Suspense
                        fallback={
                          <p className="chart-state">Loading chartâ€¦</p>
                        }
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={benchmarkSeries}
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
                              width={65}
                              tickFormatter={(value: number) =>
                                `${(value * 100).toFixed(0)}%`
                              }
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
                              formatter={(value, name) => [
                                typeof value === "number"
                                  ? formatPercent(value)
                                  : value,
                                name,
                              ]}
                            />
                            <Line
                              type="monotone"
                              dataKey="Stock_Return"
                              name={selectedStock}
                              stroke="#a5f3cf"
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="Benchmark_Return"
                              name={
                                benchmarkComparison?.benchmark_name ??
                                "Benchmark"
                              }
                              stroke="#7aa7ff"
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </Suspense>
                    </div>

                    <div className="risk-row">
                      <div>
                        <span>Relative performance at period end</span>
                        <p>Stock cumulative return minus benchmark return</p>
                      </div>
                      <strong>
                        {formatPercent(
                          benchmarkSeries[benchmarkSeries.length - 1]
                            .Relative_Performance,
                        )}
                      </strong>
                    </div>
                  </>
                )}
            </section>
          </>
    </>
  );
}
