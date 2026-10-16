
from pathlib import Path

import pandas as pd
import yfinance as yf


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "raw"


def fetch_market_data(
    ticker: str = "AAPL",
    period: str = "1y",
) -> pd.DataFrame:
    """Fetch and validate daily historical market prices."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")

    history = yf.Ticker(ticker).history(
        period=period,
        interval="1d",
        auto_adjust=True,
    )

    if history.empty:
        raise ValueError(
            f"No historical data returned for {ticker}. "
            "Check the symbol, connection, and data availability."
        )

    required_columns = ["Open", "High", "Low", "Close", "Volume"]

    missing = [
        column for column in required_columns
        if column not in history.columns
    ]

    if missing:
        raise ValueError(
            f"Missing required columns: {missing}"
        )

    history = history[required_columns].copy()
    history.index.name = "Date"

    if history.index.has_duplicates:
        raise ValueError("Duplicate dates found in market data.")

    if history[required_columns].isna().any().any():
        raise ValueError("Missing values found in market data.")

    price_columns = ["Open", "High", "Low", "Close"]

    if (history[price_columns] <= 0).any().any():
        raise ValueError("Non-positive prices found in market data.")

    if (history["Volume"] < 0).any():
        raise ValueError("Negative volume found in market data.")

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    output_path = DATA_DIR / f"{ticker}_daily.csv"
    history.to_csv(output_path)

    print(f"Ticker: {ticker}")
    print(f"Rows downloaded: {len(history)}")
    print(f"Date range: {history.index.min()} to {history.index.max()}")
    print(f"Saved to: {output_path}")
    print()
    print(history.tail())

    return history


if __name__ == "__main__":
    fetch_market_data()
