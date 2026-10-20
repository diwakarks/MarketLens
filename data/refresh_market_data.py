
import argparse
import os
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from data.fetch_market_data import fetch_market_data
from src.marketlens.database import import_market_data

RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"


def refresh_market_data(ticker: str, period: str) -> bool:
    """Stage market data, import it transactionally, then promote its CSV."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")

    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
    active_path = RAW_DATA_DIR / f"{ticker}_daily.csv"

    # Create the candidate in the same directory so os.replace is atomic
    # on the same filesystem.
    fd, staged_name = tempfile.mkstemp(
        prefix=f".{ticker}_",
        suffix="_candidate.csv",
        dir=RAW_DATA_DIR,
    )
    os.close(fd)
    staged_path = Path(staged_name)
    keep_candidate = False

    print(f"\nStarting MarketLens refresh for {ticker}")
    print("=" * 45)

    try:
        # Stage 1: download to a candidate file, not the active CSV.
        try:
            history = fetch_market_data(
                ticker=ticker,
                period=period,
                output_path=staged_path,
            )
            print(
                f"\n[PROVIDER SUCCESS] {ticker}: "
                f"{len(history)} validated rows downloaded."
            )
        except Exception as error:
            print(f"\n[PROVIDER FAILED] {type(error).__name__}: {error}")
            print("The existing CSV and database were not intentionally changed.")
            return False

        # Stage 2: import that exact candidate in PostgreSQL's transaction.
        try:
            rows_imported = import_market_data(
                ticker,
                csv_path=staged_path,
            )
        except Exception as error:
            print(f"\n[DATABASE FAILED] {type(error).__name__}: {error}")
            print("The existing active CSV remains unchanged.")
            return False

        # Stage 3: promote the candidate only after DB import succeeds.
        try:
            os.replace(staged_path, active_path)
        except OSError as error:
            keep_candidate = True
            print(
                "\n[CSV PROMOTION FAILED] PostgreSQL import succeeded, "
                f"but the active CSV could not be replaced: {error}"
            )
            print(f"Candidate retained at: {staged_path}")
            print("Database data may be newer than the active CSV.")
            return False

        print(
            f"\n[DATABASE SUCCESS] {ticker}: "
            f"{rows_imported} rows imported or updated."
        )
        print(f"[CSV SUCCESS] Active file updated: {active_path}")
        print(f"[REFRESH COMPLETE] {ticker}")
        return True

    finally:
        if not keep_candidate:
            staged_path.unlink(missing_ok=True)


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
