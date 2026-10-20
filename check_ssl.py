
import os
import psycopg
from dotenv import load_dotenv

load_dotenv(".env")

database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL is missing from .env")

query = """
SELECT
    i.ticker,
    i.name,
    i.exchange,
    i.currency,
    COUNT(p.trade_date) AS rows_available,
    MAX(p.trade_date) AS latest_trade_date
FROM instruments AS i
LEFT JOIN daily_prices AS p
    ON p.instrument_id = i.id
WHERE i.ticker IN ('^NSEI', '^GSPC')
GROUP BY
    i.ticker,
    i.name,
    i.exchange,
    i.currency
ORDER BY i.ticker;
"""

with psycopg.connect(database_url) as connection:
    with connection.cursor() as cursor:
        cursor.execute(query)
        rows = cursor.fetchall()

        if not rows:
            print("Neither benchmark is registered in the database.")
        else:
            print(
                f"{'TICKER':<10} {'NAME':<25} "
                f"{'EXCHANGE':<10} {'CURRENCY':<10} "
                f"{'ROWS':>8} {'LATEST DATE'}"
            )
            for row in rows:
                print(
                    f"{row[0]:<10} {str(row[1]):<25} "
                    f"{str(row[2]):<10} {str(row[3]):<10} "
                    f"{row[4]:>8} {row[5]}"
                )
