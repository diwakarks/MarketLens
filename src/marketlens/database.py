
import os
from pathlib import Path

import pandas as pd
import psycopg
from dotenv import load_dotenv
from psycopg import sql


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"

load_dotenv(PROJECT_ROOT / ".env")


def get_connection() -> psycopg.Connection:
    """Open a connection to the MarketLens PostgreSQL database."""
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is missing. Check the project's .env file."
        )

    return psycopg.connect(database_url)


def import_market_data(ticker: str = "AAPL") -> int:
    """Import historical CSV prices into PostgreSQL safely."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")

    csv_path = RAW_DATA_DIR / f"{ticker}_daily.csv"

    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    data = pd.read_csv(csv_path)

    required_columns = [
        "Date", "Open", "High", "Low", "Close", "Volume"
    ]

    missing = [
        column for column in required_columns
        if column not in data.columns
    ]

    if missing:
        raise ValueError(f"Missing CSV columns: {missing}")

    if data.empty:
        raise ValueError("The CSV contains no market data.")

    # Preserve the exchange's local calendar date from each timestamp.
    data["trade_date"] = pd.to_datetime(
        data["Date"].astype(str).str.slice(0, 10),
        errors="raise",
    ).dt.date

    numeric_columns = ["Open", "High", "Low", "Close", "Volume"]

    for column in numeric_columns:
        data[column] = pd.to_numeric(data[column], errors="raise")

    if data["trade_date"].duplicated().any():
        raise ValueError("Duplicate trading dates found in the CSV.")

    if data[numeric_columns].isna().any().any():
        raise ValueError("Missing numeric values found in the CSV.")

    price_columns = ["Open", "High", "Low", "Close"]

    if (data[price_columns] <= 0).any().any():
        raise ValueError("Prices must be positive.")

    if (data["Volume"] < 0).any():
        raise ValueError("Volume cannot be negative.")

    if (data["High"] < data["Low"]).any():
        raise ValueError("High cannot be lower than Low.")

    if (
        (data["High"] < data["Open"])
        | (data["High"] < data["Close"])
        | (data["Low"] > data["Open"])
        | (data["Low"] > data["Close"])
    ).any():
        raise ValueError("Invalid OHLC price relationships.")

    rows = [
        (
            trade_date,
            float(open_price),
            float(high_price),
            float(low_price),
            float(close_price),
            int(volume),
        )
        for (
            trade_date,
            open_price,
            high_price,
            low_price,
            close_price,
            volume,
        ) in data[
            [
                "trade_date", "Open", "High", "Low",
                "Close", "Volume",
            ]
        ].itertuples(index=False, name=None)
    ]

    # A transaction ensures a failed import does not leave partial data.
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO instruments (ticker, name, exchange, currency)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (ticker)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    exchange = EXCLUDED.exchange,
                    currency = EXCLUDED.currency
                RETURNING id
                """,
                (
                    ticker,
                    "S&P 500 Index" if ticker == "^GSPC" else ticker,
                    "INDEX" if ticker == "^GSPC" else "NASDAQ",
                    "USD",
                ),
            )

            instrument_id = cursor.fetchone()[0]

            cursor.executemany(
                """
                INSERT INTO daily_prices (
                    instrument_id,
                    trade_date,
                    open_price,
                    high_price,
                    low_price,
                    close_price,
                    volume
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (instrument_id, trade_date)
                DO UPDATE SET
                    open_price = EXCLUDED.open_price,
                    high_price = EXCLUDED.high_price,
                    low_price = EXCLUDED.low_price,
                    close_price = EXCLUDED.close_price,
                    volume = EXCLUDED.volume
                """,
                [
                    (instrument_id, *row)
                    for row in rows
                ],
            )

    print(f"Ticker: {ticker}")
    print(f"Rows imported or updated: {len(rows)}")
    print("Database transaction committed successfully.")

    return len(rows)


def load_market_data_from_db(ticker: str = "AAPL") -> pd.DataFrame:
    """Load historical daily prices from PostgreSQL."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")

    query = """
        SELECT
            p.trade_date AS date,
            p.open_price AS "Open",
            p.high_price AS "High",
            p.low_price AS "Low",
            p.close_price AS "Close",
            p.volume AS "Volume"
        FROM daily_prices AS p
        JOIN instruments AS i
            ON i.id = p.instrument_id
        WHERE i.ticker = %s
        ORDER BY p.trade_date ASC;
    """

    with get_connection() as connection:
        data = pd.read_sql_query(
            query,
            connection,
            params=(ticker,),
        )

    if data.empty:
        raise ValueError(
            f"No historical data found in PostgreSQL for {ticker}. "
            "Import the ticker's CSV data first."
        )

    data["date"] = pd.to_datetime(data["date"], errors="raise")
    data = data.set_index("date")
    data.index.name = "Date"

    if data.index.has_duplicates:
        raise ValueError("Duplicate trading dates found in PostgreSQL.")

    return data


def main() -> None:
    import_market_data("AAPL")


if __name__ == "__main__":
    main()
