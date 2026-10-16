import { useEffect, useState } from "react";
import {
  getStocks,
  getStockMetrics,
  getStockHistory,
  getAnalyticsSeries,
  getBenchmarkComparison,
} from "./api";
import type {
  Stock,
  StockMetrics,
  DailyPrice,
  AnalyticsPoint,
  BenchmarkPoint,
} from "./api";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import "./App.css";

function formatPrice(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

type Period = "1M" | "3M" | "6M" | "1Y" | "ALL";

function getDateRange(
  period: Period,
  latestDate: string,
): { startDate?: string; endDate?: string } {
  if (period === "ALL" || !latestDate) {
    return {};
  }

  const end = new Date(`${latestDate}T00:00:00Z`);
  const start = new Date(end);

  switch (period) {
    case "1M":
      start.setUTCMonth(start.getUTCMonth() - 1);
      break;
    case "3M":
      start.setUTCMonth(start.getUTCMonth() - 3);
      break;
    case "6M":
      start.setUTCMonth(start.getUTCMonth() - 6);
      break;
    case "1Y":
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      break;
  }

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: latestDate,
  };
}

function App() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selectedStock, setSelectedStock] = useState("AAPL");
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("3M");
  const [metrics, setMetrics] = useState<StockMetrics | null>(null);

  const [stocksLoading, setStocksLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [stocksError, setStocksError] = useState("");
  const [metricsError, setMetricsError] = useState("");

  const [history, setHistory] = useState<DailyPrice[]>([]);
  const [fullHistory, setFullHistory] = useState<DailyPrice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [analyticsSeries, setAnalyticsSeries] = useState<AnalyticsPoint[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");

  const [benchmarkSeries, setBenchmarkSeries] = useState<BenchmarkPoint[]>([]);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState("");

  const latestAvailableDate =
    fullHistory.length > 0 ? fullHistory[fullHistory.length - 1].date : "";

  const { startDate, endDate } = getDateRange(
    selectedPeriod,
    latestAvailableDate,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadStocks() {
      setStocksLoading(true);
      setStocksError("");

      try {
        const result = await getStocks();
        if (cancelled) return;

        setStocks(result);
        if (
          result.length > 0 &&
          !result.some((stock) => stock.ticker === selectedStock)
        ) {
          setSelectedStock(result[0].ticker);
        }
      } catch (error) {
        if (!cancelled) {
          setStocksError(
            error instanceof Error ? error.message : "Unable to load stocks.",
          );
        }
      } finally {
        if (!cancelled) setStocksLoading(false);
      }
    }

    void loadStocks();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the complete history only when the selected stock changes. This gives
  // the date-range controls a stable end date, independent of the chosen period.
  useEffect(() => {
    if (!selectedStock) return;
    let cancelled = false;

    async function loadFullHistory() {
      setFullHistory([]);
      setHistoryError("");
      try {
        const result = await getStockHistory(selectedStock);
        if (!cancelled) setFullHistory(result.history);
      } catch (error) {
        if (!cancelled) {
          setHistoryError(
            error instanceof Error
              ? error.message
              : "Unable to load historical prices.",
          );
        }
      }
    }

    void loadFullHistory();
    return () => {
      cancelled = true;
    };
  }, [selectedStock]);

  useEffect(() => {
    if (!selectedStock || !latestAvailableDate) return;
    let cancelled = false;

    async function loadMetrics() {
      setMetricsLoading(true);
      setMetricsError("");
      setMetrics(null);
      try {
        const result = await getStockMetrics(selectedStock, startDate, endDate);
        if (!cancelled) setMetrics(result.metrics);
      } catch (error) {
        if (!cancelled) {
          setMetricsError(
            error instanceof Error
              ? error.message
              : "Unable to load stock metrics.",
          );
        }
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    }

    void loadMetrics();
    return () => {
      cancelled = true;
    };
  }, [selectedStock, startDate, endDate, latestAvailableDate]);

  useEffect(() => {
    if (!selectedStock || !latestAvailableDate) return;
    let cancelled = false;

    async function loadFilteredHistory() {
      setHistoryLoading(true);
      setHistoryError("");
      setHistory([]);
      try {
        const result = await getStockHistory(selectedStock, startDate, endDate);
        if (!cancelled) setHistory(result.history);
      } catch (error) {
        if (!cancelled) {
          setHistoryError(
            error instanceof Error
              ? error.message
              : "Unable to load historical prices.",
          );
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    void loadFilteredHistory();
    return () => {
      cancelled = true;
    };
  }, [selectedStock, startDate, endDate, latestAvailableDate]);

  useEffect(() => {
    if (!selectedStock || !latestAvailableDate) return;
    let cancelled = false;

    async function loadAnalyticsSeries() {
      setAnalyticsLoading(true);
      setAnalyticsError("");
      setAnalyticsSeries([]);
      try {
        const result = await getAnalyticsSeries(
          selectedStock,
          startDate,
          endDate,
        );
        if (!cancelled) setAnalyticsSeries(result.series);
      } catch (error) {
        if (!cancelled) {
          setAnalyticsError(
            error instanceof Error
              ? error.message
              : "Unable to load advanced analytics.",
          );
        }
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    }

    void loadAnalyticsSeries();
    return () => {
      cancelled = true;
    };
  }, [selectedStock, startDate, endDate, latestAvailableDate]);

  useEffect(() => {
    if (!selectedStock || !latestAvailableDate) return;

    let cancelled = false;

    async function loadBenchmarkComparison() {
      setBenchmarkLoading(true);
      setBenchmarkError("");
      setBenchmarkSeries([]);

      try {
        const result = await getBenchmarkComparison(
          selectedStock,
          startDate,
          endDate,
        );

        if (!cancelled) {
          setBenchmarkSeries(result.series);
        }
      } catch (error) {
        if (!cancelled) {
          setBenchmarkError(
            error instanceof Error
              ? error.message
              : "Unable to load benchmark comparison.",
          );
        }
      } finally {
        if (!cancelled) {
          setBenchmarkLoading(false);
        }
      }
    }

    void loadBenchmarkComparison();

    return () => {
      cancelled = true;
    };
  }, [selectedStock, startDate, endDate, latestAvailableDate]);
  const currency =
    stocks.find((stock) => stock.ticker === selectedStock)?.currency || "USD";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">M</div>
          <div>
            <h2>MarketLens</h2>
            <span>MARKET INTELLIGENCE</span>
          </div>
        </div>

        <p className="nav-heading">WORKSPACE</p>
        <nav className="navigation">
          <a className="nav-item active" href="#overview">
            ◫ Overview
          </a>
          <a className="nav-item" href="#performance">
            ↗ Performance
          </a>
          <a className="nav-item" href="#risk">
            ◈ Risk analytics
          </a>
        </nav>

        <div className="sidebar-bottom">
          <span className="status-dot" />
          <div>
            <strong>Market data workspace</strong>
            <p>PostgreSQL · FastAPI</p>
          </div>
        </div>
      </aside>

      <section className="main-content" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">MARKET RESEARCH / DASHBOARD</p>
            <h1>Market overview</h1>
          </div>
          <div className="connection-status">
            <span className="status-dot" />
            API connected
          </div>
        </header>

        <section className="welcome-row">
          <div>
            <h2>Understand the market.</h2>
            <p>Explore historical performance and quantify investment risk.</p>
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
              <option value="ALL">All Available Data</option>
            </select>
          </label>
        </section>

        {stocksLoading && (
          <div className="preview-notice" role="status">
            Loading registered stocks from the API…
          </div>
        )}
        {stocksError && (
          <div className="error-notice" role="alert">
            Unable to load stocks: {stocksError}
          </div>
        )}
        {metricsLoading && (
          <div className="preview-notice" role="status">
            Loading {selectedStock} metrics from PostgreSQL…
          </div>
        )}
        {metricsError && (
          <div className="error-notice" role="alert">
            Unable to load {selectedStock} metrics: {metricsError}
          </div>
        )}
        {!metricsLoading && !metricsError && metrics && (
          <div className="preview-notice">
            <span>i</span> Showing {metrics.observations} daily observations for{" "}
            <strong>{selectedStock}</strong>, from {metrics.start_date} to{" "}
            {metrics.end_date}.
          </div>
        )}

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
            <h3>
              {metrics?.beta != null ? metrics.beta.toFixed(2) : "—"}
            </h3>
            <span>Sensitivity to S&P 500 returns</span>
            </article>
            <article className="metric-card">
              <p>Annualized Alpha</p>
              <h3>
                {metrics?.alpha_annual != null
                  ? `${(metrics.alpha_annual * 100).toFixed(2)}%`
                  : "—"}
              </h3>
              <span>Annualized excess return beyond market exposure</span>
            </article>
        </section>

        <section className="analysis-grid" id="performance">
          <article className="panel performance-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">PRICE HISTORY</p>
                <h2>Historical performance</h2>
              </div>
              <span className="panel-tag">
                {selectedStock || "—"} · {selectedPeriod}
              </span>
            </div>
            <div className="chart-container">
              {historyLoading && (
                <p className="chart-state" role="status">
                  Loading historical prices…
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
                      tickFormatter={(price: number) => `$${price.toFixed(0)}`}
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
                      activeDot={{ r: 5, fill: "#a5f3cf", stroke: "#0d141f" }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
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
                {metrics ? formatPercent(metrics.maximum_drawdown) : "—"}
              </strong>
            </div>
            <div className="risk-row">
              <div>
                <span>Annualized volatility</span>
                <p>Dispersion of daily returns</p>
              </div>
              <strong>
                {metrics ? formatPercent(metrics.annualized_volatility) : "—"}
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
              Loading cumulative returns and drawdown…
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
                      {selectedStock} · {selectedPeriod}
                    </span>
                  </div>
                  <p className="analytics-description">
                    Percentage change from the first observed closing price.
                  </p>
                  <div className="advanced-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={analyticsSeries}
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
                  </div>
                </article>
                <article className="panel analytics-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">DOWNSIDE RISK</p>
                      <h2>Drawdown over time</h2>
                    </div>
                    <span className="panel-tag">
                      {selectedStock} · {selectedPeriod}
                    </span>
                  </div>
                  <p className="analytics-description">
                    Percentage below the highest closing price observed up to
                    each date.
                  </p>
                  <div className="advanced-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={analyticsSeries}
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
                  </div>
                </article>
              </>
            )}
        </section>

        <section className="panel analytics-panel benchmark-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RELATIVE PERFORMANCE</p>
              <h2>Stock vs S&P 500</h2>
            </div>
            <span className="panel-tag">{selectedPeriod}</span>
          </div>

          <p className="analytics-description">
            Cumulative returns from the first shared trading date.
          </p>

          {benchmarkLoading && (
            <p className="chart-state" role="status">
              Loading benchmark comparison…
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
                        name="S&P 500"
                        stroke="#7aa7ff"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
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

        <footer className="footer">
          <span>MarketLens · Research &amp; Risk Analytics</span>
          <span>Educational use only · Not investment advice</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
