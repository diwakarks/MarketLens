
from datetime import date
import numpy as np
import pandas as pd
import yfinance as yf

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

from src.marketlens.analytics import (
    calculate_historical_portfolio_stress,
    calculate_metrics,
    calculate_portfolio_analytics,
    calculate_portfolio_benchmark_comparison,
    calculate_sharpe_ratio,
    calculate_benchmark_comparison,
    calculate_beta_alpha,
    calculate_value_at_risk,
    calculate_expected_shortfall,
    calculate_drawdown_recovery,
    generate_market_insights,
    calculate_portfolio_scenario,
)
from src.marketlens.database import (
    get_connection,
    load_market_data_from_db,
    get_data_freshness,
    get_refresh_status,
    download_and_import_market_data,
)

from src.marketlens.ai_analyst import (
    AIAnalystError,
    answer_market_question,
    answer_portfolio_question,
)

app = FastAPI(
    title="MarketLens API",
    description=(
        "Historical market performance and risk analytics."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def filter_market_data_by_date(
    market_data,
    start_date: date | None = None,
    end_date: date | None = None,
):
    """Filter market observations by inclusive trading dates."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="start_date must be on or before end_date.",
        )

    trading_dates = market_data.index.date
    mask = [True] * len(market_data)

    if start_date:
        mask = [
            keep and trading_date >= start_date
            for keep, trading_date in zip(mask, trading_dates)
        ]

    if end_date:
        mask = [
            keep and trading_date <= end_date
            for keep, trading_date in zip(mask, trading_dates)
        ]

    filtered = market_data.loc[mask]

    if filtered.empty:
        raise HTTPException(
            status_code=404,
            detail="No market data exists within the requested date range.",
        )

    return filtered

def get_benchmark_details(ticker: str) -> dict[str, str]:
    """Choose a benchmark based on the instrument's market."""
    ticker = ticker.strip().upper()

    if ticker.endswith((".NS", ".BO")):
        return {
            "ticker": "^NSEI",
            "name": "NIFTY 50",
        }

    return {
        "ticker": "^GSPC",
        "name": "S&P 500",
    }

def get_portfolio_benchmark_details(
    tickers: list[str],
) -> dict[str, str]:
    """Require a portfolio to contain equities from one supported market."""
    normalized = [ticker.strip().upper() for ticker in tickers]

    if not normalized or any(not ticker for ticker in normalized):
        raise ValueError("At least one valid portfolio ticker is required.")

    if any(ticker in {"^GSPC", "^NSEI"} for ticker in normalized):
        raise ValueError(
            "Benchmark indices cannot be portfolio holdings."
        )

    indian = [
        ticker.endswith((".NS", ".BO"))
        for ticker in normalized
    ]

    if all(indian):
        return {"ticker": "^NSEI", "name": "NIFTY 50"}

    if any(indian):
        raise ValueError(
            "Mixed Indian and US portfolios are not supported yet. "
            "Create separate portfolios for each market."
        )

    return {"ticker": "^GSPC", "name": "S&P 500"}

@app.get("/health", tags=["System"])
def health_check() -> dict:
    """Check whether the API process is running."""
    return {"status": "ok"}

@app.get("/stocks/search", tags=["Stocks"])
def search_stocks(q: str = "") -> list[dict]:
    """Search for instruments using Yahoo Finance."""
    query = q.strip()

    if len(query) < 2:
        return []

    try:
        search = yf.Search(query, max_results=10)
        quotes = search.quotes or []
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Stock search provider is temporarily unavailable.",
        ) from exc

    results = []

    for item in quotes:
        symbol = item.get("symbol")
        if not symbol:
            continue

        ticker = symbol.strip().upper()
        instrument_type = item.get("quoteType")
        name = (
            item.get("longname")
            or item.get("shortname")
            or ticker
        )

        # Support Indian-listed ordinary equities only for now.
        if instrument_type != "EQUITY":
            continue

        if ticker.endswith(".NS"):
            exchange = "NSE"
            currency = "INR"
        elif ticker.endswith(".BO"):
            exchange = "BSE"
            currency = "INR"
        else:
            continue

        # Exclude obvious fund/ETF results from the equity workflow.
        name_lower = name.lower()
        if " etf" in name_lower or name_lower.endswith(" fund"):
            continue

        results.append({
            "ticker": ticker,
            "name": name,
            "exchange": exchange,
            "currency": currency,
            "instrument_type": instrument_type,
            "already_added": False,
        })

    results = [
        item
        for item in results
        if item["instrument_type"] == "EQUITY"
        and (
            item["ticker"].endswith(".NS")
            or item["ticker"].endswith(".BO")
        )
    ]

    if results:
        tickers = [item["ticker"] for item in results]

        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT ticker
                    FROM instruments
                    WHERE ticker = ANY(%s)
                    """,
                    (tickers,),
                )
                existing = {row[0] for row in cursor.fetchall()}

        for item in results:
            item["already_added"] = item["ticker"] in existing

    return results

@app.post("/stocks/import", tags=["Stocks"])
def import_stock(
    ticker: str,
    name: str,
    exchange: str,
    currency: str = "INR",
) -> dict:
    """Download and import historical prices for a supported instrument."""
    try:
        rows_imported = download_and_import_market_data(
            ticker,
            name=name,
            exchange=exchange,
            currency=currency,
        )
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to download or import market data.",
        ) from exc

    return {
        "ticker": ticker.strip().upper(),
        "rows_imported": rows_imported,
        "status": "success",
    }

@app.get("/stocks", tags=["Stocks"])
def list_stocks() -> list[dict]:
    """List instruments registered in PostgreSQL."""
    query = """
        SELECT ticker, name, exchange, currency
        FROM instruments
        ORDER BY ticker;
    """

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query)
            rows = cursor.fetchall()

    return [
        {
            "ticker": row[0],
            "name": row[1],
            "exchange": row[2],
            "currency": row[3],
        }
        for row in rows
    ]


@app.get("/stocks/{ticker}/metrics", tags=["Analytics"])
def get_stock_metrics(
    ticker: str,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    """Calculate historical performance, risk, and Sharpe ratio."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise HTTPException(
            status_code=400,
            detail="Ticker symbol cannot be empty.",
        )
    benchmark = get_benchmark_details(ticker)

    try:
        market_data = load_market_data_from_db(ticker)
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    market_data = filter_market_data_by_date(
        market_data,
        start_date,
        end_date,
    )

    _, summary = calculate_metrics(market_data)

    try:
        summary["sharpe_ratio"] = calculate_sharpe_ratio(market_data)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Unable to calculate Sharpe ratio: {exc}",
        ) from exc

    try:
        benchmark_data = load_market_data_from_db(benchmark["ticker"])
        benchmark_data = filter_market_data_by_date(
            benchmark_data,
            start_date,
            end_date,
        )

        beta_alpha = calculate_beta_alpha(
            market_data,
            benchmark_data,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Unable to calculate Beta and Alpha: {exc}",
        ) from exc

    summary.update(beta_alpha)

    summary["value_at_risk_95"] = calculate_value_at_risk(
        market_data,
        confidence_level=0.95,
    )
    summary["expected_shortfall_95"] = calculate_expected_shortfall(
        market_data,
        confidence_level=0.95,
    )
    return {
        "ticker": ticker,
        "benchmark": benchmark["ticker"],
        "benchmark_name": benchmark["name"],
        "metrics": summary,
    }
    


@app.get("/stocks/{ticker}/history", tags=["Analytics"])
def get_stock_history(
    ticker: str,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    """Return historical daily OHLCV data for a registered stock."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise HTTPException(
            status_code=400,
            detail="Ticker symbol cannot be empty.",
        )

    try:
        market_data = load_market_data_from_db(ticker)
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    market_data = filter_market_data_by_date(
        market_data, start_date, end_date
    )

    history = market_data.reset_index()
    date_column = history.columns[0]
    history = history.rename(columns={date_column: "date"})

    history["date"] = history["date"].apply(
        lambda value: value.strftime("%Y-%m-%d")
        if hasattr(value, "strftime")
        else str(value)[:10]
    )

    required_columns = [
        "date", "Open", "High", "Low", "Close", "Volume"
    ]
    missing_columns = [
        column
        for column in required_columns
        if column not in history.columns
    ]

    if missing_columns:
        raise HTTPException(
            status_code=500,
            detail=f"Historical data is missing columns: {missing_columns}",
        )

    records = history[required_columns].to_dict(orient="records")

    return {
        "ticker": ticker,
        "count": len(records),
        "history": records,
    }


@app.get("/stocks/{ticker}/freshness")
def get_stock_freshness(ticker: str):
    """Return the latest stored-data and import freshness information."""
    try:
        return get_data_freshness(ticker)
    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error),
        ) from error


@app.get("/stocks/{ticker}/refresh-status")
def stock_refresh_status(ticker: str):
    """Return the latest provider and database refresh outcomes."""
    try:
        return get_refresh_status(ticker)
    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error),
        ) from error


@app.get("/stocks/{ticker}/analytics-series", tags=["Analytics"])
def get_stock_analytics_series(
    ticker: str,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    """Return cumulative returns and drawdown for a date range."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise HTTPException(
            status_code=400,
            detail="Ticker symbol cannot be empty.",
        )

    try:
        market_data = load_market_data_from_db(ticker)
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    market_data = filter_market_data_by_date(
        market_data, start_date, end_date
    )

    analysis, _ = calculate_metrics(market_data)

    series = analysis.reset_index()
    date_column = series.columns[0]
    series = series.rename(columns={date_column: "date"})

    series["date"] = series["date"].apply(
        lambda value: value.strftime("%Y-%m-%d")
        if hasattr(value, "strftime")
        else str(value)[:10]
    )

    series["Cumulative_Return"] = (
        series["Cumulative_Return"].fillna(0.0)
    )

    records = series[
        ["date", "Close", "Cumulative_Return", "Drawdown"]
    ].to_dict(orient="records")

    return {
        "ticker": ticker,
        "count": len(records),
        "series": records,
    }


@app.get("/stocks/{ticker}/benchmark-comparison", tags=["Analytics"])
def get_benchmark_comparison(
    ticker: str,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    """Compare a stock's cumulative return against the S&P 500."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise HTTPException(
            status_code=400,
            detail="Ticker symbol cannot be empty.",
        )
    benchmark = get_benchmark_details(ticker)

    try:
        stock_data = load_market_data_from_db(ticker)
        benchmark_data = load_market_data_from_db(benchmark["ticker"])
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    stock_data = filter_market_data_by_date(
        stock_data, start_date, end_date
    )
    benchmark_data = filter_market_data_by_date(
        benchmark_data, start_date, end_date
    )

    try:
        comparison = calculate_benchmark_comparison(
            stock_data,
            benchmark_data,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    series = comparison.reset_index()
    series = series.rename(columns={series.columns[0]: "date"})
    series["date"] = series["date"].apply(
        lambda value: value.strftime("%Y-%m-%d")
        if hasattr(value, "strftime")
        else str(value)[:10]
    )

    records = series[
        [
            "date",
            "Stock_Return",
            "Benchmark_Return",
            "Relative_Performance",
        ]
    ].to_dict(orient="records")

    return {
        "ticker": ticker,
        "benchmark": benchmark["ticker"],
        "benchmark_name": benchmark["name"],
        "count": len(records),
        "series": records,
    }


@app.get("/stocks/{ticker}/drawdown-recovery", tags=["Analytics"])
def get_drawdown_recovery(
    ticker: str,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    """Compare stock and benchmark drawdown/recovery on shared dates."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise HTTPException(
            status_code=400,
            detail="Ticker symbol cannot be empty.",
        )
    benchmark = get_benchmark_details(ticker)

    try:
        stock_data = load_market_data_from_db(ticker)
        benchmark_data = load_market_data_from_db(benchmark["ticker"])

        stock_data = filter_market_data_by_date(
            stock_data, start_date, end_date
        )
        benchmark_data = filter_market_data_by_date(
            benchmark_data, start_date, end_date
        )

        aligned = stock_data[["Close"]].rename(
            columns={"Close": "Stock_Close"}
        ).join(
            benchmark_data[["Close"]].rename(
                columns={"Close": "Benchmark_Close"}
            ),
            how="inner",
        ).sort_index()

        if aligned.empty:
            raise HTTPException(
                status_code=404,
                detail="Stock and benchmark have no shared trading dates.",
            )

        stock_aligned = aligned[["Stock_Close"]].rename(
            columns={"Stock_Close": "Close"}
        )
        benchmark_aligned = aligned[["Benchmark_Close"]].rename(
            columns={"Benchmark_Close": "Close"}
        )

        stock_summary = calculate_drawdown_recovery(stock_aligned)
        benchmark_summary = calculate_drawdown_recovery(benchmark_aligned)

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    aligned["Stock_Close"] = pd.to_numeric(
        aligned["Stock_Close"], errors="coerce"
    ).astype("float64")

    aligned["Benchmark_Close"] = pd.to_numeric(
        aligned["Benchmark_Close"], errors="coerce"
    ).astype("float64")
    stock_drawdown = (
        aligned["Stock_Close"] / aligned["Stock_Close"].cummax() - 1.0
    )
    benchmark_drawdown = (
        aligned["Benchmark_Close"]
        / aligned["Benchmark_Close"].cummax()
        - 1.0
    )

    series = [
        {
            "date": timestamp.date().isoformat(),
            "stock_drawdown": float(stock_drawdown.iloc[pos]),
            "benchmark_drawdown": float(benchmark_drawdown.iloc[pos]),
        }
        for pos, timestamp in enumerate(aligned.index)
    ]

    return {
        "ticker": ticker,
        "benchmark": benchmark["ticker"],
        "benchmark_name": benchmark["name"],
        "count": len(series),
        "stock": stock_summary,
        "benchmark_analysis": benchmark_summary,
        "maximum_drawdown_difference": (
            stock_summary["maximum_drawdown"]
            - benchmark_summary["maximum_drawdown"]
        ),
        "series": series,
    }

@app.get("/stocks/{ticker}/insights", tags=["Analytics"])
def get_market_insights(
    ticker: str,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    """Return deterministic stock-versus-benchmark insights."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise HTTPException(
            status_code=400,
            detail="Ticker symbol cannot be empty.",
        )

    benchmark = get_benchmark_details(ticker)

    try:
        stock_data = load_market_data_from_db(ticker)
        benchmark_data = load_market_data_from_db(
            benchmark["ticker"]
        )

        stock_data = filter_market_data_by_date(
            stock_data, start_date, end_date
        )
        benchmark_data = filter_market_data_by_date(
            benchmark_data, start_date, end_date
        )

        return generate_market_insights(
            stock_data=stock_data,
            benchmark_data=benchmark_data,
            ticker=ticker,
            benchmark_ticker=benchmark["ticker"],
            benchmark_name=benchmark["name"],
        )

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

class PortfolioAnalyticsRequest(BaseModel):
    tickers: list[str] = Field(min_length=1)
    weights: list[float] = Field(min_length=1)
    initial_value: float = Field(default=10_000.0, gt=0)
    risk_free_rate: float = Field(default=0.0, ge=0)
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_portfolio(self):
        if len(self.tickers) != len(self.weights):
            raise ValueError("Tickers and weights must have equal lengths.")

        normalized = [ticker.strip().upper() for ticker in self.tickers]
        if any(not ticker for ticker in normalized):
            raise ValueError("Ticker symbols cannot be empty.")

        if len(set(normalized)) != len(normalized):
            raise ValueError("Duplicate ticker symbols are not allowed.")

        if any(not np.isfinite(weight) for weight in self.weights):
            raise ValueError("Weights must be finite.")

        if any(weight < 0 for weight in self.weights):
            raise ValueError("Weights must be non-negative.")

        if not np.isclose(sum(self.weights), 1.0):
            raise ValueError("Weights must sum to 1.0 (100%).")

        self.tickers = normalized
        return self


@app.post("/portfolio/analytics", tags=["Portfolio"])
def get_portfolio_analytics(request: PortfolioAnalyticsRequest) -> dict:
    """Calculate historical analytics for a daily-rebalanced portfolio."""
    try:
        market_data = {
            ticker: load_market_data_from_db(ticker)
            for ticker in request.tickers
        }

        market_data = {
            ticker: filter_market_data_by_date(
                data,
                request.start_date,
                request.end_date,
            )
            for ticker, data in market_data.items()
        }

        return calculate_portfolio_analytics(
            market_data=market_data,
            weights=dict(zip(request.tickers, request.weights)),
            initial_value=request.initial_value,
            risk_free_rate=request.risk_free_rate,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class PortfolioScenarioRequest(BaseModel):
    tickers: list[str]
    weights: list[float]
    shocks: list[float]
    initial_value: float = 10_000.0


@app.post("/portfolio/scenario")
def portfolio_scenario(request: PortfolioScenarioRequest):
    if not (
        len(request.tickers)
        == len(request.weights)
        == len(request.shocks)
    ):
        raise HTTPException(
            status_code=422,
            detail="Tickers, weights, and shocks must have equal lengths.",
        )

    tickers = [ticker.strip().upper() for ticker in request.tickers]

    if any(not ticker for ticker in tickers):
        raise HTTPException(
            status_code=422,
            detail="Ticker names cannot be empty.",
        )

    if len(set(tickers)) != len(tickers):
        raise HTTPException(
            status_code=422,
            detail="Ticker names must be unique.",
        )

    weights = dict(zip(tickers, request.weights))
    shocks = dict(zip(tickers, request.shocks))

    try:
        return calculate_portfolio_scenario(
            weights=weights,
            shocks=shocks,
            initial_value=request.initial_value,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

class HistoricalPortfolioScenarioRequest(BaseModel):
    tickers: list[str]
    weights: list[float]
    start_date: date
    end_date: date
    initial_value: float = 10000.0

@app.post("/portfolio/historical-scenario")
def historical_portfolio_scenario(
    request: HistoricalPortfolioScenarioRequest,
):
    from src.marketlens.analytics import (
        calculate_historical_portfolio_scenario,
    )
    from src.marketlens.database import load_market_data_from_db

    if len(request.tickers) != len(request.weights):
        raise HTTPException(
            status_code=400,
            detail="Tickers and weights must have the same length.",
        )

    tickers = [ticker.strip().upper() for ticker in request.tickers]

    if any(not ticker for ticker in tickers):
        raise HTTPException(
            status_code=400,
            detail="Ticker names cannot be blank.",
        )

    if len(set(tickers)) != len(tickers):
        raise HTTPException(
            status_code=400,
            detail="Ticker names must be unique.",
        )

    market_data = {}

    for ticker in tickers:
        data = load_market_data_from_db(ticker)

        if data is None or data.empty:
            raise HTTPException(
                status_code=404,
                detail=f"No market data found for {ticker}.",
            )

        market_data[ticker] = data

    weights = dict(zip(tickers, request.weights))

    try:
        return calculate_historical_portfolio_scenario(
            market_data=market_data,
            weights=weights,
            start_date=request.start_date.isoformat(),
            end_date=request.end_date.isoformat(),
            initial_value=request.initial_value,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class PortfolioBenchmarkComparisonRequest(BaseModel):
    tickers: list[str]
    weights: list[float]
    start_date: date
    end_date: date
    initial_value: float = 10_000.0
@app.post("/portfolio/benchmark-comparison")
def portfolio_benchmark_comparison(
    request: PortfolioBenchmarkComparisonRequest,
):
    if len(request.tickers) != len(request.weights):
        raise HTTPException(
            status_code=400,
            detail="Tickers and weights must have the same length.",
        )

    tickers = [ticker.strip().upper() for ticker in request.tickers]

    if not tickers or any(not ticker for ticker in tickers):
        raise HTTPException(
            status_code=400,
            detail="At least one valid portfolio ticker is required.",
        )

    if len(set(tickers)) != len(tickers):
        raise HTTPException(
            status_code=400,
            detail="Portfolio tickers must be unique.",
        )

    benchmark_tickers = {"^GSPC", "^NSEI"}

    if benchmark_tickers.intersection(tickers):
        raise HTTPException(
            status_code=400,
            detail="Benchmark indices cannot be portfolio holdings.",
        )

    if request.start_date > request.end_date:
        raise HTTPException(
            status_code=400,
            detail="Start date must be on or before end date.",
        )

    try:
        weights = dict(zip(tickers, request.weights))
        benchmark = get_portfolio_benchmark_details(tickers)

        market_data = {
            ticker: load_market_data_from_db(ticker)
            for ticker in tickers
        }
        market_data[benchmark["ticker"]] = load_market_data_from_db(
            benchmark["ticker"]
        )
        filtered_data = {
            ticker: filter_market_data_by_date(
                frame,
                request.start_date,
                request.end_date,
            )
            for ticker, frame in market_data.items()
        }

        benchmark_data = filtered_data.pop(benchmark["ticker"])


        return calculate_portfolio_benchmark_comparison(
            market_data=filtered_data,
            weights=weights,
            benchmark_data=benchmark_data,
            initial_value=request.initial_value,
            benchmark_ticker=benchmark["ticker"],
        )

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise


class HistoricalPortfolioStressRequest(BaseModel):
    tickers: list[str]
    weights: list[float]
    start_date: date
    end_date: date
    initial_value: float = 10_000.0


@app.post("/portfolio/historical-stress")
def historical_portfolio_stress(
    request: HistoricalPortfolioStressRequest,
):
    if len(request.tickers) != len(request.weights):
        raise HTTPException(
            status_code=400,
            detail="Tickers and weights must have the same length.",
        )

    tickers = [ticker.strip().upper() for ticker in request.tickers]

    if not tickers or any(not ticker for ticker in tickers):
        raise HTTPException(
            status_code=400,
            detail="At least one valid portfolio ticker is required.",
        )

    if len(set(tickers)) != len(tickers):
        raise HTTPException(
            status_code=400,
            detail="Portfolio tickers must be unique.",
        )

    if request.start_date > request.end_date:
        raise HTTPException(
            status_code=400,
            detail="Start date must be on or before end date.",
        )

    try:
        weights = dict(zip(tickers, request.weights))
        market_data = {
            ticker: load_market_data_from_db(ticker)
            for ticker in tickers
        }

        filtered_data = {
            ticker: filter_market_data_by_date(
                frame,
                request.start_date,
                request.end_date,
            )
            for ticker, frame in market_data.items()
        }

        return calculate_historical_portfolio_stress(
            market_data=filtered_data,
            weights=weights,
            start_date=request.start_date,
            end_date=request.end_date,
            initial_value=request.initial_value,
        )

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise


# AI ahead


class AIAnalystRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    ticker: str = Field(default="AAPL", min_length=1, max_length=15)
    start_date: date | None = None
    end_date: date | None = None


@app.post("/ai/ask", tags=["AI Analyst"])
def ask_ai_analyst(request: AIAnalystRequest) -> dict:
    question = request.question.strip()
    ticker = request.ticker.strip().upper()

    if len(question) < 3:
        raise HTTPException(
            status_code=422,
            detail="Please enter a more specific question.",
        )

    if (
        request.start_date
        and request.end_date
        and request.start_date > request.end_date
    ):
        raise HTTPException(
            status_code=400,
            detail="start_date must be on or before end_date.",
        )

    try:
        market_data = load_market_data_from_db(ticker)

        if market_data is None or market_data.empty:
            raise HTTPException(
                status_code=404,
                detail=f"No market data is available for {ticker}.",
            )

        market_data = filter_market_data_by_date(
            market_data,
            request.start_date,
            request.end_date,
        )

        _, metrics = calculate_metrics(market_data)

        answer = answer_market_question(
            question=question,
            ticker=ticker,
            metrics=metrics,
        )

        return {
            "ticker": ticker,
            "start_date": str(market_data.index.min().date()),
            "end_date": str(market_data.index.max().date()),
            "metrics": metrics,
            "answer": answer,
            "disclaimer": (
                "Historical analytics and AI-generated explanation only; "
                "not personalized financial advice."
            ),
        }

    except HTTPException:
        raise
    except AIAnalystError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="The AI Analyst could not process this request.",
        ) from exc

class PortfolioAIAnalystRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    tickers: list[str] = Field(min_length=1, max_length=20)
    weights: list[float] = Field(min_length=1, max_length=20)
    initial_value: float = Field(default=10_000.0, gt=0)
    risk_free_rate: float = Field(default=0.0, ge=0)
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_portfolio(self):
        if len(self.tickers) != len(self.weights):
            raise ValueError(
                "Tickers and weights must have equal lengths."
            )

        self.tickers = [ticker.strip().upper() for ticker in self.tickers]

        if any(not ticker for ticker in self.tickers):
            raise ValueError("Ticker symbols cannot be empty.")

        if len(set(self.tickers)) != len(self.tickers):
            raise ValueError("Duplicate ticker symbols are not allowed.")

        if any(not np.isfinite(weight) or weight < 0
               for weight in self.weights):
            raise ValueError("Weights must be finite and non-negative.")

        if not np.isclose(sum(self.weights), 1.0):
            raise ValueError("Weights must sum to 1.0 (100%).")

        if (
            self.start_date
            and self.end_date
            and self.start_date > self.end_date
        ):
            raise ValueError(
                "start_date must be on or before end_date."
            )

        return self


@app.post("/ai/portfolio-ask", tags=["AI Analyst"])
def ask_portfolio_analyst(

    request: PortfolioAIAnalystRequest,
) -> dict:
    """Explain computed portfolio analytics and benchmark results."""
    question = request.question.strip()

    if len(question) < 3:
        raise HTTPException(
            status_code=422,
            detail="Please enter a more specific question.",
        )

    try:
        market_data = {
            ticker: load_market_data_from_db(ticker)
            for ticker in request.tickers
        }

        filtered_data = {
            ticker: filter_market_data_by_date(
                frame,
                request.start_date,
                request.end_date,
            )
            for ticker, frame in market_data.items()
        }

        weights = dict(zip(request.tickers, request.weights))

        portfolio_metrics = calculate_portfolio_analytics(
            market_data=filtered_data,
            weights=weights,
            initial_value=request.initial_value,
            risk_free_rate=request.risk_free_rate,
        )

        # Keep the benchmark comparison on the same date window.
        benchmark = get_portfolio_benchmark_details(request.tickers)

        benchmark_data = load_market_data_from_db(benchmark["ticker"])
        benchmark_data = filter_market_data_by_date(
            benchmark_data,
            request.start_date,
            request.end_date,
        )

        benchmark_metrics = calculate_portfolio_benchmark_comparison(
            market_data=filtered_data,
            weights=weights,
            benchmark_data=benchmark_data,
            initial_value=request.initial_value,
        )

        portfolio_context = {
            "tickers": request.tickers,
            "weights": weights,
            "start_date": (
                request.start_date.isoformat()
                if request.start_date
                else None
            ),
            "end_date": (
                request.end_date.isoformat()
                if request.end_date
                else None
            ),
            "initial_value": request.initial_value,
            "risk_free_rate": request.risk_free_rate,
            "portfolio_analytics": portfolio_metrics,
            "benchmark_comparison": benchmark_metrics,
        }

        answer = answer_portfolio_question(
            question=question,
            portfolio_context=portfolio_context,
        )

        return {
            "question": question,
            "portfolio": portfolio_context,
            "answer": answer,
            "disclaimer": (
                "Historical analytics and AI-generated explanations only; "
                "not personalized financial advice."
            ),
        }

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
    except AIAnalystError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        # Keep implementation details out of the API response.
        raise HTTPException(
            status_code=500,
            detail="The portfolio AI Analyst could not process this request.",
        ) from exc