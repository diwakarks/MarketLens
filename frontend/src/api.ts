
const API_BASE_URL = "http://127.0.0.1:8000";

export interface Stock {
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
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
}

export interface StockMetricsResponse {
  ticker: string;
  metrics: StockMetrics;
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    let message = `API request failed (${response.status})`;

    try {
      const body = await response.json();
      if (typeof body.detail === "string") {
        message = body.detail;
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

function buildDateParams(
  startDate?: string,
  endDate?: string,
): string {
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
  ticker: string;
  benchmark: string;
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