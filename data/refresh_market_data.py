
import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from data.fetch_market_data import fetch_market_data
from src.marketlens.database import import_market_data


def refresh_market_data(ticker: str, period: str) -> bool:
    """Download provider data, then import it into PostgreSQL."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")

    print(f"\nStarting MarketLens refresh for {ticker}")
    print("=" * 45)

    # Stage 1: provider download and validation.
    try:
        history = fetch_market_data(ticker=ticker, period=period)
        print(
            f"\n[PROVIDER SUCCESS] {ticker}: "
            f"{len(history)} validated rows downloaded."
        )
    except Exception as error:
        print(f"\n[PROVIDER FAILED] {type(error).__name__}: {error}")
        print("Database import skipped; existing database data is preserved.")
        return False

    # Stage 2: PostgreSQL import from the validated CSV.
    try:
        rows_imported = import_market_data(ticker)
        print(
            f"\n[DATABASE SUCCESS] {ticker}: "
            f"{rows_imported} rows imported or updated."
        )
    except Exception as error:
        print(f"\n[DATABASE FAILED] {type(error).__name__}: {error}")
        print(
            "The provider download succeeded, but the database import "
            "did not complete successfully."
        )
        return False

    print(f"\n[REFRESH COMPLETE] {ticker}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download, validate, and import MarketLens data."
    )
    parser.add_argument("--ticker", default="AAPL", help="Market ticker")
    parser.add_argument("--period", default="1y", help="Yahoo Finance period")
    args = parser.parse_args()

    try:
        succeeded = refresh_market_data(args.ticker, args.period)
    except ValueError as error:
        print(f"Invalid input: {error}")
        return 2

    return 0 if succeeded else 1


if __name__ == "__main__":
    raise SystemExit(main())
