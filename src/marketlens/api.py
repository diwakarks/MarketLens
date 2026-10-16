
from fastapi import FastAPI, HTTPException

from src.marketlens.analytics import calculate_metrics
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
def get_stock_metrics(ticker: str) -> dict:
    """Calculate historical performance and risk metrics."""
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

    _, summary = calculate_metrics(market_data)

    return {
        "ticker": ticker,
        "metrics": summary,
    }
