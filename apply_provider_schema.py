
from pathlib import Path

from src.marketlens.database import get_connection

project_root = Path(__file__).resolve().parent
sql_path = project_root / "sql" / "create_provider_refresh_log.sql"
migration_sql = sql_path.read_text(encoding="utf-8")

with get_connection() as connection:
    with connection.cursor() as cursor:
        cursor.execute(migration_sql)

print("Provider refresh log table created or already exists.")
