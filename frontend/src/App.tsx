import { lazy, Suspense, useEffect, useState, useCallback } from "react";
import "./App.css";
import AIAnalyst from "./AIAnalyst";
import PortfolioAIAnalyst from "./PortfolioAIAnalyst";
import StockSearch from "./StockSearch";
import {
  getStocks,
  getStockMetrics,
  getStockHistory,
  getAnalyticsSeries,
  getBenchmarkComparison,
  getStockFreshness,
  getStockRefreshStatus,
  getDrawdownRecovery,
  getMarketInsights,
  getPortfolioAnalytics,
  getPortfolioScenario,
  getHistoricalPortfolioScenario,
  getPortfolioBenchmarkComparison,
  getHistoricalPortfolioStress,
} from "./api";
import type {
  Stock,
  StockMetrics,
  DailyPrice,
  AnalyticsPoint,
  BenchmarkPoint,
  DataFreshness,
  RefreshStatus,
  DrawdownRecoveryResponse,
  MarketInsightsResponse,
  PortfolioAnalyticsResponse,
  PortfolioScenarioResponse,
  BenchmarkComparisonResponse,
  HistoricalPortfolioScenarioResponse,
  PortfolioBenchmarkComparisonResponse,
  HistoricalPortfolioStressResponse,
} from "./api";

const ResponsiveContainer = lazy(() =>
  import("./LazyRecharts").then((m) => ({
    default: m.ResponsiveContainer,
  })),
);

const LineChart = lazy(() =>
  import("./LazyRecharts").then((m) => ({
    default: m.LineChart,
  })),
);

const Line = lazy(() =>
  import("./LazyRecharts").then((m) => ({
    default: m.Line,
  })),
);

const XAxis = lazy(() =>
  import("./LazyRecharts").then((m) => ({
    default: m.XAxis,
  })),
);

const YAxis = lazy(() =>
  import("./LazyRecharts").then((m) => ({
    default: m.YAxis,
  })),
);

const CartesianGrid = lazy(() =>
  import("./LazyRecharts").then((m) => ({
    default: m.CartesianGrid,
  })),
);

const Tooltip = lazy(() =>
  import("./LazyRecharts").then((m) => ({
    default: m.Tooltip,
  })),
);

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
  const [metricsBenchmarkName, setMetricsBenchmarkName] = useState("Benchmark");

  const [stocksLoading, setStocksLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [stocksError, setStocksError] = useState("");

  const loadStocks = useCallback(async (): Promise<void> => {
    setStocksLoading(true);
    setStocksError("");

    try {
      const result = await getStocks();
      setStocks(result);

      setSelectedStock((current) => {
        if (result.some((stock) => stock.ticker === current)) {
          return current;
        }

        return result[0]?.ticker ?? current;
      });
    } catch (error) {
      setStocksError(
        error instanceof Error ? error.message : "Unable to load stocks.",
      );
    } finally {
      setStocksLoading(false);
    }
  }, []);

  const [metricsError, setMetricsError] = useState("");
  const [history, setHistory] = useState<DailyPrice[]>([]);
  const [fullHistory, setFullHistory] = useState<DailyPrice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [analyticsSeries, setAnalyticsSeries] = useState<AnalyticsPoint[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");

  const [benchmarkSeries, setBenchmarkSeries] = useState<BenchmarkPoint[]>([]);
  const [benchmarkComparison, setBenchmarkComparison] =
    useState<BenchmarkComparisonResponse | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState("");

  const [drawdownRecovery, setDrawdownRecovery] =
    useState<DrawdownRecoveryResponse | null>(null);
  const [drawdownRecoveryLoading, setDrawdownRecoveryLoading] = useState(false);
  const [drawdownRecoveryError, setDrawdownRecoveryError] = useState("");

  const [marketInsights, setMarketInsights] =
    useState<MarketInsightsResponse | null>(null);
  const [marketInsightsLoading, setMarketInsightsLoading] = useState(false);
  const [marketInsightsError, setMarketInsightsError] = useState("");
  const [freshness, setFreshness] = useState<DataFreshness | null>(null);
  const [freshnessError, setFreshnessError] = useState<string | null>(null);
  const latestAvailableDate =
    fullHistory.length > 0 ? fullHistory[fullHistory.length - 1].date : "";

  const { startDate, endDate } = getDateRange(
    selectedPeriod,
    latestAvailableDate,
  );
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | null>(
    null,
  );

  const [refreshStatusError, setRefreshStatusError] = useState<string | null>(
    null,
  );

  const [portfolioAssets, setPortfolioAssets] = useState<
    { ticker: string; weight: string }[]
  >([]);
  const [portfolioInitialValue, setPortfolioInitialValue] = useState("10000");
  const [portfolioRiskFreeRate, setPortfolioRiskFreeRate] = useState("2");
  const [portfolioResult, setPortfolioResult] =
    useState<PortfolioAnalyticsResponse | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState("");

  const [scenarioShocks, setScenarioShocks] = useState<Record<string, string>>(
    {},
  );
  const [scenarioResult, setScenarioResult] =
    useState<PortfolioScenarioResponse | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioError, setScenarioError] = useState("");
  const [historicalStartDate, setHistoricalStartDate] = useState("");
  const [historicalEndDate, setHistoricalEndDate] = useState("");

  const [historicalResult, setHistoricalResult] =
    useState<HistoricalPortfolioScenarioResponse | null>(null);

  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState("");

  const [historicalStressResult, setHistoricalStressResult] =
    useState<HistoricalPortfolioStressResponse | null>(null);
  const [historicalStressLoading, setHistoricalStressLoading] = useState(false);
  const [historicalStressError, setHistoricalStressError] = useState("");

  const [portfolioBenchmarkResult, setPortfolioBenchmarkResult] =
    useState<PortfolioBenchmarkComparisonResponse | null>(null);
  const [portfolioBenchmarkLoading, setPortfolioBenchmarkLoading] =
    useState(false);
  const [portfolioBenchmarkError, setPortfolioBenchmarkError] = useState("");

  useEffect(() => {
    void loadStocks();
  }, []);

  useEffect(() => {
    if (stocks.length === 0) return;

    setPortfolioAssets((current) => {
      if (current.length > 0) {
        return current.filter((asset) =>
          stocks.some((stock) => stock.ticker === asset.ticker),
        );
      }

      const preferred = ["AAPL", "MSFT"].filter((ticker) =>
        stocks.some((stock) => stock.ticker === ticker),
      );

      const tickers = (
        preferred.length >= 2
          ? preferred
          : stocks.slice(0, 2).map((stock) => stock.ticker)
      ).slice(0, 2);

      return tickers.map((ticker, index) => ({
        ticker,
        weight: index === 0 ? (tickers.length === 1 ? "100" : "60") : "40",
      }));
    });
  }, [stocks]);

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
    if (!latestAvailableDate) return;

    const end = new Date(`${latestAvailableDate}T00:00:00Z`);
    const start = new Date(end);
    start.setUTCFullYear(start.getUTCFullYear() - 1);

    setHistoricalEndDate(latestAvailableDate);
    setHistoricalStartDate(start.toISOString().slice(0, 10));
    setHistoricalResult(null);
    setHistoricalError("");
  }, [latestAvailableDate]);

  useEffect(() => {
    if (!selectedStock || !latestAvailableDate) return;
    let cancelled = false;

    async function loadMetrics() {
      setMetricsLoading(true);
      setMetricsError("");
      setMetrics(null);
      try {
        const result = await getStockMetrics(selectedStock, startDate, endDate);

        if (!cancelled) {
          setMetrics(result.metrics);
          setMetricsBenchmarkName(result.benchmark_name);
        }
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
          setBenchmarkComparison(result);
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

  useEffect(() => {
    if (!selectedStock || !latestAvailableDate) return;

    let cancelled = false;

    async function loadDrawdownRecovery() {
      setDrawdownRecoveryLoading(true);
      setDrawdownRecoveryError("");
      setDrawdownRecovery(null);

      try {
        const result = await getDrawdownRecovery(
          selectedStock,
          startDate,
          endDate,
        );

        if (!cancelled) {
          setDrawdownRecovery(result);
        }
      } catch (error) {
        if (!cancelled) {
          setDrawdownRecoveryError(
            error instanceof Error
              ? error.message
              : "Unable to load drawdown and recovery analysis.",
          );
        }
      } finally {
        if (!cancelled) {
          setDrawdownRecoveryLoading(false);
        }
      }
    }

    void loadDrawdownRecovery();

    return () => {
      cancelled = true;
    };
  }, [selectedStock, startDate, endDate, latestAvailableDate]);

  useEffect(() => {
    if (!selectedStock || !latestAvailableDate) return;

    let cancelled = false;

    async function loadMarketInsights() {
      setMarketInsightsLoading(true);
      setMarketInsightsError("");
      setMarketInsights(null);

      try {
        const result = await getMarketInsights(
          selectedStock,
          startDate,
          endDate,
        );

        if (!cancelled) {
          setMarketInsights(result);
        }
      } catch (error) {
        if (!cancelled) {
          setMarketInsightsError(
            error instanceof Error
              ? error.message
              : "Unable to load market insights.",
          );
        }
      } finally {
        if (!cancelled) {
          setMarketInsightsLoading(false);
        }
      }
    }

    void loadMarketInsights();

    return () => {
      cancelled = true;
    };
  }, [selectedStock, startDate, endDate, latestAvailableDate]);

  const currency =
    stocks.find((stock) => stock.ticker === selectedStock)?.currency || "USD";

  useEffect(() => {
    let cancelled = false;

    async function loadFreshness() {
      setFreshness(null);
      setFreshnessError(null);

      try {
        const result = await getStockFreshness(selectedStock);

        if (!cancelled) {
          setFreshness(result);
        }
      } catch (error) {
        if (!cancelled) {
          setFreshnessError(
            error instanceof Error
              ? error.message
              : "Unable to load data freshness.",
          );
        }
      }
    }

    loadFreshness();

    return () => {
      cancelled = true;
    };
  }, [selectedStock]);

  useEffect(() => {
    let cancelled = false;

    async function loadRefreshStatus() {
      setRefreshStatus(null);
      setRefreshStatusError(null);

      try {
        const result = await getStockRefreshStatus(selectedStock);

        if (!cancelled) {
          setRefreshStatus(result);
        }
      } catch (error) {
        if (!cancelled) {
          setRefreshStatusError(
            error instanceof Error
              ? error.message
              : "Unable to load refresh status.",
          );
        }
      }
    }

    loadRefreshStatus();

    return () => {
      cancelled = true;
    };
  }, [selectedStock]);

  useEffect(() => {
    setScenarioShocks((current) => {
      const next: Record<string, string> = {};

      for (const asset of portfolioAssets) {
        next[asset.ticker] = current[asset.ticker] ?? "-10";
      }

      return next;
    });
  }, [portfolioAssets]);

  const portfolioWeightTotal = portfolioAssets.reduce(
    (sum, asset) => sum + (Number(asset.weight) || 0),
    0,
  );

  const portfolioWeightsValid =
    portfolioAssets.length > 0 &&
    portfolioAssets.every(
      (asset) =>
        asset.weight.trim() !== "" &&
        Number.isFinite(Number(asset.weight)) &&
        Number(asset.weight) >= 0,
    ) &&
    Math.abs(portfolioWeightTotal - 100) < 0.000001;

  function addPortfolioAsset(ticker: string) {
    if (!ticker || portfolioAssets.some((asset) => asset.ticker === ticker)) {
      return;
    }

    setPortfolioAssets((current) => [...current, { ticker, weight: "0" }]);
    setPortfolioResult(null);
  }

  function updatePortfolioWeight(ticker: string, weight: string) {
    setPortfolioAssets((current) =>
      current.map((asset) =>
        asset.ticker === ticker ? { ...asset, weight } : asset,
      ),
    );
    setPortfolioResult(null);
  }

  function removePortfolioAsset(ticker: string) {
    setPortfolioAssets((current) =>
      current.filter((asset) => asset.ticker !== ticker),
    );
    setPortfolioResult(null);
  }

  async function runPortfolioAnalysis() {
    if (!portfolioWeightsValid) {
      setPortfolioError("Set valid asset weights that total exactly 100%.");
      return;
    }

    const initialValue = Number(portfolioInitialValue);
    const riskFreeRatePercent = Number(portfolioRiskFreeRate);

    if (!Number.isFinite(initialValue) || initialValue <= 0) {
      setPortfolioError("Initial portfolio value must be greater than zero.");
      return;
    }

    if (!Number.isFinite(riskFreeRatePercent) || riskFreeRatePercent < 0) {
      setPortfolioError("Risk-free rate must be zero or greater.");
      return;
    }

    setPortfolioLoading(true);
    setPortfolioError("");
    setPortfolioResult(null);

    try {
      const result = await getPortfolioAnalytics({
        tickers: portfolioAssets.map((asset) => asset.ticker),
        weights: portfolioAssets.map((asset) => Number(asset.weight) / 100),
        initial_value: initialValue,
        risk_free_rate: riskFreeRatePercent / 100,
        start_date: startDate,
        end_date: endDate,
      });

      setPortfolioResult(result);
    } catch (error) {
      setPortfolioError(
        error instanceof Error
          ? error.message
          : "Unable to calculate portfolio analytics.",
      );
    } finally {
      setPortfolioLoading(false);
    }
  }

  async function runScenarioAnalysis() {
    if (!portfolioWeightsValid) {
      setScenarioError("Portfolio weights must total exactly 100%.");
      return;
    }

    const initialValue = Number(portfolioInitialValue);

    if (!Number.isFinite(initialValue) || initialValue <= 0) {
      setScenarioError("Initial portfolio value must be greater than zero.");
      return;
    }

    const shocks: number[] = [];

    for (const asset of portfolioAssets) {
      const rawShock = scenarioShocks[asset.ticker];

      if (rawShock == null || rawShock.trim() === "") {
        setScenarioError(`Enter a shock percentage for ${asset.ticker}.`);
        return;
      }

      const shockPercent = Number(rawShock);

      if (!Number.isFinite(shockPercent) || shockPercent < -100) {
        setScenarioError(
          `The shock for ${asset.ticker} must be at least -100%.`,
        );
        return;
      }

      shocks.push(shockPercent / 100);
    }

    setScenarioLoading(true);
    setScenarioError("");
    setScenarioResult(null);

    try {
      const result = await getPortfolioScenario({
        tickers: portfolioAssets.map((asset) => asset.ticker),
        weights: portfolioAssets.map((asset) => Number(asset.weight) / 100),
        shocks,
        initial_value: initialValue,
      });

      setScenarioResult(result);
    } catch (error) {
      setScenarioError(
        error instanceof Error
          ? error.message
          : "Unable to calculate the scenario.",
      );
    } finally {
      setScenarioLoading(false);
    }
  }

  async function runHistoricalBacktest() {
    if (!portfolioWeightsValid) {
      setHistoricalError("Portfolio weights must total exactly 100%.");
      return;
    }

    if (!historicalStartDate || !historicalEndDate) {
      setHistoricalError("Choose both a start date and an end date.");
      return;
    }

    if (historicalStartDate >= historicalEndDate) {
      setHistoricalError("The start date must be earlier than the end date.");
      return;
    }

    const initialValue = Number(portfolioInitialValue);

    if (!Number.isFinite(initialValue) || initialValue <= 0) {
      setHistoricalError("Initial portfolio value must be greater than zero.");
      return;
    }

    setHistoricalLoading(true);
    setHistoricalError("");
    setHistoricalResult(null);

    try {
      const result = await getHistoricalPortfolioScenario({
        tickers: portfolioAssets.map((asset) => asset.ticker),
        weights: portfolioAssets.map((asset) => Number(asset.weight) / 100),
        start_date: historicalStartDate,
        end_date: historicalEndDate,
        initial_value: initialValue,
      });

      setHistoricalResult(result);
    } catch (error) {
      setHistoricalError(
        error instanceof Error
          ? error.message
          : "Unable to calculate historical portfolio performance.",
      );
    } finally {
      setHistoricalLoading(false);
    }
  }

  async function runHistoricalStressTest() {
    if (!portfolioWeightsValid) {
      setHistoricalStressError("Set valid portfolio weights that total 100%.");
      return;
    }

    if (
      !historicalStartDate ||
      !historicalEndDate ||
      historicalStartDate > historicalEndDate
    ) {
      setHistoricalStressError("Select a valid historical date range.");
      return;
    }

    const initialValue = Number(portfolioInitialValue);
    if (!Number.isFinite(initialValue) || initialValue <= 0) {
      setHistoricalStressError(
        "Initial portfolio value must be greater than zero.",
      );
      return;
    }

    setHistoricalStressLoading(true);
    setHistoricalStressError("");
    setHistoricalStressResult(null);

    try {
      const result = await getHistoricalPortfolioStress({
        tickers: portfolioAssets.map((asset) => asset.ticker),
        weights: portfolioAssets.map((asset) => Number(asset.weight) / 100),
        start_date: historicalStartDate,
        end_date: historicalEndDate,
        initial_value: initialValue,
      });

      setHistoricalStressResult(result);
    } catch (error) {
      setHistoricalStressError(
        error instanceof Error
          ? error.message
          : "Unable to analyze historical portfolio stress.",
      );
    } finally {
      setHistoricalStressLoading(false);
    }
  }

  async function runPortfolioBenchmarkComparison() {
    if (!portfolioWeightsValid) {
      setPortfolioBenchmarkError(
        "Set valid portfolio weights that total exactly 100%.",
      );
      return;
    }

    if (!historicalStartDate || !historicalEndDate) {
      setPortfolioBenchmarkError("Select both historical dates.");
      return;
    }

    if (historicalStartDate > historicalEndDate) {
      setPortfolioBenchmarkError("Start date must be on or before end date.");
      return;
    }

    const initialValue = Number(portfolioInitialValue);

    if (!Number.isFinite(initialValue) || initialValue <= 0) {
      setPortfolioBenchmarkError(
        "Initial portfolio value must be greater than zero.",
      );
      return;
    }

    setPortfolioBenchmarkLoading(true);
    setPortfolioBenchmarkError("");
    setPortfolioBenchmarkResult(null);

    try {
      const result = await getPortfolioBenchmarkComparison({
        tickers: portfolioAssets.map((asset) => asset.ticker),
        weights: portfolioAssets.map((asset) => Number(asset.weight) / 100),
        start_date: historicalStartDate,
        end_date: historicalEndDate,
        initial_value: initialValue,
      });

      setPortfolioBenchmarkResult(result);
    } catch (error) {
      setPortfolioBenchmarkError(
        error instanceof Error
          ? error.message
          : "Unable to compare the portfolio with the benchmark.",
      );
    } finally {
      setPortfolioBenchmarkLoading(false);
    }
  }

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
          <a className="nav-item" href="#portfolio">
            ◫ Portfolio
          </a>
          <a className="nav-item active" href="#overview">
            ◫ Overview
          </a>
          <a className="nav-item" href="#performance">
            ↗ Performance
          </a>
          <a className="nav-item" href="#risk">
            ◈ Risk analytics
          </a>
          <a className="nav-item" href="#risk-decomposition">
            ◫ Risk decomposition
          </a>
          <a className="nav-item" href="#scenario-analysis">
            ◫ Scenario analysis
          </a>
          <a className="nav-item" href="#historical-backtest">
            ◫ Historical backtesting
          </a>
          <a className="nav-item" href="#portfolio-benchmark">
            ↗ Benchmark comparison
          </a>
          <a className="nav-item" href="#historical-stress">
            Historical stress testing
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

        <StockSearch
          onStockImported={async (ticker) => {
            await loadStocks();
            setSelectedStock(ticker);
          }}
        />

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

        <section className="panel portfolio-builder" id="portfolio">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PORTFOLIO WORKSPACE</p>
              <h2>Portfolio Builder</h2>
            </div>
            <span className="panel-tag">Daily rebalancing</span>
          </div>

          <p className="analytics-description">
            Construct a multi-asset portfolio and measure its historical
            performance and downside risk.
          </p>

          <div className="portfolio-settings">
            <label className="portfolio-field">
              <span>INITIAL INVESTMENT ($)</span>
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
                      updatePortfolioWeight(asset.ticker, event.target.value)
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
                <option value="">Choose available stock…</option>
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
                      {stock.name ? ` — ${stock.name}` : ""}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="portfolio-weight-status">
            {portfolioWeightsValid
              ? "Allocation is valid. Weights total 100%."
              : `Adjust your allocations so the total equals 100%. Current total: ${portfolioWeightTotal.toFixed(2)}%.`}
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
              {portfolioLoading ? "Analysing…" : "Run portfolio analysis"}
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
                  <strong>{formatPrice(portfolioResult.final_value)}</strong>
                  <small>
                    Initial: {formatPrice(portfolioResult.initial_value)}
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
                  <small>Trough: {portfolioResult.maximum_drawdown_date}</small>
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
                    {formatPrice(
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
                  {portfolioResult.start_date} — {portfolioResult.end_date}
                </span>
              </div>

              <div className="advanced-chart portfolio-value-chart">
                <Suspense
                  fallback={<p className="chart-state">Loading chart…</p>}
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
                        tickFormatter={(value: number) =>
                          `$${value.toLocaleString("en-US", {
                            maximumFractionDigits: 0,
                          })}`
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
                            ? formatPrice(value)
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
              Understand how your portfolio is allocated, how its assets move
              together, and how each holding contributes to overall volatility.
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
                  {portfolioResult.concentration.effective_number_of_holdings ==
                  null
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
                  Annualized estimate from historical asset return covariance.
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
                          {Object.keys(portfolioResult.correlation_matrix).map(
                            (otherTicker) => {
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
                            },
                          )}
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
                  <i className="legend-dot legend-neutral" /> Weak / near zero
                </span>
                <span>
                  <i className="legend-dot legend-negative" /> Negative
                </span>
              </div>

              <p className="risk-explanation">
                Correlation ranges from -1 to +1. Values near +1 indicate assets
                that historically moved together; values near -1 indicate
                opposite movement. Correlation alone does not guarantee
                diversification during market stress.
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
                {Object.entries(portfolioResult.asset_risk_contributions).map(
                  ([ticker, contribution]) => {
                    const percentage = contribution.risk_contribution_percent;
                    const magnitude = Math.min(Math.abs(percentage ?? 0), 100);

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
                  },
                )}
              </div>

              <p className="risk-explanation">
                Risk contribution percentages sum to approximately 100% when
                portfolio volatility is nonzero. A negative contribution means
                an asset reduces total portfolio volatility under the estimated
                covariance model.
              </p>
            </div>

            <div className="portfolio-assumptions">
              <strong>Interpretation and limitations</strong>
              <p>
                These measures use historical daily returns over shared trading
                dates. Correlations and risk contributions can change over time.
                HHI measures weight concentration, not the underlying similarity
                or business exposure of holdings. This analysis is informational
                and does not predict future performance.
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
              <h2>Portfolio vs. S&amp;P 500</h2>
              <p>
                Compare your portfolio with the market over the same historical
                period and starting investment.
              </p>
            </div>
          </div>

          <div className="portfolio-benchmark-context">
            <span>
              Period: {historicalStartDate || "—"} to {historicalEndDate || "—"}
            </span>
            <span>
              Starting investment: {formatPrice(Number(portfolioInitialValue))}
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
              ? "Comparing performance…"
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
                    {formatPercent(portfolioBenchmarkResult.portfolio.return)}
                  </strong>
                  <small>
                    Ending value:{" "}
                    {formatPrice(
                      portfolioBenchmarkResult.portfolio.final_value,
                    )}
                  </small>
                </article>

                <article className="portfolio-benchmark-metric">
                  <span>{portfolioBenchmarkResult.benchmark_name} return</span>
                  <strong
                    className={
                      portfolioBenchmarkResult.benchmark.return >= 0
                        ? "positive-value"
                        : "negative-value"
                    }
                  >
                    {formatPercent(portfolioBenchmarkResult.benchmark.return)}
                  </strong>
                  <small>
                    Ending value:{" "}
                    {formatPrice(
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
                    {formatPrice(
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
                  {portfolioBenchmarkResult.assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
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
            Period: {historicalStartDate || "—"} to {historicalEndDate || "—"}
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
              ? "Analyzing historical period…"
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
                    {formatPercent(historicalStressResult.historical_return)}
                  </strong>
                  <small>
                    P&amp;L: {formatPrice(historicalStressResult.estimated_pnl)}
                  </small>
                </article>

                <article className="historical-stress-metric">
                  <span>Maximum drawdown</span>
                  <strong>
                    {formatPercent(historicalStressResult.maximum_drawdown)}
                  </strong>
                  <small>
                    Trough date: {historicalStressResult.maximum_drawdown_date}
                  </small>
                </article>

                <article className="historical-stress-metric">
                  <span>Ending portfolio value</span>
                  <strong>
                    {formatPrice(historicalStressResult.final_value)}
                  </strong>
                  <small>
                    Starting value:{" "}
                    {formatPrice(historicalStressResult.initial_value)}
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
                          <td>{formatPrice(asset.pnl_impact)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="historical-stress-assumptions">
                <h3>Assumptions and limitations</h3>
                <p>
                  {historicalStressResult.shared_trading_dates} shared trading
                  dates. The portfolio is buy-and-hold with no rebalancing.
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
            Apply a hypothetical gain or loss to each holding and calculate its
            immediate impact on your portfolio.
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
              {formatPrice(Number(portfolioInitialValue) || 0)}
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
              {scenarioLoading ? "Calculating…" : "Run stress scenario"}
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
                    {formatPrice(scenarioResult.estimated_pnl)}
                  </strong>
                </article>

                <article className="scenario-metric">
                  <span>Post-shock value</span>
                  <strong>{formatPrice(scenarioResult.final_value)}</strong>
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
                            {formatPercent(impact.shock_return)} shock ·{" "}
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
                          {formatPrice(impact.pnl_impact)}
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
                  portfolio weights as a single instantaneous shock. It assumes
                  no rebalancing, fees, taxes, slippage, or secondary market
                  effects. It is a hypothetical sensitivity analysis, not a
                  forecast.
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
            Measure how your current portfolio allocation would have performed
            over a selected historical period, without rebalancing.
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
              {formatPrice(Number(portfolioInitialValue) || 0)}
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
              {historicalLoading ? "Backtesting…" : "Run historical backtest"}
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
                    {formatPrice(historicalResult.estimated_pnl)}
                  </strong>
                </article>

                <article className="scenario-metric">
                  <span>Ending value</span>
                  <strong>{formatPrice(historicalResult.final_value)}</strong>
                </article>
              </div>

              <div className="historical-period-summary">
                <div>
                  <span>Requested period</span>
                  <strong>
                    {historicalResult.requested_start_date} –{" "}
                    {historicalResult.requested_end_date}
                  </strong>
                </div>
                <div>
                  <span>Actual price period</span>
                  <strong>
                    {historicalResult.actual_start_date} –{" "}
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
                            Weight: {formatPercent(impact.weight)} · Return:{" "}
                            {formatPercent(impact.historical_return)}
                          </span>
                          <span>
                            Price: {impact.start_price.toFixed(2)} →{" "}
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
                            {formatPrice(impact.pnl_impact)}
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
                {(freshness.database_import?.status ?? freshness.data_status)
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
                <strong>
                  {freshness.latest_trade_date ?? "Not available"}
                </strong>
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
            <span>Sensitivity to {metricsBenchmarkName} returns</span>
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
                <Suspense
                  fallback={<p className="chart-state">Loading chart…</p>}
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
                        activeDot={{ r: 5, fill: "#a5f3cf", stroke: "#0d141f" }}
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
                    <Suspense
                      fallback={<p className="chart-state">Loading chart…</p>}
                    >
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
                      {selectedStock} · {selectedPeriod}
                    </span>
                  </div>
                  <p className="analytics-description">
                    Percentage below the highest closing price observed up to
                    each date.
                  </p>
                  <div className="advanced-chart">
                    <Suspense
                      fallback={<p className="chart-state">Loading chart…</p>}
                    >
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
              {selectedStock} · {selectedPeriod}
            </span>
          </div>

          <p className="analytics-description">
            Evidence-based observations about performance, downside risk, and
            recovery relative to{" "}
            {marketInsights?.benchmark_name ?? "the selected benchmark"}.
          </p>

          {marketInsightsLoading && (
            <p className="chart-state" role="status">
              Analysing historical performance…
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

          {!marketInsightsLoading && !marketInsightsError && marketInsights && (
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

                    <p className="market-insight-message">{insight.message}</p>

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
                                    key.includes("difference_percentage_points")
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
                {marketInsights.end_date} ·{" "}
                {marketInsights.shared_trading_dates} shared trading dates
              </p>
            </>
          )}
        </section>

        <AIAnalyst />
        <PortfolioAIAnalyst />

        <section className="panel analytics-panel drawdown-recovery-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">DRAWDOWN &amp; RECOVERY</p>
              <h2>How severe was the worst decline?</h2>
            </div>
            <span className="panel-tag">
              {selectedStock} · {selectedPeriod}
            </span>
          </div>

          <p className="analytics-description">
            Peak-to-trough losses for the selected stock and its benchmark,
            calculated on shared trading dates.
          </p>

          {drawdownRecoveryLoading && (
            <p className="chart-state" role="status">
              Calculating drawdown and recovery…
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
                    fallback={<p className="chart-state">Loading chart…</p>}
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
                          name={drawdownRecovery?.benchmark_name ?? "Benchmark"}
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
                        title: drawdownRecovery.benchmark_name ?? "Benchmark",
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
                              <span>Peak → trough</span>
                              <p>
                                {summary.peak_date} → {summary.trough_date}
                              </p>
                            </div>
                            <strong>{summary.peak_to_trough_days} days</strong>
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
                    This describes the selected historical period; it does not
                    predict future performance.
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
                Stock vs {benchmarkComparison?.benchmark_name ?? "Benchmark"}
              </h2>
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
                  <Suspense
                    fallback={<p className="chart-state">Loading chart…</p>}
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
                            benchmarkComparison?.benchmark_name ?? "Benchmark"
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

        <footer className="footer">
          <span>MarketLens · Research &amp; Risk Analytics</span>
          <span>Educational use only · Not investment advice</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
