
from datetime import date

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.marketlens.analytics import (
    calculate_metrics,
    calculate_sharpe_ratio,
    calculate_benchmark_comparison,
    calculate_beta_alpha,
)
from src.marketlens.database import (
    get_connection,
    load_market_data_from_db,
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
    allow_credentials=False,
    allow_methods=["GET"],
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


@app.get("/health", tags=["System"])
def health_check() -> dict:
    """Check whether the API process is running."""
    return {"status": "ok"}


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
        benchmark_data = load_market_data_from_db("^GSPC")
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
    return {
        "ticker": ticker,
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

    try:
        stock_data = load_market_data_from_db(ticker)
        benchmark_data = load_market_data_from_db("^GSPC")
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
        "benchmark": "^GSPC",
        "count": len(records),
        "series": records,
    }
