import { useEffect, useState, useCallback } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
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
import OverviewPage from "./pages/OverviewPage";
import DataStatusPage from "./pages/DataStatusPage";
import StockAnalysisPage from "./pages/StockAnalysisPage";
import PortfolioAnalysisPage from "./pages/PortfolioAnalysisPage";
import AIAnalysisPage from "./pages/AIAnalysisPage";

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

type AppPage =
  | "overview"
  | "stock-analysis"
  | "portfolio-analysis"
  | "ai-analysis"
  | "data-status";

function App() {
  const [activePage, setActivePage] = useState<AppPage>("overview");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activePage]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [portfolioAssets, setPortfolioAssets] = useState<
  { ticker: string; weight: string }[]
>([]);

const [scenarioShocks, setScenarioShocks] = useState<Record<string, string>>(
  {},
);
  const [selectedStock, setSelectedStock] = useState("AAPL");
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("3M");
  const [metrics, setMetrics] = useState<StockMetrics | null>(null);
  const [metricsBenchmarkName, setMetricsBenchmarkName] = useState("Benchmark");

  const [stocksLoading, setStocksLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [stocksError, setStocksError] = useState("");

  const loadStocks = useCallback(async (showLoading = true): Promise<void> => {
    if (showLoading) {
      setStocksLoading(true);
      setStocksError("");
    }

    try {
      const result = await getStocks();
      setStocks(result);

      setScenarioShocks((current) => {
        const next = { ...current };

        for (const stock of result) {
          next[stock.ticker] ??= "-10";
        }

        return next;
      });

      setPortfolioAssets((current) => {
        if (current.length > 0) {
          return current.filter((asset) =>
            result.some((stock) => stock.ticker === asset.ticker),
          );
        }

        const preferred = ["AAPL", "MSFT"].filter((ticker) =>
          result.some((stock) => stock.ticker === ticker),
        );

        const tickers = (
          preferred.length >= 2
            ? preferred
            : result.slice(0, 2).map((stock) => stock.ticker)
        ).slice(0, 2);

        return tickers.map((ticker, index) => ({
          ticker,
          weight: index === 0 ? (tickers.length === 1 ? "100" : "60") : "40",
        }));
      });

      setSelectedStock((current) =>
        result.some((stock) => stock.ticker === current)
          ? current
          : (result[0]?.ticker ?? current),
      );
    } catch (error) {
      setStocksError(
        error instanceof Error ? error.message : "Unable to load stocks.",
      );
    } finally {
      if (showLoading) {
        setStocksLoading(false);
      }
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

  const [portfolioInitialValue, setPortfolioInitialValue] = useState("10000");
  const [portfolioRiskFreeRate, setPortfolioRiskFreeRate] = useState("2");
  const [portfolioResult, setPortfolioResult] =
    useState<PortfolioAnalyticsResponse | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState("");


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
    const timeoutId = window.setTimeout(() => {
      void loadStocks();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadStocks]);

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

        if (!cancelled) {
          setFullHistory(result.history);

          const latestDate = result.history[result.history.length - 1]?.date;

          if (latestDate) {
            const end = new Date(`${latestDate}T00:00:00Z`);
            const start = new Date(end);
            start.setUTCFullYear(start.getUTCFullYear() - 1);

            setHistoricalEndDate(latestDate);
            setHistoricalStartDate(start.toISOString().slice(0, 10));
            setHistoricalResult(null);
            setHistoricalError("");
          }
        }
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

    const startDate = start.toISOString().slice(0, 10);

    const timeoutId = window.setTimeout(() => {
      setHistoricalEndDate(latestAvailableDate);
      setHistoricalStartDate(startDate);
      setHistoricalResult(null);
      setHistoricalError("");
    }, 0);

    return () => window.clearTimeout(timeoutId);
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
      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      <section className="main-content" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {activePage === "overview"
                ? "MARKET RESEARCH / WORKSPACE"
                : activePage === "stock-analysis"
                  ? "INDIVIDUAL ASSET RESEARCH"
                  : activePage === "portfolio-analysis"
                    ? "PORTFOLIO RISK & PERFORMANCE"
                    : activePage === "ai-analysis"
                      ? "AI-ASSISTED RESEARCH"
                      : "MARKET DATA OPERATIONS"}
            </p>
            <h1>
              {activePage === "overview"
                ? "Market overview"
                : activePage === "stock-analysis"
                  ? "Stock Analysis"
                  : activePage === "portfolio-analysis"
                    ? "Portfolio Analysis"
                    : activePage === "ai-analysis"
                      ? "AI Analysis"
                      : "Data Status"}
            </h1>
          </div>
          <div className="connection-status">
            <span className="status-dot" />
            API connected
          </div>
        </header>

        {activePage === "overview" && (
          <OverviewPage
            selectedStock={selectedStock}
            portfolioAssetCount={portfolioAssets.length}
            dataStatus={freshness?.data_status ?? "View status"}
            onNavigate={setActivePage}
          />
        )}

        {activePage === "stock-analysis" && (
          <StockAnalysisPage
            stocks={stocks}
            selectedStock={selectedStock}
            selectedPeriod={selectedPeriod}
            setSelectedStock={setSelectedStock}
            setSelectedPeriod={setSelectedPeriod}
            loadStocks={loadStocks}
            stocksLoading={stocksLoading}
            stocksError={stocksError}
            metrics={metrics}
            metricsBenchmarkName={metricsBenchmarkName}
            metricsLoading={metricsLoading}
            metricsError={metricsError}
            currency={currency}
            history={history}
            historyLoading={historyLoading}
            historyError={historyError}
            analyticsSeries={analyticsSeries}
            analyticsLoading={analyticsLoading}
            analyticsError={analyticsError}
            benchmarkSeries={benchmarkSeries}
            benchmarkComparison={benchmarkComparison}
            benchmarkLoading={benchmarkLoading}
            benchmarkError={benchmarkError}
            drawdownRecovery={drawdownRecovery}
            drawdownRecoveryLoading={drawdownRecoveryLoading}
            drawdownRecoveryError={drawdownRecoveryError}
            marketInsights={marketInsights}
            marketInsightsLoading={marketInsightsLoading}
            marketInsightsError={marketInsightsError}
          />
        )}
        {activePage === "portfolio-analysis" && (
          <PortfolioAnalysisPage
            stocks={stocks}
            selectedPeriod={selectedPeriod}
            setSelectedPeriod={setSelectedPeriod}
            startDate={startDate}
            endDate={endDate}
            latestAvailableDate={latestAvailableDate}
            portfolioAssets={portfolioAssets}
            portfolioInitialValue={portfolioInitialValue}
            setPortfolioInitialValue={setPortfolioInitialValue}
            portfolioRiskFreeRate={portfolioRiskFreeRate}
            setPortfolioRiskFreeRate={setPortfolioRiskFreeRate}
            portfolioWeightTotal={portfolioWeightTotal}
            portfolioWeightsValid={portfolioWeightsValid}
            addPortfolioAsset={addPortfolioAsset}
            updatePortfolioWeight={updatePortfolioWeight}
            removePortfolioAsset={removePortfolioAsset}
            portfolioResult={portfolioResult}
            setPortfolioResult={setPortfolioResult}
            portfolioLoading={portfolioLoading}
            portfolioError={portfolioError}
            runPortfolioAnalysis={runPortfolioAnalysis}
            scenarioShocks={scenarioShocks}
            setScenarioShocks={setScenarioShocks}
            scenarioResult={scenarioResult}
            setScenarioResult={setScenarioResult}
            scenarioLoading={scenarioLoading}
            scenarioError={scenarioError}
            setScenarioError={setScenarioError}
            runScenarioAnalysis={runScenarioAnalysis}
            historicalStartDate={historicalStartDate}
            setHistoricalStartDate={setHistoricalStartDate}
            historicalEndDate={historicalEndDate}
            setHistoricalEndDate={setHistoricalEndDate}
            historicalResult={historicalResult}
            setHistoricalResult={setHistoricalResult}
            historicalLoading={historicalLoading}
            historicalError={historicalError}
            setHistoricalError={setHistoricalError}
            runHistoricalBacktest={runHistoricalBacktest}
            historicalStressResult={historicalStressResult}
            historicalStressLoading={historicalStressLoading}
            historicalStressError={historicalStressError}
            runHistoricalStressTest={runHistoricalStressTest}
            portfolioBenchmarkResult={portfolioBenchmarkResult}
            portfolioBenchmarkLoading={portfolioBenchmarkLoading}
            portfolioBenchmarkError={portfolioBenchmarkError}
            runPortfolioBenchmarkComparison={runPortfolioBenchmarkComparison}
          />
        )}

        {activePage === "data-status" && (
          <DataStatusPage
            freshness={freshness}
            freshnessError={freshnessError}
            refreshStatus={refreshStatus}
            refreshStatusError={refreshStatusError}
          />
        )}

        {activePage === "ai-analysis" && <AIAnalysisPage />}

        <footer className="footer">
          <span>MarketLens Â· Research &amp; Risk Analytics</span>
          <span>Educational use only Â· Not investment advice</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
