
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

def calculate_benchmark_comparison(
    stock_data: pd.DataFrame,
    benchmark_data: pd.DataFrame,
) -> pd.DataFrame:
    """Compare cumulative stock and benchmark returns on shared dates."""
    for name, data in (
        ("Stock", stock_data),
        ("Benchmark", benchmark_data),
    ):
        if "Close" not in data.columns:
            raise ValueError(f"{name} data must contain a Close column.")

        if data.empty:
            raise ValueError(f"{name} data cannot be empty.")

        close = data["Close"].astype(float)

        if close.isna().any() or (close <= 0).any():
            raise ValueError(
                f"{name} closing prices must be positive and non-missing."
            )

        if data.index.has_duplicates:
            raise ValueError(f"{name} data contains duplicate dates.")

    stock = stock_data[["Close"]].rename(
        columns={"Close": "Stock_Close"}
    )
    benchmark = benchmark_data[["Close"]].rename(
        columns={"Close": "Benchmark_Close"}
    )

    comparison = stock.join(benchmark, how="inner").sort_index()

    if comparison.empty:
        raise ValueError(
            "Stock and benchmark have no overlapping trading dates."
        )

    comparison["Stock_Return"] = (
        comparison["Stock_Close"] / comparison["Stock_Close"].iloc[0] - 1
    )
    comparison["Benchmark_Return"] = (
        comparison["Benchmark_Close"]
        / comparison["Benchmark_Close"].iloc[0]
        - 1
    )
    comparison["Relative_Performance"] = (
        comparison["Stock_Return"] - comparison["Benchmark_Return"]
    )

    return comparison


def calculate_sharpe_ratio(
    data,
    annual_risk_free_rate: float = 0.0,
    periods_per_year: int = 252,
) -> float:
    """Calculate the annualized Sharpe ratio from daily closing prices."""
    import math

    import pandas as pd

    if "Close" not in data.columns:
        raise ValueError("Market data must contain a 'Close' column.")

    if periods_per_year <= 0:
        raise ValueError("periods_per_year must be positive.")

    if annual_risk_free_rate <= -1:
        raise ValueError("annual_risk_free_rate must be greater than -1.")

    close = pd.to_numeric(data["Close"], errors="coerce")

    if close.isna().any() or not close.map(math.isfinite).all():
        raise ValueError("Closing prices must be finite and non-missing.")

    if (close <= 0).any():
        raise ValueError("Closing prices must be positive.")

    daily_returns = close.pct_change().dropna()

    if len(daily_returns) < 2:
        raise ValueError("At least three closing prices are required.")

    daily_risk_free_rate = (
        (1 + annual_risk_free_rate) ** (1 / periods_per_year) - 1
    )

    excess_returns = daily_returns - daily_risk_free_rate
    daily_volatility = daily_returns.std(ddof=1)

    if daily_volatility == 0 or not math.isfinite(daily_volatility):
        raise ValueError(
            "Sharpe ratio cannot be calculated with zero or invalid volatility."
        )

    sharpe_ratio = (
        excess_returns.mean()
        / daily_volatility
        * math.sqrt(periods_per_year)
    )

    return float(sharpe_ratio)


def calculate_beta_alpha(
    stock_data,
    benchmark_data,
    annual_risk_free_rate: float = 0.0,
    periods_per_year: int = 252,
) -> dict[str, float]:
    """Calculate market beta and annualized alpha from closing prices."""
    import math

    import pandas as pd

    for name, data in (
        ("stock", stock_data),
        ("benchmark", benchmark_data),
    ):
        if "Close" not in data.columns:
            raise ValueError(
                f"{name.capitalize()} data must contain a 'Close' column."
            )

        if data.empty:
            raise ValueError(f"{name.capitalize()} data cannot be empty.")

        if data.index.has_duplicates:
            raise ValueError(
                f"{name.capitalize()} data cannot contain duplicate dates."
            )

    if periods_per_year <= 0:
        raise ValueError("periods_per_year must be positive.")

    if not math.isfinite(annual_risk_free_rate) or annual_risk_free_rate <= -1:
        raise ValueError(
            "annual_risk_free_rate must be finite and greater than -1."
        )

    stock_close = pd.to_numeric(
        stock_data["Close"], errors="coerce"
    )
    benchmark_close = pd.to_numeric(
        benchmark_data["Close"], errors="coerce"
    )

    for name, prices in (
        ("stock", stock_close),
        ("benchmark", benchmark_close),
    ):
        if prices.isna().any() or not prices.map(math.isfinite).all():
            raise ValueError(
                f"{name.capitalize()} closing prices must be finite and non-missing."
            )

        if (prices <= 0).any():
            raise ValueError(
                f"{name.capitalize()} closing prices must be positive."
            )

    aligned = pd.concat(
        [
            stock_close.rename("stock_close"),
            benchmark_close.rename("benchmark_close"),
        ],
        axis=1,
        join="inner",
    ).sort_index()

    returns = aligned.pct_change().dropna()

    if len(returns) < 2:
        raise ValueError(
            "At least three shared closing-price dates are required."
        )

    stock_returns = returns["stock_close"]
    market_returns = returns["benchmark_close"]

    market_variance = market_returns.var(ddof=1)

    if (
        not math.isfinite(market_variance)
        or market_variance <= 0
    ):
        raise ValueError(
            "Beta cannot be calculated with zero or invalid market variance."
        )

    beta = stock_returns.cov(market_returns) / market_variance

    daily_risk_free_rate = (
        (1 + annual_risk_free_rate) ** (1 / periods_per_year) - 1
    )

    daily_alpha = (
        stock_returns
        - daily_risk_free_rate
        - beta * (market_returns - daily_risk_free_rate)
    ).mean()

    alpha_annual = daily_alpha * periods_per_year

    if not math.isfinite(beta) or not math.isfinite(alpha_annual):
        raise ValueError("Beta or alpha calculation produced an invalid result.")

    return {
        "beta": float(beta),
        "alpha_annual": float(alpha_annual),
    }


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
