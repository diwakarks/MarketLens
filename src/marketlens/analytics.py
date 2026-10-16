
from pathlib import Path

import numpy as np
import pandas as pd
from src.marketlens.database import load_market_data_from_db


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DATA_DIR = PROJECT_ROOT / "data" / "processed"


def load_market_data(ticker: str = "AAPL") -> pd.DataFrame:
    """Load historical market data from a CSV file."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")

    file_path = RAW_DATA_DIR / f"{ticker}_daily.csv"

    if not file_path.exists():
        raise FileNotFoundError(
            f"Market data not found: {file_path}. "
            "Run the data-fetching script first."
        )

    
    data = pd.read_csv(
        file_path,
        index_col="Date",
    )

    data.index = pd.to_datetime(data.index, errors="raise", utc=True)


    if data.empty:
        raise ValueError(f"The data file for {ticker} is empty.")

    if "Close" not in data.columns:
        raise ValueError("The data must contain a Close column.")

    if data.index.has_duplicates:
        raise ValueError("Duplicate dates found in the data.")

    data = data.sort_index()

    if data["Close"].isna().any():
        raise ValueError("Missing closing prices found.")

    if (data["Close"] <= 0).any():
        raise ValueError("Closing prices must be positive.")

    return data


def calculate_metrics(data: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Calculate historical returns and risk metrics."""
    if "Close" not in data.columns:
        raise ValueError("The data must contain a Close column.")

    close = data["Close"].astype(float)

    if close.empty:
        raise ValueError("Cannot analyze an empty dataset.")

    if close.isna().any() or (close <= 0).any():
        raise ValueError("Closing prices must be positive and non-missing.")

    # Percentage change from the previous trading session.
    daily_returns = close.pct_change(fill_method=None)

    # Growth of one unit invested at the first available closing price.
    cumulative_returns = (1 + daily_returns).cumprod() - 1

    # Annualized standard deviation of daily returns.
    valid_returns = daily_returns.dropna()

    if len(valid_returns) >= 2:
        annualized_volatility = (
            valid_returns.std(ddof=1) * np.sqrt(252)
        )
    else:
        annualized_volatility = float("nan")

    # Drawdown measures the decline from a previous closing-price peak.
    running_peak = close.cummax()
    drawdown = close / running_peak - 1

    analysis = data.copy()
    analysis["Daily_Return"] = daily_returns
    analysis["Cumulative_Return"] = cumulative_returns
    analysis["Drawdown"] = drawdown

    summary = {
        "observations": len(close),
        "start_date": str(close.index.min().date()),
        "end_date": str(close.index.max().date()),
        "starting_close": float(close.iloc[0]),
        "ending_close": float(close.iloc[-1]),
        "total_return": float(close.iloc[-1] / close.iloc[0] - 1),
        "annualized_volatility": float(annualized_volatility),
        "maximum_drawdown": float(drawdown.min()),
    }

    return analysis, summary


def main() -> None:
    ticker = "AAPL"

    market_data = load_market_data_from_db(ticker)
    analysis, summary = calculate_metrics(market_data)

    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)

    output_path = PROCESSED_DATA_DIR / f"{ticker}_analysis.csv"
    analysis.to_csv(output_path)

    print(f"\nMarketLens Analytics: {ticker}")
    print("-" * 42)

    for key, value in summary.items():
        if key in {
            "total_return",
            "annualized_volatility",
            "maximum_drawdown",
        }:
            print(f"{key}: {value:.2%}")
        else:
            print(f"{key}: {value}")

    print(f"\nSource: PostgreSQL")
    print(f"Analysis saved to: {output_path}")


if __name__ == "__main__":
    main()
