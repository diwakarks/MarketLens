
from src.marketlens.database import get_connection

query = """
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('instruments', 'daily_prices')
ORDER BY table_name, ordinal_position;
"""

with get_connection() as connection:
    with connection.cursor() as cursor:
        cursor.execute(query)

        for row in cursor.fetchall():
            print(row)
