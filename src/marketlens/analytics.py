
import math
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
    daily_returns = close.pct_change(fill_method=None).dropna()

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


def calculate_drawdown_recovery(data: pd.DataFrame) -> dict:
    """
    Describe the largest peak-to-trough drawdown and its recovery.

    Recovery occurs when a closing price after the trough reaches or
    exceeds the closing price at the peak. Durations use observed
    trading sessions and calendar days.
    """
    if "Close" not in data.columns:
        raise ValueError("The data must contain a Close column.")

    if data.empty:
        raise ValueError("Cannot analyze an empty dataset.")

    if data.index.has_duplicates:
        raise ValueError("Data cannot contain duplicate dates.")

    close = pd.to_numeric(data["Close"], errors="coerce").sort_index()

    if not np.isfinite(close.to_numpy()).all():
        raise ValueError("Closing prices must be finite and non-missing.")

    if (close <= 0).any():
        raise ValueError("Closing prices must be positive.")

    if len(close) < 2:
        raise ValueError("At least two closing prices are required.")

    drawdown = close / close.cummax() - 1.0
    trough_pos = int(np.argmin(drawdown.to_numpy()))
    maximum_drawdown = float(drawdown.iloc[trough_pos])

    # A zero drawdown is not a peak-to-trough loss event.
    if np.isclose(maximum_drawdown, 0.0):
        return {
            "maximum_drawdown": 0.0,
            "peak_date": None,
            "peak_close": None,
            "trough_date": None,
            "trough_close": None,
            "recovered": None,
            "recovery_date": None,
            "recovery_days": None,
            "recovery_trading_sessions": None,
            "peak_to_trough_days": None,
            "peak_to_trough_trading_sessions": None,
            "status": "no_drawdown",
        }

    # The peak must occur on or before the trough.
    prior_prices = close.iloc[: trough_pos + 1]
    peak_price = prior_prices.max()
    peak_pos = int(
        np.flatnonzero(prior_prices.to_numpy() == peak_price)[-1]
    )

    peak_date = close.index[peak_pos]
    trough_date = close.index[trough_pos]
    peak_close = float(close.iloc[peak_pos])
    trough_close = float(close.iloc[trough_pos])

    # Search strictly after the trough for a close at or above the peak.
    recovery_pos = None
    for pos in range(trough_pos + 1, len(close)):
        if close.iloc[pos] >= peak_close:
            recovery_pos = pos
            break

    recovered = recovery_pos is not None
    recovery_date = close.index[recovery_pos] if recovered else None

    def calendar_days(start, end):
        return int((end.date() - start.date()).days)

    return {
        "maximum_drawdown": maximum_drawdown,
        "peak_date": peak_date.date().isoformat(),
        "peak_close": peak_close,
        "trough_date": trough_date.date().isoformat(),
        "trough_close": trough_close,
        "recovered": recovered,
        "recovery_date": (
            recovery_date.date().isoformat() if recovered else None
        ),
        "recovery_days": (
            calendar_days(peak_date, recovery_date)
            if recovered else None
        ),
        "recovery_trading_sessions": (
            int(recovery_pos - peak_pos)
            if recovered else None
        ),
        "peak_to_trough_days": calendar_days(peak_date, trough_date),
        "peak_to_trough_trading_sessions": int(trough_pos - peak_pos),
        "status": "recovered" if recovered else "not_recovered",
    }


def generate_market_insights(
    stock_data: pd.DataFrame,
    benchmark_data: pd.DataFrame,
    ticker: str,
    benchmark_ticker: str = "^GSPC",
    benchmark_name: str = "S&P 500",
) -> dict:
    """Generate evidence-based stock-versus-benchmark insights."""
    if "Close" not in stock_data.columns:
        raise ValueError("Stock data must contain a Close column.")
    if "Close" not in benchmark_data.columns:
        raise ValueError("Benchmark data must contain a Close column.")

    ticker = ticker.strip().upper()
    benchmark_ticker = benchmark_ticker.strip().upper()
    benchmark_name = benchmark_name.strip()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")
    if not benchmark_ticker or not benchmark_name:
        raise ValueError("Benchmark ticker and name cannot be empty.")

    stock = stock_data[["Close"]].rename(
        columns={"Close": "stock_close"}
    )
    benchmark = benchmark_data[["Close"]].rename(
        columns={"Close": "benchmark_close"}
    )

    aligned = stock.join(benchmark, how="inner").sort_index()

    if len(aligned) < 2:
        raise ValueError(
            "At least two shared trading dates are required."
        )

    prices = aligned[["stock_close", "benchmark_close"]]

    if prices.isna().any().any():
        raise ValueError("Aligned closing prices contain missing values.")

    prices = prices.apply(
        pd.to_numeric, errors="coerce"
    ).astype("float64")

    if not np.isfinite(prices.to_numpy()).all():
        raise ValueError("Closing prices must be finite.")
    if (prices <= 0).any().any():
        raise ValueError("Closing prices must be positive.")

    stock_return = float(
        prices["stock_close"].iloc[-1]
        / prices["stock_close"].iloc[0] - 1
    )
    benchmark_return = float(
        prices["benchmark_close"].iloc[-1]
        / prices["benchmark_close"].iloc[0] - 1
    )
    relative_return = stock_return - benchmark_return

    stock_close = prices[["stock_close"]].rename(
        columns={"stock_close": "Close"}
    )
    benchmark_close = prices[["benchmark_close"]].rename(
        columns={"benchmark_close": "Close"}
    )

    stock_risk = calculate_drawdown_recovery(stock_close)
    benchmark_risk = calculate_drawdown_recovery(benchmark_close)

    insights = [
        {
            "category": "performance",
            "priority": 1,
            "title": (
                "Outperformed the benchmark"
                if relative_return > 0
                else "Underperformed the benchmark"
                if relative_return < 0
                else "Matched the benchmark"
            ),
            "message": (
                f"{ticker} returned {stock_return:.2%}, compared with "
                f"{benchmark_return:.2%} for the {benchmark_name}. "
                f"The difference was {relative_return:+.2%}."
            ),
            "evidence": {
                "stock_return": stock_return,
                "benchmark_return": benchmark_return,
                "relative_return": relative_return,
                "start_date": aligned.index[0].date().isoformat(),
                "end_date": aligned.index[-1].date().isoformat(),
                "shared_trading_dates": len(aligned),
            },
        }
    ]

    drawdown_difference = (
        stock_risk["maximum_drawdown"]
        - benchmark_risk["maximum_drawdown"]
    )

    if (
        stock_risk["status"] != "no_drawdown"
        and benchmark_risk["status"] != "no_drawdown"
    ):
        if drawdown_difference < 0:
            drawdown_title = "Deeper maximum drawdown"
            drawdown_message = (
                f"{ticker}'s maximum drawdown was "
                f"{abs(drawdown_difference):.2%} deeper than the "
                f"{benchmark_name}'s during the selected period."
            )
        elif drawdown_difference > 0:
            drawdown_title = "Shallower maximum drawdown"
            drawdown_message = (
                f"{ticker}'s maximum drawdown was "
                f"{drawdown_difference:.2%} less severe than the "
                f"{benchmark_name}'s during the selected period."
            )
        else:
            drawdown_title = "Equal maximum drawdown"
            drawdown_message = (
                f"{ticker} and the {benchmark_name} had the same "
                "maximum drawdown during the selected period."
            )

        insights.append(
            {
                "category": "drawdown",
                "priority": 2,
                "title": drawdown_title,
                "message": drawdown_message,
                "evidence": {
                    "stock_maximum_drawdown": (
                        stock_risk["maximum_drawdown"]
                    ),
                    "benchmark_maximum_drawdown": (
                        benchmark_risk["maximum_drawdown"]
                    ),
                    "difference_percentage_points": (
                        drawdown_difference
                    ),
                    "stock_peak_date": stock_risk["peak_date"],
                    "stock_trough_date": stock_risk["trough_date"],
                    "benchmark_peak_date": benchmark_risk["peak_date"],
                    "benchmark_trough_date": benchmark_risk["trough_date"],
                },
            }
        )

    if stock_risk["status"] != "no_drawdown":
        if not stock_risk["recovered"]:
            recovery_message = (
                f"{ticker} had not recovered its previous peak by the "
                "end of the selected period."
            )
        else:
            recovery_message = (
                f"{ticker} recovered its previous peak in "
                f"{stock_risk['recovery_days']} calendar days."
            )

        insights.append(
            {
                "category": "recovery",
                "priority": 3,
                "title": "Recovery status",
                "message": recovery_message,
                "evidence": stock_risk,
            }
        )

    insights.sort(key=lambda insight: insight["priority"])

    return {
        "ticker": ticker,
        "benchmark": benchmark_ticker,
        "benchmark_name": benchmark_name,
        "start_date": aligned.index[0].date().isoformat(),
        "end_date": aligned.index[-1].date().isoformat(),
        "shared_trading_dates": len(aligned),
        "insights": insights,
        "disclaimer": (
            "These insights describe historical price performance. "
            "They do not predict future returns or constitute "
            "investment advice."
        ),
    }


def calculate_benchmark_comparison(
    stock_data: pd.DataFrame,
    benchmark_data: pd.DataFrame,
) -> pd.DataFrame:
    """Compare cumulative stock and benchmark returns on shared dates."""
    validated = []

    for name, data in (
        ("Stock", stock_data),
        ("Benchmark", benchmark_data),
    ):
        if data.empty:
            raise ValueError(f"{name} data cannot be empty.")

        if "Close" not in data.columns:
            raise ValueError(f"{name} data must contain a Close column.")

        if data.index.has_duplicates:
            raise ValueError(f"{name} data contains duplicate dates.")

        close = pd.to_numeric(data["Close"], errors="coerce").astype(
            "float64"
        )

        if (
            close.isna().any()
            or not np.isfinite(close.to_numpy()).all()
            or (close <= 0).any()
        ):
            raise ValueError(
                f"{name} closing prices must be finite, positive, "
                "and non-missing."
            )

        validated.append(close.rename(f"{name}_Close"))

    stock = validated[0].to_frame()
    benchmark = validated[1].to_frame()

    comparison = stock.join(benchmark, how="inner").sort_index()

    if comparison.empty:
        raise ValueError(
            "Stock and benchmark have no overlapping trading dates."
        )

    comparison["Stock_Return"] = (
        comparison["Stock_Close"]
        / comparison["Stock_Close"].iloc[0]
        - 1.0
    )
    comparison["Benchmark_Return"] = (
        comparison["Benchmark_Close"]
        / comparison["Benchmark_Close"].iloc[0]
        - 1.0
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

    daily_returns = close.pct_change(fill_method=None).dropna()

    if len(daily_returns) < 2:
        raise ValueError("At least three closing prices are required.")

    daily_risk_free_rate = (
        (1 + annual_risk_free_rate) ** (1 / periods_per_year) - 1
        )

    excess_returns = daily_returns - daily_risk_free_rate
    excess_volatility = excess_returns.std(ddof=1)

    if (
        not math.isfinite(excess_volatility)
        or excess_volatility <= 0
    ):
        raise ValueError(
            "Sharpe ratio cannot be calculated with zero or invalid volatility."
        )

    sharpe_ratio = (
        excess_returns.mean()
        / excess_volatility
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

    returns = aligned.pct_change(fill_method=None).dropna(how="any")
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


def _prepare_risk_metric_returns(
    data: pd.DataFrame,
    confidence_level: float,
) -> pd.Series:
    """Validate closing prices and return daily percentage returns."""
    if "Close" not in data.columns:
        raise ValueError("Data must contain a 'Close' column.")

    if not 0 < confidence_level < 1:
        raise ValueError("Confidence level must be between 0 and 1.")

    if data.empty or len(data) < 2:
        raise ValueError("At least two closing prices are required.")

    if data.index.has_duplicates:
        raise ValueError("Data must not contain duplicate dates.")

    prices = pd.to_numeric(data["Close"], errors="coerce")

    if not np.isfinite(prices.to_numpy()).all():
        raise ValueError("Closing prices must be finite and non-missing.")

    if (prices <= 0).any():
        raise ValueError("Closing prices must be positive.")

    returns = prices.pct_change(fill_method=None).dropna()

    if returns.empty:
        raise ValueError("Insufficient data to calculate returns.")

    return returns


def calculate_value_at_risk(
    data,
    confidence_level: float = 0.95,
) -> float:
    """
    Calculate historical Value at Risk (VaR) from daily closing prices.

    Returns:
        A decimal representing the estimated loss threshold.
        Example: 0.02 means 2% VaR.

    The calculation uses the historical return quantile at
    (1 - confidence_level).
    """
    daily_returns = _prepare_risk_metric_returns(
        data,
        confidence_level,
    )

    return float(-daily_returns.quantile(1 - confidence_level))

def calculate_expected_shortfall(
    data,
    confidence_level: float = 0.95,
) -> float:
    """
    Calculate historical Expected Shortfall from daily closing prices.

    Returns a decimal loss measure. For example, 0.03 means
    a 3% average loss in the worst historical return tail.
    """
    returns = _prepare_risk_metric_returns(
        data,
        confidence_level,
    )

    threshold = returns.quantile(1 - confidence_level)
    tail_returns = returns[returns <= threshold]

    if tail_returns.empty:
        raise ValueError("Insufficient tail observations to calculate expected shortfall.")

    return float(-tail_returns.mean())

def _build_close_series(
    market_data: dict[str, pd.DataFrame],
    *,
    normalize_dates: bool = False,
) -> list[pd.Series]:
    """Validate asset closing prices and return sorted close-price series."""
    close_series = []

    for ticker, data in market_data.items():
        if "Close" not in data.columns:
            raise ValueError(f"{ticker} data must contain a Close column.")

        if data.empty or data.index.has_duplicates:
            raise ValueError(
                f"{ticker} data must be non-empty with unique dates."
            )

        close = pd.to_numeric(data["Close"], errors="coerce").sort_index()

        if not np.isfinite(close.to_numpy()).all() or (close <= 0).any():
            raise ValueError(
                f"{ticker} closing prices must be finite and positive."
            )

        if normalize_dates:
            close.index = pd.to_datetime(close.index)

            if close.index.tz is not None:
                close.index = close.index.tz_localize(None)

            close.index = close.index.normalize()

        close_series.append(close.rename(ticker))

    return close_series


def calculate_portfolio_analytics(
    market_data: dict[str, pd.DataFrame],
    weights: dict[str, float],
    initial_value: float = 10_000.0,
    risk_free_rate: float = 0.0,
) -> dict:
    """
    Analyze a fixed-weight, daily-rebalanced portfolio.

    Weights are rebalanced to their target values each trading day.
    Returns and risk metrics use dates shared by all assets.
    """
    if not market_data:
        raise ValueError("At least one portfolio asset is required.")

    if set(market_data) != set(weights):
        raise ValueError(
            "Portfolio weights must match the supplied market-data tickers."
        )

    tickers = list(market_data)
    normalized_weights = {}

    for ticker in tickers:
        weight = weights[ticker]

        if isinstance(weight, bool) or not isinstance(weight, (int, float)):
            raise ValueError("Portfolio weights must be numeric.")

        if not np.isfinite(weight) or weight < 0:
            raise ValueError(
                "Portfolio weights must be finite and non-negative."
            )

        normalized_weights[ticker] = float(weight)

    if not np.isclose(sum(normalized_weights.values()), 1.0):
        raise ValueError("Portfolio weights must sum to 1.0 (100%).")

    if not np.isfinite(initial_value) or initial_value <= 0:
        raise ValueError("Initial portfolio value must be positive and finite.")

    if not np.isfinite(risk_free_rate) or risk_free_rate < 0:
        raise ValueError(
            "Risk-free rate must be finite and non-negative."
        )
    close_series = _build_close_series(market_data)
    prices = pd.concat(close_series, axis=1, join="inner").sort_index()

    if len(prices) < 3:
        raise ValueError(
            "At least three shared trading dates are required."
        )

    asset_returns = prices.pct_change(fill_method=None).dropna(how="any")
    weight_series = pd.Series(normalized_weights)

    # Constant target weights imply daily rebalancing.
    portfolio_returns = asset_returns.dot(weight_series)
    wealth_index = (1.0 + portfolio_returns).cumprod()
    portfolio_values = initial_value * wealth_index

    running_peak = portfolio_values.cummax()
    drawdowns = portfolio_values / running_peak - 1.0

    total_return = float(wealth_index.iloc[-1] - 1.0)
    daily_volatility = float(portfolio_returns.std(ddof=1))
    annualized_volatility = daily_volatility * np.sqrt(252)

    daily_risk_free_rate = (
        (1.0 + risk_free_rate) ** (1.0 / 252) - 1.0
    )
    excess_returns = portfolio_returns - daily_risk_free_rate
    excess_volatility = float(excess_returns.std(ddof=1))

    sharpe_ratio = (
        float(excess_returns.mean() / excess_volatility * np.sqrt(252))
        if excess_volatility > 0
        else None
    )

    max_drawdown_position = int(np.argmin(drawdowns.to_numpy()))
    # ---------------------------------------------------------
    # Portfolio concentration
    # ---------------------------------------------------------
    weight_values = np.array(
        [normalized_weights[ticker] for ticker in tickers],
        dtype=float,
    )

    hhi = float(np.sum(weight_values**2))
    effective_number_of_holdings = (
        float(1.0 / hhi) if hhi > 0 else None
    )

    # ---------------------------------------------------------
    # Asset return correlation
    # ---------------------------------------------------------
    correlation = asset_returns[tickers].corr()

    correlation_matrix = {
        ticker: {
            other_ticker: (
                float(correlation.loc[ticker, other_ticker])
                if pd.notna(correlation.loc[ticker, other_ticker])
                else None
            )
            for other_ticker in tickers
        }
        for ticker in tickers
    }

    # ---------------------------------------------------------
    # Asset-level contribution to portfolio volatility
    # ---------------------------------------------------------
    # Annualize the sample covariance matrix using 252 trading days.
    annualized_covariance = (
        asset_returns[tickers].cov().to_numpy(dtype=float) * 252
    )

    portfolio_variance = float(
        weight_values @ annualized_covariance @ weight_values
    )

    # Guard against tiny negative values caused by floating-point
    # precision. A valid covariance matrix should be positive
    # semidefinite, so materially negative variance is an error.
    if portfolio_variance < -1e-10:
        raise ValueError(
            "Portfolio variance is negative; check the asset return data."
        )

    covariance_portfolio_weights = (
        annualized_covariance @ weight_values
    )
    covariance_portfolio_weights = np.asarray(
        covariance_portfolio_weights,
        dtype=float,
    )

    covariance_portfolio_weights = (
        covariance_portfolio_weights
        if np.isfinite(covariance_portfolio_weights).all()
        else np.full(len(tickers), np.nan)
    )

    covariance_portfolio_weights = np.asarray(
        covariance_portfolio_weights
    )

    covariance_portfolio_weights = np.where(
        np.abs(covariance_portfolio_weights) < 1e-15,
        0.0,
        covariance_portfolio_weights,
    )

    portfolio_risk_volatility = float(
        np.sqrt(max(portfolio_variance, 0.0))
    )

    if portfolio_risk_volatility > 0:
        component_risks = (
            weight_values
            * covariance_portfolio_weights
            / portfolio_risk_volatility
        )
        risk_contribution_percentages = (
            component_risks / portfolio_risk_volatility * 100
        )
    else:
        component_risks = np.zeros(len(tickers), dtype=float)
        risk_contribution_percentages = None

    asset_risk_contributions = {
        ticker: {
            "weight": float(weight_values[index]),
            "annualized_volatility_contribution": float(
                component_risks[index]
            ),
            "risk_contribution_percent": (
                float(risk_contribution_percentages[index])
                if risk_contribution_percentages is not None
                else None
            ),
        }
        for index, ticker in enumerate(tickers)
    }

    return {
        "weights": normalized_weights,
        "initial_value": float(initial_value),
        "final_value": float(portfolio_values.iloc[-1]),
        "total_return": total_return,
        "annualized_volatility": float(annualized_volatility),
        "sharpe_ratio": sharpe_ratio,
        "maximum_drawdown": float(drawdowns.iloc[max_drawdown_position]),
        "maximum_drawdown_date": (
            drawdowns.index[max_drawdown_position].date().isoformat()
        ),
        "start_date": prices.index[0].date().isoformat(),
        "end_date": prices.index[-1].date().isoformat(),
        "shared_trading_dates": len(prices),
        "rebalancing": "daily",
        "concentration": {
            "herfindahl_hirschman_index": hhi,
            "effective_number_of_holdings": (
                effective_number_of_holdings
            ),
        },
        "correlation_matrix": correlation_matrix,
        "asset_risk_contributions": asset_risk_contributions,
        "annualized_covariance_volatility": portfolio_risk_volatility,
        "series": [
            {
                "date": timestamp.date().isoformat(),
                "portfolio_value": float(portfolio_values.iloc[pos]),
                "daily_return": float(portfolio_returns.iloc[pos]),
                "drawdown": float(drawdowns.iloc[pos]),
            }
            for pos, timestamp in enumerate(portfolio_returns.index)
        ],
    }


def _validate_portfolio_weights(
    weights: dict[str, float],
    initial_value: float,
) -> tuple[dict[str, float], float]:
    """Validate portfolio weights and initial value, returning normalized values."""
    if (
        isinstance(initial_value, bool)
        or not isinstance(initial_value, (int, float))
        or not np.isfinite(initial_value)
        or initial_value <= 0
    ):
        raise ValueError(
            "Initial portfolio value must be positive and finite."
        )

    normalized_weights = {}

    for ticker, weight in weights.items():
        if (
            isinstance(weight, bool)
            or not isinstance(weight, (int, float))
            or not np.isfinite(weight)
            or weight < 0
        ):
            raise ValueError(
                "Portfolio weights must be finite and non-negative."
            )

        normalized_weights[ticker] = float(weight)

    if not np.isclose(sum(normalized_weights.values()), 1.0):
        raise ValueError("Portfolio weights must sum to 1.0 (100%).")

    return normalized_weights, float(initial_value)


def calculate_portfolio_scenario(
    weights: dict[str, float],
    shocks: dict[str, float],
    initial_value: float = 10_000.0,
) -> dict:
    """
    Calculate the immediate portfolio impact of hypothetical asset returns.

    Weights are current portfolio weights; shocks are decimal returns
    (for example, -0.20 means a hypothetical 20% decline).

    This is a one-step scenario calculation, not a forecast.
    """
    if not weights:
        raise ValueError("At least one portfolio asset is required.")

    if set(weights) != set(shocks):
        raise ValueError(
            "Scenario shocks must match the supplied portfolio tickers."
        )

    normalized_weights, initial_value = _validate_portfolio_weights(
        weights,
        initial_value,
    )
    normalized_shocks = {}

    for ticker, shock in shocks.items():
        if (
            isinstance(shock, bool)
            or not isinstance(shock, (int, float))
            or not np.isfinite(shock)
            or shock < -1.0
        ):
            raise ValueError(
                "Scenario shocks must be finite returns of at least -100%."
            )

        normalized_shocks[ticker] = float(shock)

    asset_impacts = {}
    portfolio_return = 0.0

    for ticker, weight in normalized_weights.items():
        shock = normalized_shocks[ticker]
        weighted_return = weight * shock
        pnl_impact = float(initial_value * weighted_return)
        portfolio_return += weighted_return

        asset_impacts[ticker] = {
            "weight": weight,
            "shock_return": shock,
            "portfolio_return_contribution": float(weighted_return),
            "pnl_impact": pnl_impact,
        }

    estimated_pnl = float(initial_value * portfolio_return)
    final_value = float(initial_value + estimated_pnl)

    return {
        "initial_value": float(initial_value),
        "final_value": final_value,
        "portfolio_shock_return": float(portfolio_return),
        "estimated_pnl": estimated_pnl,
        "asset_impacts": asset_impacts,
        "scenario_type": "instantaneous_weighted_shock",
        "assumptions": [
            "Each asset receives the user-specified instantaneous return.",
            "Portfolio weights represent allocations immediately before the shock.",
            "No rebalancing occurs during the scenario.",
            "No fees, taxes, slippage, or secondary market effects are modeled.",
        ],
    }


def calculate_historical_portfolio_scenario(
    market_data: dict[str, pd.DataFrame],
    weights: dict[str, float],
    start_date: str,
    end_date: str,
    initial_value: float = 10_000.0,
) -> dict:
    """
    Measure portfolio performance over an observed historical period.

    The portfolio starts at the target weights and is then held without
    rebalancing. The first and last shared trading dates within the
    requested range determine each asset's realized return.
    """
    if not market_data:
        raise ValueError("At least one portfolio asset is required.")

    if set(market_data) != set(weights):
        raise ValueError(
            "Portfolio weights must match the supplied market-data tickers."
        )

    try:
        requested_start = pd.Timestamp(start_date).normalize()
        requested_end = pd.Timestamp(end_date).normalize()
    except (TypeError, ValueError) as exc:
        raise ValueError("Start and end dates must be valid dates.") from exc

    if pd.isna(requested_start) or pd.isna(requested_end):
        raise ValueError("Start and end dates must be valid dates.")

    if requested_start > requested_end:
        raise ValueError("Start date must not be after end date.")

    normalized_weights, initial_value = _validate_portfolio_weights(
        weights,
        initial_value,
    )
    close_series = _build_close_series(market_data)

    prices = pd.concat(close_series, axis=1, join="inner").sort_index()
    prices = prices.loc[
        (prices.index >= requested_start)
        & (prices.index <= requested_end)
    ]

    if len(prices) < 2:
        raise ValueError(
            "At least two shared trading dates are required in the selected period."
        )

    first_prices = prices.iloc[0]
    last_prices = prices.iloc[-1]

    asset_returns = last_prices / first_prices - 1.0

    asset_impacts = {}
    portfolio_return = 0.0

    for ticker, weight in normalized_weights.items():
        asset_return = float(asset_returns[ticker])
        weighted_return = weight * asset_return
        pnl_impact = float(initial_value * weighted_return)
        portfolio_return += weighted_return

        asset_impacts[ticker] = {
            "weight": weight,
            "start_price": float(first_prices[ticker]),
            "end_price": float(last_prices[ticker]),
            "historical_return": asset_return,
            "portfolio_return_contribution": float(weighted_return),
            "pnl_impact": pnl_impact,
        }

    estimated_pnl = float(initial_value * portfolio_return)

    return {
        "weights": normalized_weights,
        "initial_value": float(initial_value),
        "final_value": float(initial_value + estimated_pnl),
        "historical_return": float(portfolio_return),
        "estimated_pnl": estimated_pnl,
        "requested_start_date": requested_start.date().isoformat(),
        "requested_end_date": requested_end.date().isoformat(),
        "actual_start_date": prices.index[0].date().isoformat(),
        "actual_end_date": prices.index[-1].date().isoformat(),
        "shared_trading_dates": len(prices),
        "rebalancing": "none",
        "asset_impacts": asset_impacts,
        "assumptions": [
            "Target weights apply at the beginning of the period.",
            "Holdings are not rebalanced during the period.",
            "Asset returns use the first and last shared trading-date closing prices.",
            "Returns use provider-adjusted prices, which may reflect dividend and stock-split adjustments; dividends are not modeled as separate cash flows.",
            "Fees, taxes, slippage, and other trading effects are not modeled.",
            "Historical outcomes do not predict future performance.",
        ],
    }


def _validate_portfolio_inputs(
    market_data: dict[str, pd.DataFrame],
    weights: dict[str, float],
    initial_value: float,
) -> None:
    """Validate shared portfolio inputs for historical analyses."""
    if not market_data:
        raise ValueError("At least one portfolio asset is required.")

    if set(market_data) != set(weights):
        raise ValueError("Portfolio tickers and weights must match.")

    if not np.isfinite(initial_value) or initial_value <= 0:
        raise ValueError("Initial value must be finite and positive.")

    weight_values = np.asarray(list(weights.values()), dtype=float)

    if (
        not np.isfinite(weight_values).all()
        or (weight_values < 0).any()
        or not np.isclose(weight_values.sum(), 1.0)
    ):
        raise ValueError(
            "Weights must be finite, non-negative, and sum to 1."
        )


def calculate_portfolio_benchmark_comparison(
    market_data: dict[str, pd.DataFrame],
    weights: dict[str, float],
    benchmark_data: pd.DataFrame,
    initial_value: float = 10_000.0,
    benchmark_ticker: str = "^GSPC",
) -> dict:
    """
    Compare a buy-and-hold weighted portfolio with a benchmark.

    Uses one common set of valid trading dates across all holdings and
    the benchmark. Portfolio weights are initial weights; the portfolio
    is not rebalanced during the evaluation period.
    """
    _validate_portfolio_inputs(
        market_data,
        weights,
        initial_value,
    )

    if benchmark_data.empty or "Close" not in benchmark_data.columns:
        raise ValueError("Benchmark data must contain a non-empty Close series.")

    if benchmark_data.index.has_duplicates:
        raise ValueError("Benchmark data contains duplicate dates.")

    benchmark_close = pd.to_numeric(
        benchmark_data["Close"], errors="coerce"
    ).astype("float64").rename("benchmark")

    aligned = []

    for ticker, frame in market_data.items():
        if frame.empty or "Close" not in frame.columns:
            raise ValueError(
                f"{ticker} data must contain a non-empty Close series."
            )

        if frame.index.has_duplicates:
            raise ValueError(f"{ticker} data contains duplicate dates.")

        close = pd.to_numeric(
            frame["Close"], errors="coerce"
        ).astype("float64").rename(ticker)

        aligned.append(close)

    prices = pd.concat(
        aligned + [benchmark_close],
        axis=1,
        join="inner",
    ).sort_index()

    # Do not silently bridge missing prices. Only use dates where every
    # holding and the benchmark have a valid closing price.
    prices = prices.dropna()

    if len(prices) < 2:
        raise ValueError(
            "At least two shared valid trading dates are required "
            "for all holdings and the benchmark."
        )

    if not prices.index.is_unique:
        raise ValueError("Aligned price data must have unique dates.")

    values = prices.to_numpy(dtype="float64")
    if not np.isfinite(values).all() or (values <= 0).any():
        raise ValueError(
            "Aligned closing prices must be finite and positive."
        )

    asset_returns = {
        ticker: float(
            prices[ticker].iloc[-1] / prices[ticker].iloc[0] - 1.0
        )
        for ticker in weights
    }

    portfolio_return = float(
        sum(
            weights[ticker] * asset_returns[ticker]
            for ticker in weights
        )
    )

    benchmark_return = float(
        prices["benchmark"].iloc[-1] / prices["benchmark"].iloc[0] - 1.0
    )

    portfolio_final = initial_value * (1.0 + portfolio_return)
    benchmark_final = initial_value * (1.0 + benchmark_return)

    return {
        "initial_value": float(initial_value),
        "start_date": prices.index[0].date().isoformat(),
        "end_date": prices.index[-1].date().isoformat(),
        "shared_trading_dates": int(len(prices)),
        "portfolio": {
            "return": portfolio_return,
            "final_value": float(portfolio_final),
            "estimated_pnl": float(portfolio_final - initial_value),
        },
        "benchmark": {
            "ticker": benchmark_ticker,
            "name": (
                "NIFTY 50"
                if benchmark_ticker == "^NSEI"
                else "S&P 500"
                if benchmark_ticker == "^GSPC"
                else benchmark_ticker
            ),
            "return": benchmark_return,
            "final_value": float(benchmark_final),
            "estimated_pnl": float(benchmark_final - initial_value),
        },
        "excess_return": float(portfolio_return - benchmark_return),
        "ending_value_difference": float(portfolio_final - benchmark_final),
        "method": "buy_and_hold",
        "assumptions": [
            "Both sides use the same shared start and end dates.",
            "Portfolio weights are initial weights.",
            "The portfolio is not rebalanced during the period.",
            "Returns use provider-adjusted prices, which may reflect dividend and stock-split adjustments; dividends are not modeled as separate cash flows.",
            "Fees, taxes, slippage, and other trading effects are not modeled.",
            "Only dates with valid closing prices for all holdings and the benchmark are used.",
        ],
    }

def calculate_historical_portfolio_stress(
    market_data: dict[str, pd.DataFrame],
    weights: dict[str, float],
    start_date,
    end_date,
    initial_value: float = 10_000.0,
) -> dict:
    """Analyze portfolio losses, drawdown, and recovery in a historical window."""
    _validate_portfolio_inputs(
        market_data,
        weights,
        initial_value,
    )
    start = pd.Timestamp(start_date).normalize()
    end = pd.Timestamp(end_date).normalize()

    # Market data may have UTC-aware timestamps, while API dates are naive.
    # Normalize both to timezone-naive dates before comparing.
    if start.tz is not None:
        start = start.tz_localize(None)

    if end.tz is not None:
        end = end.tz_localize(None)

    if start > end:
        raise ValueError("start_date must be on or before end_date")

    close_series = _build_close_series(
        market_data,
        normalize_dates=True,
    )

    prices = pd.concat(close_series, axis=1, join="inner").sort_index()

    prices = prices.loc[
        (prices.index >= start)
        & (prices.index <= end)
    ]

    start = pd.Timestamp(start_date).normalize()
    end = pd.Timestamp(end_date).normalize()

    prices = prices.loc[
        (prices.index >= start)
        & (prices.index <= end)
    ]

    if len(prices) < 2:
        raise ValueError(
            "At least two shared trading dates are required in this period."
        )

    values = prices.to_numpy(dtype=float)
    if not np.isfinite(values).all() or (values <= 0).any():
        raise ValueError("Aligned closing prices must be finite and positive.")

    # Normalize each holding to its first available close in the window.
    normalized = prices.divide(prices.iloc[0])
    portfolio_value = initial_value * sum(
        weights[ticker] * normalized[ticker]
        for ticker in weights
    )

    running_peak = portfolio_value.cummax()
    drawdown = portfolio_value / running_peak - 1.0

    trough_date = drawdown.idxmin()
    maximum_drawdown = float(drawdown.loc[trough_date])

    # Recovery means returning to the peak value reached before the trough.
    peak_before_trough = float(running_peak.loc[trough_date])
    after_trough = portfolio_value.loc[portfolio_value.index > trough_date]
    recovered = after_trough[after_trough >= peak_before_trough]
    recovery_date = (
        recovered.index[0].date().isoformat() if not recovered.empty else None
    )

    asset_impacts = []
    for ticker, weight in weights.items():
        asset_return = float(
            prices[ticker].iloc[-1] / prices[ticker].iloc[0] - 1
        )
        asset_impacts.append({
            "ticker": ticker,
            "weight": float(weight),
            "historical_return": asset_return,
            "portfolio_return_contribution": float(weight * asset_return),
            "pnl_impact": float(initial_value * weight * asset_return),
        })

    final_value = float(portfolio_value.iloc[-1])

    return {
        "start_date": prices.index[0].date().isoformat(),
        "end_date": prices.index[-1].date().isoformat(),
        "shared_trading_dates": int(len(prices)),
        "initial_value": float(initial_value),
        "final_value": final_value,
        "historical_return": float(final_value / initial_value - 1),
        "estimated_pnl": float(final_value - initial_value),
        "maximum_drawdown": maximum_drawdown,
        "maximum_drawdown_date": trough_date.date().isoformat(),
        "recovery_date": recovery_date,
        "recovered_within_period": recovery_date is not None,
        "asset_impacts": asset_impacts,
        "rebalancing": "none",
        "assumptions": [
            "Initial portfolio weights are held without rebalancing.",
            "Asset prices are aligned on shared trading dates.",
            "The selected period uses the first and last available shared dates.",
            "Returns use provider-adjusted prices, which may reflect dividend and stock-split adjustments; dividends are not modeled as separate cash flows.",
            "Fees, taxes, slippage, and other trading effects are not modeled.",
            "Historical outcomes do not predict future losses or recovery.",
        ],
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
