const API_BASE_URL = "http://127.0.0.1:8000";

export interface Stock {
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
}

export interface StockSearchResult {
  ticker: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  instrument_type: string | null;
  already_added: boolean;
}

export interface StockMetrics {
  observations: number;
  start_date: string;
  end_date: string;
  starting_close: number;
  ending_close: number;
  total_return: number;
  annualized_volatility: number;
  maximum_drawdown: number;
  sharpe_ratio: number;
  beta: number;
  alpha_annual: number;
  value_at_risk_95: number;
  expected_shortfall_95: number;
}


export interface DataFreshness {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
  stored_rows: number;
  latest_trade_date: string | null;
  last_successful_import: string | null;
  provider: RefreshStageStatus | null;
  database_import: RefreshStageStatus | null;
  data_status: "available" | "no_data";
}


export interface StockMetricsResponse {
  ticker: string;
  metrics: StockMetrics;
  benchmark_name: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, options);

  if (!response.ok) {
    let message = `API request failed (${response.status})`;

    try {
      const body = await response.json();

      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (Array.isArray(body.detail)) {
        message = body.detail
          .map((item: { msg?: string }) => item.msg ?? "Invalid request")
          .join("; ");
      }
    } catch {
      // Keep the default message if the response isn't JSON.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}


export function getStocks(): Promise<Stock[]> {
  return request<Stock[]>("/stocks");
}

export async function searchStocks(
  query: string,
): Promise<StockSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  return request<StockSearchResult[]>(
    `/stocks/search?${params.toString()}`,
  );
}

export async function importStock(
  stock: StockSearchResult,
): Promise<{ ticker: string; rows_imported: number; status: string }> {
  if (!stock.exchange || !stock.currency) {
    throw new Error(
      "Exchange or currency metadata is missing for this instrument.",
    );
  }

  const params = new URLSearchParams({
    ticker: stock.ticker,
    name: stock.name,
    exchange: stock.exchange,
    currency: stock.currency,
  });

  return request(
    `/stocks/import?${params.toString()}`,
    { method: "POST" },
  );
}


export function getStockMetrics(
  ticker: string,
  startDate?: string,
  endDate?: string,
): Promise<StockMetricsResponse> {
  return request(
    `/stocks/${encodeURIComponent(ticker)}/metrics${buildDateParams(startDate, endDate)}`,
  );
}

export interface DailyPrice {
  date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

export interface StockHistoryResponse {
  ticker: string;
  count: number;
  history: DailyPrice[];
}

export function getStockHistory(
  ticker: string,
  startDate?: string,
  endDate?: string,
): Promise<StockHistoryResponse> {
  return request(
    `/stocks/${encodeURIComponent(ticker)}/history${buildDateParams(startDate, endDate)}`,
  );
}

export interface AnalyticsPoint {
  date: string;
  Close: number;
  Cumulative_Return: number;
  Drawdown: number;
}

export interface AnalyticsSeriesResponse {
  ticker: string;
  count: number;
  series: AnalyticsPoint[];
}
export function getAnalyticsSeries(
  ticker: string,
  startDate?: string,
  endDate?: string,
): Promise<AnalyticsSeriesResponse> {
  return request(
    `/stocks/${encodeURIComponent(ticker)}/analytics-series${buildDateParams(startDate, endDate)}`,
  );
}

function buildDateParams(startDate?: string, endDate?: string): string {
  const params = new URLSearchParams();

  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export interface BenchmarkPoint {
  date: string;
  Stock_Return: number;
  Benchmark_Return: number;
  Relative_Performance: number;
}

export interface BenchmarkComparisonResponse {
  benchmark?: string;
  benchmark_name?: string;
  ticker: string;
  count: number;
  series: BenchmarkPoint[];
}

export function getBenchmarkComparison(
  ticker: string,
  startDate?: string,
  endDate?: string,
): Promise<BenchmarkComparisonResponse> {
  return request(
    `/stocks/${encodeURIComponent(ticker)}/benchmark-comparison${buildDateParams(
      startDate,
      endDate,
    )}`,
  );
}

export interface DrawdownRecoverySummary {
  maximum_drawdown: number;
  peak_date: string | null;
  peak_close: number | null;
  trough_date: string | null;
  trough_close: number | null;
  recovered: boolean | null;
  recovery_date: string | null;
  recovery_days: number | null;
  recovery_trading_sessions: number | null;
  peak_to_trough_days: number | null;
  peak_to_trough_trading_sessions: number | null;
  status: "recovered" | "not_recovered" | "no_drawdown";
}

export interface DrawdownRecoveryPoint {
  date: string;
  stock_drawdown: number;
  benchmark_drawdown: number;
}

export interface DrawdownRecoveryResponse {
  ticker: string;
  benchmark: string;
  benchmark_name: string;
  count: number;
  stock: DrawdownRecoverySummary;
  benchmark_analysis: DrawdownRecoverySummary;
  maximum_drawdown_difference: number;
  series: DrawdownRecoveryPoint[];
}

export function getDrawdownRecovery(
  ticker: string,
  startDate?: string,
  endDate?: string,
): Promise<DrawdownRecoveryResponse> {
  return request(
    `/stocks/${encodeURIComponent(ticker)}/drawdown-recovery${buildDateParams(
      startDate,
      endDate,
    )}`,
  );
}

export interface MarketInsight {
  category: "performance" | "drawdown" | "recovery";
  priority: number;
  title: string;
  message: string;
  evidence: Record<string, string | number | boolean | null>;
}

export interface MarketInsightsResponse {
  ticker: string;
  benchmark: string;
  benchmark_name: string;
  start_date: string;
  end_date: string;
  shared_trading_dates: number;
  insights: MarketInsight[];
  disclaimer: string;
}

export function getMarketInsights(
  ticker: string,
  startDate?: string,
  endDate?: string,
): Promise<MarketInsightsResponse> {
  return request(
    `/stocks/${encodeURIComponent(ticker)}/insights${buildDateParams(
      startDate,
      endDate,
    )}`,
  );
}

export async function getStockFreshness(
  ticker: string,
): Promise<DataFreshness> {
  return request<DataFreshness>(
    `/stocks/${encodeURIComponent(ticker)}/freshness`,
  );
}

export interface RefreshStageStatus {
  status: "success" | "failed" | "running" | null;
  started_at?: string | null;
  completed_at?: string | null;
  rows_downloaded?: number;
  rows_imported?: number;
  latest_trade_date?: string | null;
  error_message?: string | null;
}

export interface RefreshStatus {
  ticker: string;
  provider: RefreshStageStatus | null;
  database_import: RefreshStageStatus | null;
}

export async function getStockRefreshStatus(
  ticker: string,
): Promise<RefreshStatus> {
  return request<RefreshStatus>(
    `/stocks/${encodeURIComponent(ticker)}/refresh-status`,
  );
}

async function postRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `API request failed (${response.status})`;

    try {
      const result = await response.json();
      if (typeof result.detail === "string") {
        message = result.detail;
      } else if (Array.isArray(result.detail)) {
        message = result.detail
          .map((item: { msg?: string }) => item.msg ?? "Invalid request")
          .join("; ");
      }
    } catch {
      // Keep the default message if the response isn't JSON.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export interface PortfolioPoint {
  date: string;
  portfolio_value: number;
  daily_return: number;
  drawdown: number;
}

export interface PortfolioAnalyticsResponse {
  weights: Record<string, number>;
  initial_value: number;
  final_value: number;
  total_return: number;
  annualized_volatility: number;
  sharpe_ratio: number | null;
  maximum_drawdown: number;
  maximum_drawdown_date: string;
  start_date: string;
  end_date: string;
  shared_trading_dates: number;
  rebalancing: "daily";
  series: PortfolioPoint[];
  concentration: {
    herfindahl_hirschman_index: number;
    effective_number_of_holdings: number | null;
  };
  correlation_matrix: Record<string, Record<string, number | null>>;
  asset_risk_contributions: Record<
    string,
    {
      weight: number;
      annualized_volatility_contribution: number;
      risk_contribution_percent: number | null;
    }
  >;
  annualized_covariance_volatility: number;
}

export interface PortfolioAnalyticsRequest {
  tickers: string[];
  weights: number[];
  initial_value: number;
  risk_free_rate: number;
  start_date?: string;
  end_date?: string;
}

export function getPortfolioAnalytics(
  payload: PortfolioAnalyticsRequest,
): Promise<PortfolioAnalyticsResponse> {
  return postRequest<PortfolioAnalyticsResponse>(
    "/portfolio/analytics",
    payload,
  );
}


export interface ScenarioAssetImpact {
  weight: number;
  shock_return: number;
  portfolio_return_contribution: number;
  pnl_impact: number;
}

export interface PortfolioScenarioResponse {
  initial_value: number;
  final_value: number;
  portfolio_shock_return: number;
  estimated_pnl: number;
  asset_impacts: Record<string, ScenarioAssetImpact>;
  scenario_type: string;
  assumptions: string[];
}

export interface PortfolioScenarioRequest {
  tickers: string[];
  weights: number[];
  shocks: number[];
  initial_value: number;
}

export function getPortfolioScenario(
  payload: PortfolioScenarioRequest,
): Promise<PortfolioScenarioResponse> {
  return postRequest<PortfolioScenarioResponse>(
    "/portfolio/scenario",
    payload,
  );
}

export interface HistoricalAssetImpact {
  weight: number;
  start_price: number;
  end_price: number;
  historical_return: number;
  portfolio_return_contribution: number;
  pnl_impact: number;
}

export interface HistoricalPortfolioScenarioRequest {
  tickers: string[];
  weights: number[];
  start_date: string;
  end_date: string;
  initial_value: number;
}

export interface HistoricalPortfolioScenarioResponse {
  weights: Record<string, number>;
  initial_value: number;
  final_value: number;
  historical_return: number;
  estimated_pnl: number;
  requested_start_date: string;
  requested_end_date: string;
  actual_start_date: string;
  actual_end_date: string;
  shared_trading_dates: number;
  rebalancing: "none";
  asset_impacts: Record<string, HistoricalAssetImpact>;
  assumptions: string[];
}

export function getHistoricalPortfolioScenario(
  payload: HistoricalPortfolioScenarioRequest,
): Promise<HistoricalPortfolioScenarioResponse> {
  return postRequest<HistoricalPortfolioScenarioResponse>(
    "/portfolio/historical-scenario",
    payload,
  );
}


export interface HistoricalStressAssetImpact {
  ticker: string;
  weight: number;
  historical_return: number;
  portfolio_return_contribution: number;
  pnl_impact: number;
}

export interface HistoricalPortfolioStressRequest {
  tickers: string[];
  weights: number[];
  start_date: string;
  end_date: string;
  initial_value: number;
}

export interface HistoricalPortfolioStressResponse {
  start_date: string;
  end_date: string;
  shared_trading_dates: number;
  initial_value: number;
  final_value: number;
  historical_return: number;
  estimated_pnl: number;
  maximum_drawdown: number;
  maximum_drawdown_date: string;
  recovery_date: string | null;
  recovered_within_period: boolean;
  asset_impacts: HistoricalStressAssetImpact[];
  rebalancing: string;
  assumptions: string[];
}


export function getHistoricalPortfolioStress(
  payload: HistoricalPortfolioStressRequest,
): Promise<HistoricalPortfolioStressResponse> {
  return postRequest<HistoricalPortfolioStressResponse>(
    "/portfolio/historical-stress",
    payload,
  );
}


export interface PortfolioBenchmarkComparisonRequest {
  tickers: string[];
  weights: number[];
  start_date: string;
  end_date: string;
  initial_value: number;
}

export interface PortfolioBenchmarkSide {
  return: number;
  final_value: number;
  estimated_pnl: number;
}

export interface PortfolioBenchmarkComparisonResponse {
  initial_value: number;
  start_date: string;
  end_date: string;
  shared_trading_dates: number;
  portfolio: PortfolioBenchmarkSide;
  benchmark: PortfolioBenchmarkSide & {
    ticker: string;
  };
  benchmark_name: string;
  excess_return: number;
  ending_value_difference: number;
  method: string;
  assumptions: string[];
}

export function getPortfolioBenchmarkComparison(
  payload: PortfolioBenchmarkComparisonRequest,
): Promise<PortfolioBenchmarkComparisonResponse> {
  return postRequest<PortfolioBenchmarkComparisonResponse>(
    "/portfolio/benchmark-comparison",
    payload,
  );
}
