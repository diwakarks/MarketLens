import { useState } from "react";
import { searchStocks, importStock } from "./api";
import type { StockSearchResult } from "./api";

interface StockSearchProps {
  onStockImported: (ticker: string) => Promise<void>;
}

export default function StockSearch({ onStockImported }: StockSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importingTicker, setImportingTicker] = useState("");
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");

  async function handleSearch() {
    if (query.trim().length < 2) {
      setError("Enter at least two characters.");
      setResults([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      setResults(await searchStocks(query.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stock search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(stock: StockSearchResult) {
    setImportingTicker(stock.ticker);
    setImportError("");
    setImportSuccess("");

    try {
      const result = await importStock(stock);

      await onStockImported(result.ticker);

      setResults((current) =>
        current.map((item) =>
          item.ticker === result.ticker
            ? { ...item, already_added: true }
            : item,
        ),
      );

      setImportSuccess(
        `${result.ticker} added successfully (${result.rows_imported} rows imported).`,
      );
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Stock import failed.",
      );
    } finally {
      setImportingTicker("");
    }
  }

  return (
    <section className="stock-search-panel">
      <h2>Find a stock</h2>
      <p>Search by company name or ticker symbol.</p>

      <div className="stock-search-controls">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleSearch();
          }}
          placeholder="Try TCS, Groww, or Apollo Micro Systems"
          aria-label="Search stocks"
        />

        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={loading}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}

      {results.length > 0 && (
        <ul className="stock-search-results">
          {results.map((stock) => (
            <li key={`${stock.ticker}-${stock.exchange ?? ""}`}>
              <div>
                <strong>{stock.name}</strong>
                <span>
                  {stock.ticker} · {stock.exchange ?? "Exchange unavailable"}
                  {stock.currency ? ` · ${stock.currency}` : ""}
                </span>
              </div>

              <div>
                <span>
                  {stock.already_added
                    ? "Already in MarketLens"
                    : "Not yet added"}
                </span>

                {!stock.already_added && (
                  <button
                    type="button"
                    disabled={Boolean(importingTicker)}
                    onClick={() => void handleImport(stock)}
                  >
                    {importingTicker === stock.ticker
                      ? "Importing..."
                      : "Add to MarketLens"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {importError && <p role="alert">{importError}</p>}
      {importSuccess && <p role="status">{importSuccess}</p>}

      {!loading &&
        query.trim().length >= 2 &&
        results.length === 0 &&
        !error && <p>No instruments found.</p>}
    </section>
  );
}
